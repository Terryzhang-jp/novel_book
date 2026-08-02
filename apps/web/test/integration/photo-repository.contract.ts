/**
 * PhotoRepository 契约测试套件
 *
 * 这是一份**可复用的规格**：任何 PhotoRepository 实现都要跑它。
 * 现在只有 PostgresPhotoRepository 通过；将来的 Supabase legacy adapter
 * 接进来时用同一套，不写第二份断言。
 *
 * ## 三条设计纪律
 *
 * 1. **断言返回对象，不是数据库列。**
 *    旧 Gallery 的 bug 是「数据库有字段，但 Repository 映射丢了」。
 *    只查 `SELECT metadata FROM photos` 永远抓不到它。
 *
 * 2. **跨用户测试用已知存在的他人 ID。**
 *    「列表里没有」不能证明安全 —— 可能只是测试数据没命中。
 *
 * 3. **失败必须能定位。** 每条断言都对应一个具体的历史故障或 ADR 条款。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundError, userActor, ANONYMOUS, systemActor } from '@tc/domain';
import type { PhotoRepository } from '@tc/legacy-adapters';
import type { Photo } from '@tc/legacy-adapters';

/** seed 里的固定身份 */
export const ALICE = '11111111-1111-1111-1111-111111111111';
export const BOB = '22222222-2222-2222-2222-222222222222';
/** seed 里 Alice 的一张照片，绑了地点、有 EXIF 时间 */
export const ALICE_PHOTO_WITH_LOCATION = 'a0000000-0000-0000-0000-000000000001';
export const ALICE_LOCATION = '10000000-0000-0000-0000-000000000001';
/** seed 里 Bob 的唯一一张照片 */
export const BOB_PHOTO = 'b0000000-0000-0000-0000-000000000001';
/** seed 里 Alice 在回收站的照片 */
export const ALICE_TRASHED_PHOTO = 'a0000000-0000-0000-0000-000000000009';

export const alice = userActor(ALICE, 'sess-alice');
export const bob = userActor(BOB, 'sess-bob');

const sampleMetadata = {
  dateTime: '2025-09-20T10:00:00.000Z',
  location: { latitude: 35.99, longitude: 139.08, source: 'exif' as const },
  dimensions: { width: 100, height: 100 },
  fileSize: 12345,
  mimeType: 'image/jpeg',
};

function newPhotoInput(name: string) {
  return {
    fileName: `${name}.jpg`,
    originalName: `${name}-orig.jpg`,
    fileUrl: `http://example.test/${name}.jpg`,
    metadata: sampleMetadata,
    category: 'time-location' as const,
  };
}

/**
 * 运行契约。
 *
 * @param implName    实现名，出现在测试标题里
 * @param getRepo     取得实例。每个测试前调用一次。
 * @param resetSeed   把数据库恢复到 seed 状态（可选，但强烈建议 —— 否则
 *                    写操作会互相污染，产生顺序依赖）
 */
