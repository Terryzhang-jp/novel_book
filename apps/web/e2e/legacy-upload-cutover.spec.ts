/**
 * Phase 3A 硬切验收 —— **旧入口，新路径**（16E）
 *
 * 前面几步各自证明了一半：
 *
 *   16B  上传用例统一到 uploadAsset
 *   16C  旧 Gallery 的形状由只读投影提供
 *   16D  photos 表在数据库层面冻结
 *
 * 这条测试把它们合起来问一个用户视角的问题：
 *
 *   **从旧的相册上传页传一张照片，它去了哪里？**
 *
 * 答案必须同时满足四条：
 *
 *   1. 旧 Gallery 看得见它            —— 旧页面没有被破坏
 *   2. 新 Studio 的素材页也看得见它    —— 它真的进了新核心
 *   3. assets 表多一行                —— 落在了新的地方
 *   4. photos 表**一行都不多**         —— 没有落在旧的地方
 *
 * 第 4 条是全部的重点。少了它，前三条同时成立的最省事方式就是双写。
 *
 * ## 为什么这条 E2E 要连数据库
 *
 * 其余的 E2E 只走 UI 和 HTTP，数据库断言留给 vitest。这里破例，
 * 因为「没有产生新的旧数据」这件事**在界面上是看不见的** ——
 * 界面看起来一切正常，正是双写最擅长伪装的样子。
 *
 * ## 关于「Legacy bucket 没有新对象」
 *
 * 那一条无法在这里直接验证：`NEXT_PUBLIC_SUPABASE_URL` 指向的实例
 * DNS 已经解析不到（`pnpm verify:legacy-storage` 实测），E2E 环境里
 * 填的是一个占位地址。
 *
 * 所以它由另外两件事共同保证，都不依赖那个实例是否可达：
 *
 *   · scripts/check-architecture.mjs 的 no-new-legacy-writes 规则
 *     —— 上传路径上已经没有任何 uploadFile / storage.upload 调用
 *   · 下面第 5 条断言：字节确实落在了本地 ObjectStorage 的
 *     内容寻址路径下，也就是说它去了新的地方，而不是两个地方
 *
 * **不写一条「远端 bucket 没有新对象」的假断言。** 一个连不上的
 * 远端返回什么都能被解释成通过。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { expect, test } from '@playwright/test';
import { freshEmail, register } from './helpers';

/**
 * 一张 8×8 的真 JPEG。
 *
 * 必须是真字节：上传路径按魔术字节判定类型，假 buffer 在探测那一步
 * 就被挡下，后面什么都测不到。
 */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEB' +
    'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh' +
    'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ' +
    'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
    'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AP3gooooA//Z',
  'base64'
);

const STATE_FILE = join(process.cwd(), 'test-results/e2e-state.json');

/** E2E 用的是一个一次性数据库，连接信息由 global-setup 落盘 */
function e2eDsn(): string {
  const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    dbName: string;
    adminDsn: string;
  };
  return raw.adminDsn.replace(/\/[^/]*$/, `/${raw.dbName}`);
}

async function queryDb<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: e2eDsn() });
  await client.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    await client.end();
  }
}

