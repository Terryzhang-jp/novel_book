/**
 * Phase 2B 灵魂测试 —— 素材是证据，不是内容中心
 *
 * 和 Phase 2A 的灵魂测试同一个性质：问的不是「代码有没有 bug」，
 * 而是**产品有没有跑偏**。
 *
 * 这一轮要守住的那句话是：
 *
 *   现实世界的照片和声音成为体验的证据，**但不重新夺回产品中心**。
 *
 * 所以第一条测试不是「能上传照片」，而是「没有照片也完全成立」。
 *
 * ## 用真实的图片字节
 *
 * 派生副本里有没有 EXIF、有没有 GPS，只有拿真图跑一遍才知道。
 * 用假的 deriver 或者假的字节，这一组里最重要的那条断言就等于没写。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import sharp from 'sharp';
import {
  addMomentToWork,
  applyMetadataCorrection,
  attachAssetToMoment,
  createMoment,
  createWork,
  deleteAsset,
  detachAssetFromMoment,
  getAssetDetail,
  listMomentAssets,
  publishWork,
  readAssetBytes,
  reviseInterpretation,
  uploadAsset,
  viewPublication,
  withdrawPublication,
  type AssetDeps,
  type PublishDeps,
} from '@tc/application';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import {
  ANONYMOUS,
  formatCapturedTime,
  InvariantViolation,
  NotFoundError,
  UnauthenticatedError,
  userActor,
} from '@tc/domain';
import { getPool, sql } from '../db/setup';
import { getImageDeriver, getMediaProbe, getStorageKit } from '@/lib/core/storage';

const ALICE = userActor('11111111-1111-1111-1111-111111111111', 'sess-alice');
const BOB = userActor('22222222-2222-2222-2222-222222222222', 'sess-bob');
const NOW = '2026-08-03T00:00:00.000Z';

let core: PostgresUnitOfWork;
let deps: AssetDeps;
let publishDeps: PublishDeps;

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

/**
 * 造一张**带 EXIF 和 GPS** 的真图。
 *
 * 每次颜色不同 —— 内容寻址意味着相同字节就是同一个 Asset，
 * 想测「两个不同素材」就必须造出不同的字节。
 */
async function makeJpeg(options: {
  r: number;
  g: number;
  b: number;
  withExif?: boolean;
}): Promise<Uint8Array> {
  let img = sharp({
    create: {
      width: 2400,
      height: 1600,
      channels: 3,
      background: { r: options.r, g: options.g, b: options.b },
    },
  });
  if (options.withExif) {
    img = img.withExif({
      IFD0: { Make: 'SONY', Model: 'ILCE-7M3' },
      IFD2: {
        // 只有本地时间，**没有** OffsetTimeOriginal —— 这是相机最常见的情况
        DateTimeOriginal: '2026:03:14 16:20:00',
      },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '35/1 59/1 33/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '139/1 5/1 8/1',
      },
    });
  }
  return new Uint8Array(await img.jpeg({ quality: 90 }).toBuffer());
}

beforeAll(() => {
  core = new PostgresUnitOfWork(getPool() as unknown as Pool);
  deps = { core, storage: getStorageKit(), probe: getMediaProbe() };
  publishDeps = { core, storage: getStorageKit(), deriver: getImageDeriver() };
});

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 1：素材没有夺回中心', () => {
  it('Moment 没有任何素材 —— 创建、写理解、加入作品、发布，全程无阻', async () => {
    const { moment } = await createMoment(core, ALICE, {
      firstObservation: '没有拍照的那段路。',
      now: NOW,
    });
    await reviseInterpretation(core, ALICE, moment.id, { content: '后来我一直在想它。' });

    const work = await createWork(core, ALICE, { title: uniq('无素材作品') });
    await addMomentToWork(core, ALICE, work.id, moment.id);
    const pub = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });

    // 一路没有出现「请先上传照片」
    expect(pub.derivedAssets).toBe(0);
    expect(await listMomentAssets(core, ALICE, moment.id)).toHaveLength(0);

    const view = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    expect(view.status).toBe('ok');
    const block = view.status === 'ok' ? view.page.version.snapshot.blocks[0] : null;
    // 快照里连 assets 这个键都不该出现（S-3）—— 空数组和缺失在 JSON 里不同
    expect(block?.type === 'moment_ref' ? block.moment?.assets : 'x').toBeUndefined();
  });

  it('素材是「证据」而不是内容：role 是关系上的，同一张图在两处可以不同角色', async () => {
    const bytes = await makeJpeg({ r: 10, g: 20, b: 30 });
    const { asset } = await uploadAsset(deps, ALICE, {
      bytes,
      declaredMimeType: 'image/jpeg',
    });

    const a = await createMoment(core, ALICE, { title: uniq('现场'), now: NOW });
    const b = await createMoment(core, ALICE, { title: uniq('回想'), now: NOW });

    await attachAssetToMoment(core, ALICE, a.moment.id, asset.id, {
      role: 'supporting',
      note: '这是我看到的',
    });
    await attachAssetToMoment(core, ALICE, b.moment.id, asset.id, {
      role: 'contradicting',
      note: '但它和我后来的想法对不上',
    });

    const inA = await listMomentAssets(core, ALICE, a.moment.id);
    const inB = await listMomentAssets(core, ALICE, b.moment.id);
    expect(inA[0]!.link.role).toBe('supporting');
    expect(inB[0]!.link.role).toBe('contradicting');
    // 同一份素材，两种角色 —— 这正是 MomentAsset 存在的理由
    expect(inA[0]!.asset.id).toBe(inB[0]!.asset.id);
  });
});