export function runPhotoRepositoryContract(
  implName: string,
  getRepo: () => PhotoRepository,
  resetSeed: () => Promise<void>
): void {
  describe(`PhotoRepository 契约 · ${implName}`, () => {
    let repo: PhotoRepository;

    beforeEach(async () => {
      await resetSeed();
      repo = getRepo();
    });

    // ════════════════════════════════════════════════════════════════════════
    describe('返回对象的完整性（Gallery 回归）', () => {
      /**
       * 这一组直接对应审计发现的两个线上 bug：
       *   · 地点筛选永远返回 0 张（locationId 丢了）
       *   · 时间聚类完全失效（metadata 丢了）
       * 根因是 `as Photo` 掩盖了 SELECT 漏列。
       */

      it('list() 返回的对象带 metadata.dateTime —— 时间聚类的输入', async () => {
        const photos = await repo.list(alice);
        const withTime = photos.filter((p) => p.metadata?.dateTime);
        expect(withTime.length).toBeGreaterThan(0);
        expect(typeof withTime[0]!.metadata.dateTime).toBe('string');
      });

      it('list() 返回的对象带 metadata.location —— 地图的输入', async () => {
        const photos = await repo.list(alice);
        const withGeo = photos.filter((p) => p.metadata?.location);
        expect(withGeo.length).toBeGreaterThan(0);
        expect(typeof withGeo[0]!.metadata.location!.latitude).toBe('number');
      });

      it('list() 返回的对象带 locationId —— 地点筛选的输入', async () => {
        const photos = await repo.list(alice);
        const bound = photos.filter((p) => p.locationId);
        expect(bound.length).toBeGreaterThan(0);
        expect(bound.some((p) => p.locationId === ALICE_LOCATION)).toBe(true);
      });

      it('list() 不带分类筛选时也返回完整对象（默认视图正是出 bug 的地方）', async () => {
        const [photo] = await repo.list(alice, { limit: 1 });
        expect(photo).toBeDefined();
        expect(photo).toMatchObject({
          id: expect.any(String),
          userId: ALICE,
          fileName: expect.any(String),
          originalName: expect.any(String),
          fileUrl: expect.any(String),
          category: expect.any(String),
          isPublic: expect.any(Boolean),
          trashed: expect.any(Boolean),
          edited: expect.any(Boolean),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        });
        expect(photo!.metadata).toBeDefined();
      });

      it('带分类筛选与不带筛选，返回对象的形状一致', async () => {
        const [plain] = await repo.list(alice, { limit: 1, category: 'time-location' });
        const [filtered] = await repo.list(alice, { limit: 1 });
        // 旧系统这两条路径走不同的 SELECT，字段集合不同 —— 这正是 bug 来源
        expect(Object.keys(plain!).sort()).toEqual(Object.keys(filtered!).sort());
      });

      it('findById() 返回完整对象', async () => {
        const photo = await repo.findById(alice, ALICE_PHOTO_WITH_LOCATION);
        expect(photo).not.toBeNull();
        expect(photo!.locationId).toBe(ALICE_LOCATION);
        expect(photo!.metadata.dateTime).toBeTruthy();
        expect(photo!.metadata.location).toBeDefined();
      });

      it('thumbnailUrl 为空时是 undefined，不是字符串 "null"', async () => {
        const photos = await repo.list(alice, { limit: 50 });
        const noThumb = photos.find((p) => !p.thumbnailUrl);
        expect(noThumb).toBeDefined();
        expect(noThumb!.thumbnailUrl).toBeUndefined();
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    describe('跨用户隔离（用已知存在的他人 ID）', () => {
      /**
       * ADR-001：不接受「列表里没有」作为通过条件。
       * 下面每条都用 seed 里**确实存在**的他人 id。
       */

      it('前置：这些 id 确实存在（否则下面的测试没有意义）', async () => {
        expect(await repo.findById(alice, ALICE_PHOTO_WITH_LOCATION)).not.toBeNull();
        expect(await repo.findById(bob, BOB_PHOTO)).not.toBeNull();
      });

      it('Bob findById Alice 的照片 → null（不可与「不存在」区分）', async () => {
        expect(await repo.findById(bob, ALICE_PHOTO_WITH_LOCATION)).toBeNull();
      });

      it('Bob findById 一个真的不存在的 id → 同样是 null', async () => {
        expect(await repo.findById(bob, '00000000-0000-0000-0000-0000000000ff')).toBeNull();
      });

      it('Bob setLocation Alice 的照片 → NotFoundError', async () => {
        await expect(
          repo.setLocation(bob, ALICE_PHOTO_WITH_LOCATION, null)
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it('Bob trash Alice 的照片 → NotFoundError，且照片没被改动', async () => {
        await expect(repo.trash(bob, ALICE_PHOTO_WITH_LOCATION)).rejects.toBeInstanceOf(
          NotFoundError
        );
        const still = await repo.findById(alice, ALICE_PHOTO_WITH_LOCATION);
        expect(still!.trashed).toBe(false);
      });

      it('Bob restore Alice 在回收站的照片 → NotFoundError，且仍在回收站', async () => {
        await expect(repo.restore(bob, ALICE_TRASHED_PHOTO)).rejects.toBeInstanceOf(
          NotFoundError
        );
        const still = await repo.findById(alice, ALICE_TRASHED_PHOTO);
        expect(still!.trashed).toBe(true);
      });

      it('Bob purge Alice 的照片 → NotFoundError，且照片还在', async () => {
        await expect(repo.purge(bob, ALICE_PHOTO_WITH_LOCATION)).rejects.toBeInstanceOf(
          NotFoundError
        );
        expect(await repo.findById(alice, ALICE_PHOTO_WITH_LOCATION)).not.toBeNull();
      });

      it('Bob setPublic Alice 的照片 → NotFoundError，且仍是私有', async () => {
        await expect(
          repo.setPublic(bob, ALICE_PHOTO_WITH_LOCATION, true)
        ).rejects.toBeInstanceOf(NotFoundError);
        const still = await repo.findById(alice, ALICE_PHOTO_WITH_LOCATION);
        expect(still!.isPublic).toBe(false);
      });

      it('Alice 用同一个 id 操作 → 成功（证明失败确实来自所有权而非 id 无效）', async () => {
        const updated = await repo.setLocation(alice, ALICE_PHOTO_WITH_LOCATION, null);
        expect(updated.locationId).toBeUndefined();
      });

      it('Bob 的列表里不含 Alice 的任何照片', async () => {
        const photos = await repo.list(bob, { limit: 100, includeTrashed: true });
        expect(photos.every((p) => p.userId === BOB)).toBe(true);
        expect(photos.find((p) => p.id === ALICE_PHOTO_WITH_LOCATION)).toBeUndefined();
      });

      it('NotFoundError 的对外信息不泄露「资源存在」', async () => {
        const err = await repo
          .trash(bob, ALICE_PHOTO_WITH_LOCATION)
          .then(() => null)
          .catch((e: unknown) => e as NotFoundError);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err!.message).not.toMatch(/forbidden|permission|owner|Alice/i);
        // 真实原因只在内部字段里
        expect(err!.internalReason).toBe('forbidden');
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    describe('未登录与匿名', () => {
      it('anonymous 调 list() → 抛错，不返回任何人的数据', async () => {
        await expect(repo.list(ANONYMOUS)).rejects.toThrow(/需要登录|Authentication/);
      });

      it('anonymous 调 findById() → 抛错', async () => {
        await expect(
          repo.findById(ANONYMOUS, ALICE_PHOTO_WITH_LOCATION)
        ).rejects.toThrow(/需要登录|Authentication/);
      });

      it('anonymous 调 listPublic() → 允许（唯一的例外）', async () => {
        await expect(repo.listPublic(ANONYMOUS)).resolves.toBeInstanceOf(Array);
      });

      it('system actor 必须带 reason', () => {
        expect(() => systemActor('')).toThrow(/reason/);
        expect(() => systemActor('孤儿文件对账')).not.toThrow();
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    describe('默认私有（三层中的 Repository 层）', () => {
      it('create() 不接受 isPublic 入参，新照片一律私有', async () => {
        const photo = await repo.create(alice, newPhotoInput('privacy'));
        expect(photo.isPublic).toBe(false);
      });

      it('新建的照片不出现在 listPublic() 里', async () => {
        const photo = await repo.create(alice, newPhotoInput('not-public'));
        const pub = await repo.listPublic(ANONYMOUS, { limit: 200 });
        expect(pub.find((p) => p.id === photo.id)).toBeUndefined();
      });

      it('seed 里没有任何公开照片', async () => {
        expect(await repo.listPublic(ANONYMOUS, { limit: 200 })).toEqual([]);
      });

      it('明确发布后 → listPublic 可见', async () => {
        const photo = await repo.create(alice, newPhotoInput('publish'));
        await repo.setPublic(alice, photo.id, true);
        const pub = await repo.listPublic(ANONYMOUS, { limit: 200 });
        expect(pub.find((p) => p.id === photo.id)).toBeDefined();
      });

      it('取消公开后 → 立即不可见', async () => {
        const photo = await repo.create(alice, newPhotoInput('unpublish'));
        await repo.setPublic(alice, photo.id, true);
        await repo.setPublic(alice, photo.id, false);
        const pub = await repo.listPublic(ANONYMOUS, { limit: 200 });
        expect(pub.find((p) => p.id === photo.id)).toBeUndefined();
      });

      it('已公开但进了回收站 → 不可见（回收站优先于公开）', async () => {
        const photo = await repo.create(alice, newPhotoInput('pub-trash'));
        await repo.setPublic(alice, photo.id, true);
        await repo.trash(alice, photo.id);
        const pub = await repo.listPublic(ANONYMOUS, { limit: 200 });
        expect(pub.find((p) => p.id === photo.id)).toBeUndefined();
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    describe('软删除状态机', () => {
      let target: Photo;
      beforeEach(async () => {
        target = await repo.create(alice, newPhotoInput('soft-delete'));
      });

      it('Active → trash → Trashed', async () => {
        const trashed = await repo.trash(alice, target.id);
        expect(trashed.trashed).toBe(true);
        expect(trashed.trashedAt).toBeTruthy();
      });

      it('trashed 的照片不出现在默认列表', async () => {
        await repo.trash(alice, target.id);
        const list = await repo.list(alice, { limit: 200 });
        expect(list.find((p) => p.id === target.id)).toBeUndefined();
      });

      it('includeTrashed 时可见（回收站视图）', async () => {
        await repo.trash(alice, target.id);
        const list = await repo.list(alice, { limit: 200, includeTrashed: true });
        expect(list.find((p) => p.id === target.id)).toBeDefined();
      });

      it('Trashed → restore → Active', async () => {
        await repo.trash(alice, target.id);
        const restored = await repo.restore(alice, target.id);
        expect(restored.trashed).toBe(false);
        expect(restored.trashedAt).toBeUndefined();
        const list = await repo.list(alice, { limit: 200 });
        expect(list.find((p) => p.id === target.id)).toBeDefined();
      });

      it('重复 trash 是幂等的，且 trashedAt 保持首次时间', async () => {
        const first = await repo.trash(alice, target.id);
        await new Promise((r) => setTimeout(r, 10));
        const second = await repo.trash(alice, target.id);
        expect(second.trashed).toBe(true);
        expect(second.trashedAt).toBe(first.trashedAt);
      });

      it('重复 restore 是幂等的', async () => {
        await repo.trash(alice, target.id);
        await repo.restore(alice, target.id);
        const again = await repo.restore(alice, target.id);
        expect(again.trashed).toBe(false);
      });

      it('对未 trash 的照片直接 restore 不报错', async () => {
        const r = await repo.restore(alice, target.id);
        expect(r.trashed).toBe(false);
      });

      it('Trashed → purge → 记录消失', async () => {
        await repo.trash(alice, target.id);
        await repo.purge(alice, target.id);
        expect(await repo.findById(alice, target.id)).toBeNull();
      });

      it('purge 已经不存在的照片 → NotFoundError', async () => {
        await repo.purge(alice, target.id);
        await expect(repo.purge(alice, target.id)).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    describe('列表语义', () => {
      it('newest 与 oldest 的首项相反', async () => {
        const newest = await repo.list(alice, { limit: 50, sortOrder: 'newest' });
        const oldest = await repo.list(alice, { limit: 50, sortOrder: 'oldest' });
        expect(newest[0]!.id).not.toBe(oldest[0]!.id);
      });

      it('没有 EXIF 时间的照片排在有时间的之后（NULLS LAST）', async () => {
        const list = await repo.list(alice, { limit: 50, sortOrder: 'newest' });
        const firstNullIdx = list.findIndex((p) => !p.metadata.dateTime);
        if (firstNullIdx === -1) return; // seed 里都有时间就跳过
        const afterNull = list.slice(firstNullIdx);
        expect(afterNull.every((p) => !p.metadata.dateTime)).toBe(true);
      });

      it('limit / offset 生效且不重叠', async () => {
        const page1 = await repo.list(alice, { limit: 2, offset: 0 });
        const page2 = await repo.list(alice, { limit: 2, offset: 2 });
        expect(page1).toHaveLength(2);
        const ids = new Set([...page1, ...page2].map((p) => p.id));
        expect(ids.size).toBe(page1.length + page2.length);
      });

      it('category 筛选只返回该分类', async () => {
        const list = await repo.list(alice, { limit: 50, category: 'time-only' });
        expect(list.length).toBeGreaterThan(0);
        expect(list.every((p) => p.category === 'time-only')).toBe(true);
      });
    });
  });
}