test.describe('Phase 3A：旧上传入口已经硬切到新 Asset 路径', () => {
  test('从旧相册上传 → 新旧两边都看得见 → assets 多一行、photos 一行不多', async ({
    page,
  }) => {
    const email = freshEmail('cutover');
    await register(page, email, '硬切验收');

    const [{ id: userId }] = await queryDb<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1',
      [email]
    );
    expect(userId).toBeTruthy();

    // ── 基线：这个人现在什么都没有 ──────────────────────────────────────
    const photosBefore = await countPhotos();
    expect(await countAssets(userId)).toBe(0);

    // ── 1. 从**旧的**相册上传页上传 ────────────────────────────────────
    //
    // 走真实的页面，不是直接打 API。要验证的是「用户从旧入口进来」，
    // 而旧入口包含那个页面上的压缩、批处理和状态机。
    await page.goto('/gallery/upload');
    await page.setInputFiles('input[type="file"]', {
      name: 'legacy-entry.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });

    // 页面把文件排进队列后才出现上传按钮
    const uploadButton = page.getByRole('button', { name: /上传|Upload/ });
    await uploadButton.first().waitFor({ state: 'visible', timeout: 20_000 });
    await uploadButton.first().click();

    // ── 2. assets 多了一行，photos 一行不多 ────────────────────────────
    //
    // 这两条断言必须挨在一起看。只有前一条 = 可能是双写；
    // 只有后一条 = 可能是上传根本没成功。
    await expect
      .poll(() => countAssets(userId), { timeout: 30_000, message: '上传后 assets 应当多一行' })
      .toBe(1);
    expect(await countPhotos(), 'photos 表一行都不该多 —— 禁止双写').toBe(photosBefore);

    const [asset] = await queryDb<{ id: string; object_key: string; sha256: string }>(
      'SELECT id, object_key, sha256 FROM assets WHERE user_id = $1',
      [userId]
    );

    // ── 3. 字节落在新的、按用户隔离的内容寻址路径下 ─────────────────────
    expect(asset!.object_key).toMatch(
      new RegExp(`^users/${userId}/sha256/[0-9a-f]{2}/[0-9a-f]{64}\\.jpe?g$`)
    );
    // 不是 Supabase 的 `{userId}/gallery/{timestamp}-{random}.jpg` 形状
    expect(asset!.object_key).not.toContain('/gallery/');

    const storageRoot = process.env.TC_STORAGE_ROOT ?? join(process.cwd(), '.storage');
    expect(
      existsSync(join(storageRoot, asset!.object_key)),
      '字节应当落在本地 ObjectStorage 里'
    ).toBe(true);

    // ── 4. 旧 Gallery 看得见它（只读投影，16C）──────────────────────────
    const listed = await page.request.get('/api/photos?limit=50');
    expect(listed.ok()).toBe(true);
    const body = (await listed.json()) as {
      photos: { id: string; fileUrl: string; thumbnailUrl?: string; isPublic: boolean }[];
      stats: { total: number };
    };
    const projected = body.photos.find((p) => p.id === asset!.id);
    expect(projected, '旧 Gallery 的列表里应当出现这份新素材').toBeDefined();
    expect(body.stats.total).toBe(1);

    // ⭐ 投影出来的东西永远是私有的。
    // 旧系统这里硬编码过 true，结果每张上传的照片立刻出现在公开地图上。
    expect(projected!.isPublic).toBe(false);

    // URL 指向走鉴权的路由，而且不含对象 key ——
    // ADR-002：拿到 URL 不等于有权取件。
    expect(projected!.fileUrl).toBe(`/api/studio/assets/${asset!.id}/raw`);
    expect(projected!.fileUrl).not.toContain(asset!.sha256);
    expect(projected!.thumbnailUrl).toContain('/preview?size=thumb');

    // ── 5. 新 Studio 的素材页也看得见它 ────────────────────────────────
    await page.goto('/studio/assets');
    const item = page.locator(`[data-testid="asset-item"][data-asset-id="${asset!.id}"]`);
    await expect(item).toHaveCount(1);
    await expect(item.locator('[data-testid="asset-thumb"]')).toBeVisible();

    // ── 6. 受控预览真的能取到，而且是剥过元数据的 WebP ──────────────────
    const preview = await page.request.get(
      `/api/studio/assets/${asset!.id}/preview?size=thumb`
    );
    expect(preview.status()).toBe(200);
    expect(preview.headers()['content-type']).toBe('image/webp');
    // private + 每次用前必须回来问 —— 素材被删或账号被停用之后，
    // 缓存不能继续替我们送出内容
    expect(preview.headers()['cache-control']).toContain('private');
    expect(preview.headers()['cache-control']).toContain('no-cache');

    const etag = preview.headers().etag;
    expect(etag).toBeTruthy();

    // 带上 ETag 再来一次 → 304，不重新派生
    const revalidated = await page.request.get(
      `/api/studio/assets/${asset!.id}/preview?size=thumb`,
      { headers: { 'If-None-Match': etag! } }
    );
    expect(revalidated.status()).toBe(304);
  });

  test('已经退役的旧写入端点明确说自己没了，而不是静默失败', async ({ page }) => {
    // 410 而不是 404：这些端点**曾经存在过**，客户端有权知道是被撤销的，
    // 而不是自己拼错了地址。
    const email = freshEmail('gone');
    await register(page, email, '退役端点');

    const emptyTrash = await page.request.delete('/api/photos/trash/empty');
    expect(emptyTrash.status()).toBe(410);
    expect((await emptyTrash.json()).code).toBe('CAPABILITY_REMOVED');

    const setLocation = await page.request.put('/api/photos/whatever/location', {
      data: { locationId: 'x' },
    });
    expect(setLocation.status()).toBe(410);
    expect((await setLocation.json()).code).toBe('CAPABILITY_PENDING');

    const batch = await page.request.post('/api/photos/batch-location', {
      data: { photoIds: ['a'], locationId: 'x' },
    });
    expect(batch.status()).toBe(410);
  });

  test('未登录时旧上传端点不接受任何字节', async ({ browser }) => {
    // 全新上下文 = 没有任何 cookie
    const context = await browser.newContext();
    try {
      const before = await countPhotos();
      const res = await context.request.post('/api/photos', {
        multipart: {
          file: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
        },
      });
      expect(res.status()).toBe(401);
      expect(await countPhotos()).toBe(before);
    } finally {
      await context.close();
    }
  });
});

async function countPhotos(): Promise<number> {
  const [row] = await queryDb<{ n: string }>('SELECT count(*)::text AS n FROM photos');
  return Number(row!.n);
}

async function countAssets(userId: string): Promise<number> {
  const [row] = await queryDb<{ n: string }>(
    'SELECT count(*)::text AS n FROM assets WHERE user_id = $1',
    [userId]
  );
  return Number(row!.n);
}