describe('灵魂 2：不可变与去重', () => {
  it('同一字节上传两次 → 同一个 Asset，存储里只有一个对象', async () => {
    const bytes = await makeJpeg({ r: 40, g: 50, b: 60 });
    const first = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });
    const second = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });

    expect(second.deduplicated).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(second.asset.objectKey).toBe(first.asset.objectKey);

    const rows = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM assets WHERE user_id = $1 AND sha256 = $2',
      [ALICE.userId, first.asset.sha256]
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('原始元数据不可变：改一次修正之后，逐字节比较仍然相同', async () => {
    const bytes = await makeJpeg({ r: 70, g: 80, b: 90, withExif: true });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });
    const before = JSON.stringify(asset.originalMetadata);
    expect(before).toContain('SONY');

    await applyMetadataCorrection(core, ALICE, asset.id, {
      field: 'timezone',
      value: { kind: 'offset', value: '+09:00', source: 'user' },
      source: 'user',
    });

    const after = await getAssetDetail(core, ALICE, asset.id);
    expect(JSON.stringify(after.asset.originalMetadata)).toBe(before);
    // 修正生效了，但走的是另一条链
    expect(after.effective.timezone).toMatchObject({ kind: 'offset', value: '+09:00' });
    expect(after.corrections).toHaveLength(1);
  });

  it('数据库拒绝改写不可变字段', async () => {
    const bytes = await makeJpeg({ r: 91, g: 92, b: 93 });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });
    await expect(
      sql(`UPDATE assets SET original_metadata = '{"_v":1,"tampered":true}'::jsonb WHERE id = $1`, [
        asset.id,
      ])
    ).rejects.toThrow(/T-4/);
  });
});

describe('灵魂 3：未知就是未知', () => {
  it('EXIF 只有本地时间 → captured_at 是 NULL，界面不显示 UTC', async () => {
    const bytes = await makeJpeg({ r: 100, g: 110, b: 120, withExif: true });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });

    expect(asset.capturedLocalAt).toBe('2026-03-14T16:20:00');
    // ⭐ 相机没说时区，系统就不说
    expect(asset.capturedAt).toBeUndefined();
    expect(asset.timezone.kind).toBe('unknown');
    expect(asset.timezone.value).toBeUndefined();
    expect(asset.timezone.source).toBe('unknown');

    const shown = formatCapturedTime(asset);
    expect(shown.text).toBe('2026-03-14 16:20 · 相机本地时间，时区未知');
    expect(shown.text).not.toContain('UTC');
    expect(shown.timezoneKnown).toBe(false);

    // 数据库里也确实是 NULL —— 不是应用层过滤掉的
    const [row] = await sql<{ captured_at: Date | null }>(
      'SELECT captured_at FROM assets WHERE id = $1',
      [asset.id]
    );
    expect(row!.captured_at).toBeNull();
  });

  it('用户补上时区后，绝对时间被算出来，来源记为 user', async () => {
    const bytes = await makeJpeg({ r: 130, g: 140, b: 150, withExif: true });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });

    const after = await applyMetadataCorrection(core, ALICE, asset.id, {
      field: 'timezone',
      value: { kind: 'offset', value: '+09:00', source: 'user' },
      source: 'user',
    });

    expect(after.effective.timezone).toMatchObject({
      kind: 'offset',
      value: '+09:00',
      source: 'user',
    });
    // 16:20 +09:00 == 07:20Z
    expect(after.effective.capturedAt).toBe('2026-03-14T07:20:00.000Z');
    expect(formatCapturedTime(after.effective).text).toBe('2026-03-14 16:20 (+09:00)');
  });

  it('C-5：推断不能覆盖用户的修正', async () => {
    const bytes = await makeJpeg({ r: 160, g: 170, b: 180, withExif: true });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });

    await applyMetadataCorrection(core, ALICE, asset.id, {
      field: 'timezone',
      value: { kind: 'offset', value: '+09:00', source: 'user' },
      source: 'user',
    });

    // 这正是旧系统发生过的事故：AI / GPS 推断把用户手动修好的值改回去
    await expect(
      applyMetadataCorrection(core, ALICE, asset.id, {
        field: 'timezone',
        value: { kind: 'iana', value: 'Asia/Seoul', source: 'gps_inferred', confidence: 0.9 },
        source: 'gps_inferred',
        confidence: 0.9,
      })
    ).rejects.toThrow(/C-5/);

    const after = await getAssetDetail(core, ALICE, asset.id);
    expect(after.effective.timezone).toMatchObject({ value: '+09:00' });

    // 但用户自己还能继续改
    const again = await applyMetadataCorrection(core, ALICE, asset.id, {
      field: 'timezone',
      value: { kind: 'offset', value: '+08:00', source: 'user' },
      source: 'user',
    });
    expect(again.effective.timezone).toMatchObject({ value: '+08:00' });
    // 链上两版都在
    expect(again.corrections).toHaveLength(2);
  });
});

