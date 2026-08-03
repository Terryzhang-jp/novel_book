/**
 * Phase 3A 灵魂测试 —— **系统不再产生新的遗留数据**
 *
 * Phase 3A 的目标是一句可判定的话：
 *
 *   从某个明确的 commit 起，系统不再产生任何新的 Legacy Photo
 *   和 Legacy Storage 数据。
 *
 * 这个文件是那句话的判定程序。三层保护，每一层单独证明：
 *
 *   静态   scripts/check-architecture.mjs 挡住新增的写入代码（单元测试覆盖）
 *   接口   PhotoRepository 上没有写方法（编译期）
 *   数据库 trg_guard_legacy_photo_write 拒绝一切未点名的 INSERT / UPDATE  ← 这里
 *
 * 前两层挡住的是「有人不小心写了」。这一层挡住的是「不管用什么方式，
 * 它就是写不进去」—— 包括运维脚本、psql 会话、以及将来某个还不存在的
 * 后台任务。
 *
 * ## 为什么这些断言要直接打 SQL
 *
 * 因为要证明的正是**绕过应用层也不行**。通过 Repository 去测，
 * 证明的只是 Repository 没提供入口。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import sharp from 'sharp';
import {
  listAssetDetails,
  uploadAsset,
  type AssetDeps,
} from '@tc/application';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import { ForbiddenError, userActor } from '@tc/domain';
import { getPool, sql, withLegacyPhotoWrite } from '../db/setup';
import { getMediaProbe, getStorageKit } from '@/lib/core/storage';
import { mapAssetToLegacyPhotoDto } from '@tc/legacy-adapters';

const ALICE = userActor('11111111-1111-1111-1111-111111111111', 'sess-alice');
const SEED_PHOTO = 'a0000000-0000-0000-0000-000000000001';

let core: PostgresUnitOfWork;
let assetDeps: AssetDeps;

let seq = 0;

/** 每次不同的字节 —— 内容寻址下相同字节就是同一个 Asset */
async function makeJpeg(): Promise<Uint8Array> {
  seq += 1;
  return new Uint8Array(
    await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: { r: seq % 256, g: (seq * 7) % 256, b: (seq * 13) % 256 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer()
  );
}

async function countPhotos(): Promise<number> {
  const [row] = await sql<{ n: string }>('SELECT count(*)::text AS n FROM photos');
  return Number(row!.n);
}

beforeAll(() => {
  core = new PostgresUnitOfWork(getPool() as unknown as Pool);
  assetDeps = { core, storage: getStorageKit(), probe: getMediaProbe() };
});

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 1：photos 表写不进去了', () => {
  it('直接 INSERT → 被拒绝', async () => {
    await expect(
      sql(
        `INSERT INTO photos (id, user_id, file_name, original_name, file_url, metadata, category)
         VALUES (gen_random_uuid(), $1, 'x.jpg', 'x.jpg', 'http://example/x.jpg',
                 '{"fileSize":1,"mimeType":"image/jpeg"}'::jsonb, 'neither')`,
        [ALICE.userId]
      )
    ).rejects.toThrow(/禁止写入遗留 photos 表/);
  });

  it('直接 UPDATE → 被拒绝', async () => {
    await expect(
      sql(`UPDATE photos SET title = 'hacked' WHERE id = $1`, [SEED_PHOTO])
    ).rejects.toThrow(/禁止写入遗留 photos 表/);
  });

  it('不带 WHERE 的全表 UPDATE → 同样被拒绝', async () => {
    // 这一条是「点名授权 vs 布尔开关」的核心差别：
    // 布尔开关一旦打开，这条语句会改光整张表。
    await expect(sql(`UPDATE photos SET is_public = TRUE`)).rejects.toThrow(
      /禁止写入遗留 photos 表/
    );
    const [row] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM photos WHERE is_public IS TRUE'
    );
    expect(Number(row!.n)).toBe(0);
  });

  it('给了 A 的授权，却想改 B → 被拒绝', async () => {
    // 一次授权只放行一行。这是整个机制的重点。
    const other = 'a0000000-0000-0000-0000-000000000002';
    await expect(
      withLegacyPhotoWrite(SEED_PHOTO, (c) =>
        c.query(`UPDATE photos SET title = 'wrong-row' WHERE id = $1`, [other])
      )
    ).rejects.toThrow(/禁止写入遗留 photos 表/);

    const [row] = await sql<{ title: string | null }>(
      'SELECT title FROM photos WHERE id = $1',
      [other]
    );
    expect(row!.title).toBeNull();
  });

  it('点名授权之后可以改**那一行**（逃生口确实存在）', async () => {
    await withLegacyPhotoWrite(SEED_PHOTO, (c) =>
      c.query(`UPDATE photos SET title = 'fixed-by-ops' WHERE id = $1`, [SEED_PHOTO])
    );
    const [row] = await sql<{ title: string }>('SELECT title FROM photos WHERE id = $1', [
      SEED_PHOTO,
    ]);
    expect(row!.title).toBe('fixed-by-ops');

    // 复原，免得影响同一个库里的其它测试
    await withLegacyPhotoWrite(SEED_PHOTO, (c) =>
      c.query(`UPDATE photos SET title = NULL WHERE id = $1`, [SEED_PHOTO])
    );
  });

  it('授权是事务本地的：事务结束后立刻失效', async () => {
    // 这是最容易写错的一点。set_config 的第三个参数写 false 的话，
    // 授权会留在连接上，而连接来自池子 —— 下一个请求会捡到它，
    // 而且是随机的、极难复现的那种「有时候能写进去」。
    const id = randomUUID();
    await withLegacyPhotoWrite(id, async () => {
      /* 什么都不做，只是让授权在这个事务里生效过 */
    });

    // 同一个池、很可能是同一条连接
    await expect(
      sql(
        `INSERT INTO photos (id, user_id, file_name, original_name, file_url, metadata, category)
         VALUES ($1, $2, 'x.jpg', 'x.jpg', 'http://example/x.jpg',
                 '{"fileSize":1,"mimeType":"image/jpeg"}'::jsonb, 'neither')`,
        [id, ALICE.userId]
      )
    ).rejects.toThrow(/禁止写入遗留 photos 表/);
  });

  it('DELETE 仍然放行 —— 否则「你的东西你能删掉」在旧表上失效', async () => {
    // 账号永久删除依赖 photos.user_id 上的 ON DELETE CASCADE。
    // 挡住 DELETE 比多留几行旧数据严重得多（和 15B 同一个判断：
    // 减少内容的操作始终放行）。
    await expect(
      sql(`DELETE FROM photos WHERE id = '00000000-0000-0000-0000-0000000000ff'`)
    ).resolves.toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 2：旧入口的上传落进 assets，不落进 photos', () => {
  it('uploadAsset 之后 assets 多一行，photos 一行不多', async () => {
    const before = await countPhotos();

    const { asset } = await uploadAsset(assetDeps, ALICE, {
      bytes: await makeJpeg(),
      declaredMimeType: 'image/jpeg',
    });

    const [row] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM assets WHERE id = $1',
      [asset.id]
    );
    expect(Number(row!.n)).toBe(1);
    expect(await countPhotos()).toBe(before);
  });

  it('新素材出现在旧 Gallery 的只读投影里', async () => {
    // 16C 的验收点：旧页面一行没改，但它看到的是新 Asset。
    const { asset } = await uploadAsset(assetDeps, ALICE, {
      bytes: await makeJpeg(),
      declaredMimeType: 'image/jpeg',
    });

    const details = await listAssetDetails(core, ALICE, { limit: 500 });
    const mine = details.find((d) => d.asset.id === asset.id);
    expect(mine).toBeDefined();

    const dto = mapAssetToLegacyPhotoDto(mine!.asset, mine!.effective, {
      original: (id) => `/api/studio/assets/${id}/raw`,
      thumbnail: (id) => `/api/studio/assets/${id}/preview?size=thumb`,
    });

    // 旧 UI 真正会读的那几个字段都在
    expect(dto.id).toBe(asset.id);
    expect(dto.fileUrl).toContain(asset.id);
    expect(dto.thumbnailUrl).toContain(asset.id);
    expect(dto.metadata.mimeType).toBe('image/jpeg');
    expect(dto.metadata.dimensions).toEqual({ width: 80, height: 60 });
    // ⭐ 投影出来的东西永远是私有的
    expect(dto.isPublic).toBe(false);
  });

  it('投影出来的 URL 都指向走鉴权的路由，不含对象 key', async () => {
    // ADR-002：拿到 URL 不等于有权取件。URL 里出现 objectKey 就意味着
    // 「知道 key 的人能直接取」，而 key 是会从日志和分享链接里泄露的。
    const { asset } = await uploadAsset(assetDeps, ALICE, {
      bytes: await makeJpeg(),
      declaredMimeType: 'image/jpeg',
    });
    const details = await listAssetDetails(core, ALICE, { limit: 500 });
    const mine = details.find((d) => d.asset.id === asset.id)!;
    const dto = mapAssetToLegacyPhotoDto(mine.asset, mine.effective, {
      original: (id) => `/api/studio/assets/${id}/raw`,
      thumbnail: (id) => `/api/studio/assets/${id}/preview?size=thumb`,
    });

    expect(dto.fileUrl).not.toContain(asset.objectKey);
    expect(dto.fileUrl).not.toContain(asset.sha256);
    expect(dto.thumbnailUrl).not.toContain(asset.sha256);
  });
});

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 3：非 active 账号从旧入口也写不进来', () => {
  /**
   * 15E 已经证明了「拒绝发生在写字节之前」。这里要补的是**入口维度**：
   * 旧 Gallery 的上传路径现在和 Studio 走同一个用例，所以那道拒绝
   * 对它同样成立 —— 不存在「换一个 URL 就绕过去了」。
   */
  async function makeUser(prefix: string): Promise<string> {
    const id = randomUUID();
    await sql(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, false, now(), now())`,
      [id, prefix, `${prefix}-${id}@example.test`]
    );
    return id;
  }

  it('disabled 账号走旧上传路径 → 既没有 Asset 也没有字节', async () => {
    const userId = await makeUser('frozen');
    await sql(`UPDATE "user" SET status = 'disabled', status_changed_at = now() WHERE id = $1`, [
      userId,
    ]);
    const actor = userActor(userId, 'sess-frozen');

    const bytes = await makeJpeg();
    const wouldBeKey = getStorageKit().buildObjectKey(userId, bytes, 'image/jpeg');

    await expect(
      uploadAsset(assetDeps, actor, { bytes, declaredMimeType: 'image/jpeg' })
    ).rejects.toBeInstanceOf(ForbiddenError);

    // 关键断言：字节根本没落盘。
    // 只断言「数据库里没有行」是不够的 —— 那种情况下磁盘上会留一个
    // 任何表都查不到的孤儿对象。
    expect(await getStorageKit().storage.exists(wouldBeKey)).toBe(false);

    const [row] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM assets WHERE user_id = $1',
      [userId]
    );
    expect(Number(row!.n)).toBe(0);
  });
});