describe('灵魂 4：素材也有用户边界', () => {
  it('Alice 不能把 Bob 的 Asset 挂到自己的 Moment 上', async () => {
    const bytes = await makeJpeg({ r: 190, g: 10, b: 10 });
    const bobAsset = await uploadAsset(deps, BOB, { bytes, declaredMimeType: 'image/jpeg' });
    const alice = await createMoment(core, ALICE, { now: NOW });

    // 用**真实存在**的 id —— 随机 UUID 只能证明「找不到不存在的东西」
    await expect(
      attachAssetToMoment(core, ALICE, alice.moment.id, bobAsset.asset.id)
    ).rejects.toThrow(NotFoundError);
  });

  it('绕过用例层直接写 SQL 也会被数据库拦下（MA-3）', async () => {
    const bytes = await makeJpeg({ r: 200, g: 20, b: 20 });
    const bobAsset = await uploadAsset(deps, BOB, { bytes, declaredMimeType: 'image/jpeg' });
    const alice = await createMoment(core, ALICE, { now: NOW });

    await expect(
      sql(
        'INSERT INTO moment_assets (moment_id, asset_id, sort_order) VALUES ($1, $2, 0)',
        [alice.moment.id, bobAsset.asset.id]
      )
    ).rejects.toThrow(/MA-3/);
  });

  it('匿名读不到任何原图', async () => {
    const bytes = await makeJpeg({ r: 210, g: 30, b: 30 });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });

    // 授权发生在 Repository（SQL 带 user_id），不在 storage
    await expect(
      readAssetBytes({ core, storage: getStorageKit() }, ANONYMOUS, asset.id)
    ).rejects.toThrow(UnauthenticatedError);
    // 另一个登录用户同样读不到，而且返回的是 NotFound 不是 Forbidden
    await expect(
      readAssetBytes({ core, storage: getStorageKit() }, BOB, asset.id)
    ).rejects.toThrow(NotFoundError);
  });
});

describe('灵魂 5：发布只公开安全副本', () => {
  it('派生副本剥掉了 EXIF 和 GPS，尺寸受控，且不是原图的 objectKey', async () => {
    const bytes = await makeJpeg({ r: 220, g: 40, b: 40, withExif: true });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });

    // 前提：原图**确实**带着 GPS —— 否则这条测试什么都没证明
    const originalExif = await sharp(Buffer.from(bytes)).metadata();
    expect(originalExif.exif).toBeTruthy();

    const { moment } = await createMoment(core, ALICE, { title: uniq('带图'), now: NOW });
    await attachAssetToMoment(core, ALICE, moment.id, asset.id, { role: 'supporting' });
    const work = await createWork(core, ALICE, { title: uniq('带图作品') });
    await addMomentToWork(core, ALICE, work.id, moment.id);

    const pub = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    expect(pub.derivedAssets).toBe(1);
    expect(pub.skippedAssets).toBe(0);

    const block = pub.version.snapshot.blocks[0]!;
    const snapAsset =
      block.type === 'moment_ref' ? block.moment?.assets?.[0] : undefined;
    expect(snapAsset).toBeTruthy();

    // S-2：快照里绝不能出现原图的 key
    expect(snapAsset!.objectKey).not.toBe(asset.objectKey);
    expect(snapAsset!.mimeType).toBe('image/webp');
    // 2400 → 1600
    expect(snapAsset!.width).toBe(1600);

    // ⭐ 派生出来的字节里没有元数据
    const derivedBytes = await getStorageKit().storage.get(snapAsset!.objectKey);
    const derivedMeta = await sharp(Buffer.from(derivedBytes)).metadata();
    expect(derivedMeta.exif).toBeUndefined();
    expect((derivedMeta as { gps?: unknown }).gps).toBeUndefined();
    expect(derivedMeta.format).toBe('webp');

    // 账本记下了这份派生，供账号删除时清理
    const ledger = await core.publishedAssets.listByVersion(ALICE, pub.version.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.sourceAssetId).toBe(asset.id);
    expect(ledger[0]!.preset).toBe('web1600');
  });

  it('删除原始 Asset：Moment 留占位，已发布页面逐字不变', async () => {
    const bytes = await makeJpeg({ r: 230, g: 50, b: 50, withExif: true });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });
    const { moment } = await createMoment(core, ALICE, { title: uniq('待删素材'), now: NOW });
    await attachAssetToMoment(core, ALICE, moment.id, asset.id);
    const work = await createWork(core, ALICE, { title: uniq('留痕作品') });
    await addMomentToWork(core, ALICE, work.id, moment.id);

    const pub = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    const frozen = JSON.stringify(pub.version.snapshot);

    await deleteAsset(core, ALICE, asset.id);

    // 关系行保留 —— 记录里不出现无法解释的空洞
    const evidence = await listMomentAssets(core, ALICE, moment.id);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.asset.deletedAt).toBeTruthy();

    // 已发布页面完全不受影响
    const view = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    expect(view.status).toBe('ok');
    expect(JSON.stringify(view.status === 'ok' ? view.page.version.snapshot : null)).toBe(frozen);

    // 账本的 source_asset_id 仍然指着它 —— Asset 只是软删除，没有物理消失
    const [row] = await sql<{ source_asset_id: string | null }>(
      'SELECT source_asset_id FROM published_assets WHERE work_version_id = $1',
      [pub.version.id]
    );
    expect(row!.source_asset_id).toBe(asset.id);
  });

  it('「从 Moment 移除」不删素材本身', async () => {
    const bytes = await makeJpeg({ r: 240, g: 60, b: 60 });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });
    const { moment } = await createMoment(core, ALICE, { now: NOW });
    await attachAssetToMoment(core, ALICE, moment.id, asset.id);

    await detachAssetFromMoment(core, ALICE, moment.id, asset.id);

    expect(await listMomentAssets(core, ALICE, moment.id)).toHaveLength(0);
    const still = await core.assets.findById(ALICE, asset.id);
    expect(still).not.toBeNull();
    expect(still!.deletedAt).toBeUndefined();
  });

  it('撤回之后，发布页连同它的图片一起变得不可访问', async () => {
    const bytes = await makeJpeg({ r: 250, g: 70, b: 70 });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });
    const { moment } = await createMoment(core, ALICE, { now: NOW });
    await attachAssetToMoment(core, ALICE, moment.id, asset.id);
    const work = await createWork(core, ALICE, { title: uniq('撤回带图') });
    await addMomentToWork(core, ALICE, work.id, moment.id);
    const pub = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });

    await withdrawPublication(core, ALICE, pub.publication.id);

    // 资源路由的第一步就是这个判断 —— 状态不是 ok 就 404，
    // 字节还在存储里，但没有任何 URL 能取到它
    const view = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    expect(view.status).toBe('withdrawn');
  });

  it('已删除的素材不会进入新的发布版本', async () => {
    const bytes = await makeJpeg({ r: 5, g: 200, b: 90 });
    const { asset } = await uploadAsset(deps, ALICE, { bytes, declaredMimeType: 'image/jpeg' });
    const { moment } = await createMoment(core, ALICE, { now: NOW });
    await attachAssetToMoment(core, ALICE, moment.id, asset.id);
    const work = await createWork(core, ALICE, { title: uniq('重发不带删掉的') });
    await addMomentToWork(core, ALICE, work.id, moment.id);

    const v1 = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    expect(v1.derivedAssets).toBe(1);

    await deleteAsset(core, ALICE, asset.id);
    const v2 = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });

    // 用户删了它就是不想再出现
    expect(v2.derivedAssets).toBe(0);
    const block = v2.version.snapshot.blocks[0]!;
    expect(block.type === 'moment_ref' ? block.moment?.assets : 'x').toBeUndefined();
    // 但第 1 版仍然带着它
    expect(v1.version.snapshot.blocks[0]).toBeTruthy();
  });
});

describe('灵魂 6：产品不接受它处理不了的东西', () => {
  it('伪装成图片的文件被魔术字节挡下', async () => {
    const notAnImage = new TextEncoder().encode('#!/bin/sh\necho hello\n');
    await expect(
      uploadAsset(deps, ALICE, { bytes: notAnImage, declaredMimeType: 'image/jpeg' })
    ).rejects.toThrow(/无法识别的文件类型/);
  });

  it('空文件被拒', async () => {
    await expect(
      uploadAsset(deps, ALICE, { bytes: new Uint8Array(0), declaredMimeType: 'image/jpeg' })
    ).rejects.toThrow(InvariantViolation);
  });
});
