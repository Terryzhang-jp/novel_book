/**
 * Phase 2A 纵向链路 —— 真实浏览器
 *
 * 集成测试证明了模型成立。这条测试证明**用户真的能看见**：
 *
 *   Journey → 无照片 Moment → Observation → Interpretation 修订
 *           → Work 引用 → Web Publication
 *
 * 全程只用原生表单提交（没有 JavaScript 参与写操作），
 * 所以这条链路的成立与前端框架无关。
 *
 * ## 最关键的一段
 *
 * 中间有一段是：匿名访客打开发布链接 → 作者回去改理解 →
 * 匿名访客再打开同一个链接。第二次看到的必须和第一次**一模一样**。
 *
 * 那是这个产品存在的理由。它在浏览器里成立，Phase 2A 才算成立。
 */

import { expect, test, type Browser } from '@playwright/test';
import { freshEmail, register } from './helpers';

/**
 * 一张 4×4 的真 PNG。
 *
 * 用真字节而不是随便一个 buffer —— 上传路径会按魔术字节判定类型，
 * 假字节会在探测那一步就被挡下，测不到后面的任何东西。
 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);

const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;

/** 匿名访客：全新的浏览器上下文，没有任何 cookie */
async function visitAnonymously(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

test.describe('Phase 2A 纵向链路', () => {
  // 这条测试要走完 11 步，中间还可能因为注册限流等一轮。
  // 默认 60s 不够，但也不该无限放宽 —— 真卡住了要能被发现。
  test.setTimeout(120_000);

  test('从记录一段旅程到发布，再到理解改变而旧链接不变', async ({ page, browser }) => {
    const email = freshEmail('studio');
    await register(page, email, 'Studio 用户');

    // ── 1. 建一段旅程 ────────────────────────────────────────────────────
    await page.goto('/studio');
    // 用 h1 而不是 getByRole('heading', { name })：后者的 name 是**子串**匹配，
    // 页面上「新建旅程」「我的旅程（0）」都包含「旅程」，匹配结果不唯一。
    await expect(page.locator('h1')).toHaveText('旅程');

    await page.fill('[data-testid="journey-title"]', '秩父三日');
    await page.selectOption('[data-testid="journey-type"]', 'trip');
    await page.fill('[data-testid="journey-intent"]', '想看看离开东京两小时的地方');
    await page.fill('[data-testid="journey-started"]', '2026-03-14T09:00');
    await page.click('[data-testid="journey-submit"]');

    await expect(page).toHaveURL(/\/studio\/journeys\//);
    await expect(page.locator('h1')).toHaveText('秩父三日');

    // ── 2. 记一个**没有照片**的 Moment ──────────────────────────────────
    // 页面上根本没有上传控件。这不是还没做 —— 是 ADR-004 M1。
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    await page.fill('[data-testid="moment-title"]', '神社后面的坡道');
    await page.fill('[data-testid="moment-place"]', '秩父神社');
    await page.fill(
      '[data-testid="moment-observation"]',
      '坡道两侧都是住家，走到一半有人在扫落叶。'
    );
    await page.click('[data-testid="moment-submit"]');

    await expect(page).toHaveURL(/\/studio\/moments\//);
    const momentUrl = page.url();

    // ── 3. 观察是追加，不是编辑 ─────────────────────────────────────────
    await page.fill('[data-testid="observation-input"]', '晚上想起来，他扫的是别人家门口。');
    await page.click('[data-testid="observation-submit"]');
    await expect(page.locator('[data-testid="observation-list"] li')).toHaveCount(2);
    // 第一条一个字都没被改写
    await expect(page.locator('[data-testid="observation-list"]')).toContainText('走到一半');

    // ── 3.5 加一份证据 ──────────────────────────────────────────────────
    // 角色选 contradicting —— 那是这个产品和相册的分界线，
    // 「什么让我改变了理解」必须能被表达出来。
    await page.setInputFiles('[data-testid="asset-file"]', {
      name: 'evidence.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await page.selectOption('[data-testid="asset-role"]', 'contradicting');
    await page.fill('[data-testid="asset-note"]', '扫落叶的人其实在笑');
    await page.click('[data-testid="asset-submit"]');

    await expect(page.locator('[data-testid="evidence-list"] > li')).toHaveCount(1);
    await expect(page.locator('[data-testid="evidence-role"]')).toHaveText('但这张让我不确定');

    // 原图能被作者本人读到
    const thumbSrc = await page.locator('[data-testid="evidence-thumb"]').getAttribute('src');
    expect(thumbSrc).toMatch(/^\/api\/studio\/assets\/[0-9a-f-]{36}\/raw$/);
    expect((await page.request.get(thumbSrc!)).status()).toBe(200);

    // ⭐ 匿名读不到原图
    const anonProbe = await browser.newContext();
    expect((await anonProbe.request.get(`${BASE}${thumbSrc}`)).status()).toBe(404);
    await anonProbe.close();

    // ── 4. 写下理解 v1 ──────────────────────────────────────────────────
    const V1 = '这里的人对公共空间有种默认的责任感。';
    await page.fill('[data-testid="interpretation-input"]', V1);
    await page.click('[data-testid="interpretation-submit"]');
    await expect(page.locator('[data-testid="current-interpretation"]')).toContainText(V1);

    // ── 5. 做一个作品，引用这个 Moment ──────────────────────────────────
    await page.goto('/studio/moments');
    const momentId = (
      await page.locator('[data-testid="all-moments"] code').first().innerText()
    ).trim();
    expect(momentId).toMatch(/^[0-9a-f-]{36}$/);

    await page.goto('/studio/works');
    await page.fill('[data-testid="work-title"]', '秩父三日');
    await page.click('[data-testid="work-submit"]');
    await expect(page).toHaveURL(/\/studio\/works\//);
    const workUrl = page.url();

    await page.fill('[data-testid="text-block-input"]', '三天，两个地方，一个没想明白的问题。');
    await page.click('[data-testid="text-block-submit"]');
    // 必须等这一段真的落地再填下一个表单。
    // 表单提交后页面会整页跳转，在跳转完成前填的输入框会被新页面覆盖掉 ——
    // 症状是「引用」按钮报 Please fill out this field，但看上去像是 id 没贴上。
    await expect(page.locator('[data-testid="block-list"] > li')).toHaveCount(1);

    await page.fill('[data-testid="moment-ref-input"]', momentId);
    await page.click('[data-testid="moment-ref-submit"]');
    await expect(page.locator('[data-testid="block-list"] > li')).toHaveCount(2);

    // 草稿区显示的是**实时**内容，所以此刻能看到 v1
    await expect(page.locator('[data-testid="block-list"]')).toContainText(V1);

    // ── 6. 发布 ─────────────────────────────────────────────────────────
    await page.click('[data-testid="publish-submit"]');
    await expect(page.locator('[data-testid="publication-box"]')).toBeVisible();
    const pubHref = await page
      .locator('[data-testid="publication-box"] a')
      .first()
      .getAttribute('href');
    expect(pubHref).toMatch(/^\/p\//);

    // ── 7. 匿名访客看得到 ───────────────────────────────────────────────
    const first = await visitAnonymously(browser, pubHref!);
    await expect(first.page.locator('[data-testid="pub-title"]')).toHaveText('秩父三日');
    await expect(first.page.locator('[data-testid="pub-interpretation"]')).toHaveText(V1);
    // 发布页里有派生副本，而且 URL 里只有 hash —— 不含 userId、不含 objectKey
    const pubImg = first.page.locator('[data-testid="pub-asset"] img');
    await expect(pubImg).toBeVisible();
    const pubImgSrc = (await pubImg.getAttribute('src'))!;
    expect(pubImgSrc).toMatch(/^\/p\/.+\/a\/[0-9a-f]{64}\.webp$/);
    expect(pubImgSrc).not.toContain('users/');
    // 匿名能取到它（这是安全副本，不是原图）
    expect((await first.page.request.get(pubImgSrc)).status()).toBe(200);

    // ⭐ 缓存语义：用**同一个浏览器上下文**先把图片装进 HTTP 缓存。
    // 撤回之后要再用这个上下文访问一次 —— 只有它才能证明
    // 「客户端不会拿着旧缓存继续看」。page.request 走的是独立的
    // API context，不经过浏览器缓存，证明不了这件事。
    const cacheProbe = await browser.newContext();
    const cachePage = await cacheProbe.newPage();
    const firstHit = await cachePage.goto(pubImgSrc);
    expect(firstHit?.status()).toBe(200);

    const cc = firstHit!.headers()['cache-control'] ?? '';
    const etag = firstHit!.headers().etag ?? '';
    // immutable / max-age 会让撤回在已缓存的客户端上根本不发生
    expect(cc).not.toContain('immutable');
    expect(cc).not.toMatch(/max-age=[1-9]/);
    expect(cc).toContain('no-cache');
    expect(cc).toContain('must-revalidate');
    // ETag 就是派生内容的 hash —— 字节变了它必然变
    expect(etag).toBe(`"${pubImgSrc.match(/([0-9a-f]{64})/)![1]}"`);

    // 带 If-None-Match 回来验证 → 304，不重传字节
    const revalidated = await cachePage.request.get(pubImgSrc, {
      headers: { 'If-None-Match': etag },
    });
    expect(revalidated.status()).toBe(304);

    const firstRender = await first.page.locator('article').innerText();
    await first.context.close();

    // ── 8. 作者回去改理解 ───────────────────────────────────────────────
    const V2 = '一周后再想，与其说是责任感，不如说是他们相信自己会一直住在这条街上。';
    await page.goto(momentUrl);
    await page.fill('[data-testid="interpretation-input"]', V2);
    await page.click('[data-testid="interpretation-submit"]');

    // 「我的理解之后又改变了」—— 两版都在，v1 没有消失
    await expect(page.locator('[data-testid="current-interpretation"]')).toContainText(V2);
    await expect(page.locator('[data-testid="interpretation-history"] li')).toHaveCount(2);
    await expect(page.locator('[data-testid="interpretation-history"]')).toContainText(V1);

    // 草稿跟着变新了
    await page.goto(workUrl);
    await expect(page.locator('[data-testid="block-list"]')).toContainText(V2);

    // ── 9. ⭐ 旧链接必须一个字都没变 ────────────────────────────────────
    const second = await visitAnonymously(browser, pubHref!);
    await expect(second.page.locator('[data-testid="pub-interpretation"]')).toHaveText(V1);
    expect(await second.page.locator('article').innerText()).toBe(firstRender);
    await second.context.close();

    // ── 10. 再次发布 → 同一个链接，新内容 ───────────────────────────────
    await page.goto(workUrl);
    await page.click('[data-testid="publish-submit"]');
    await expect(page.locator('[data-testid="publication-box"]')).toContainText('第 2 版');
    const pubHref2 = await page
      .locator('[data-testid="publication-box"] a')
      .first()
      .getAttribute('href');
    // 链接不变 —— 已经分享出去的 URL 不该因为作者改了一次想法就失效
    expect(pubHref2).toBe(pubHref);

    const third = await visitAnonymously(browser, pubHref!);
    await expect(third.page.locator('[data-testid="pub-interpretation"]')).toHaveText(V2);
    await third.context.close();

    // ── 11. 下架不是删除 ────────────────────────────────────────────────
    await page.goto(workUrl);
    await page.click('[data-testid="withdraw-submit"]');
    // 同上：等服务端处理完再让匿名访客去看，否则是在和重定向赛跑
    await expect(page.locator('[data-testid="notice-banner"]')).toContainText('已下架');

    const fourth = await visitAnonymously(browser, pubHref!);
    // 访客看到的是「作者已下架」，不是 404 —— 链接没坏，只是不再公开
    await expect(fourth.page.locator('[data-testid="pub-withdrawn"]')).toBeVisible();
    // ⭐ 图片也跟着立刻不可访问。
    // 这就是不用公开桶的理由：公开桶要么删文件（撤回不可逆），
    // 要么留着（撤回是假的）。走路由则撤回当下就 404，字节还在。
    expect((await fourth.page.request.get(pubImgSrc)).status()).toBe(404);
    await fourth.context.close();

    // ⭐⭐ 最关键的一条：**已经缓存过这张图的那个浏览器上下文**再访问一次。
    // 如果响应头写的是 immutable / max-age，它根本不会来问服务器，
    // 于是撤回在这个客户端上没有发生 —— 而它看起来完全正常。
    const afterWithdraw = await cachePage.goto(pubImgSrc);
    expect(afterWithdraw?.status()).toBe(404);
    // 带着旧 ETag 回来也必须是 404，不能是 304
    expect(
      (await cachePage.request.get(pubImgSrc, { headers: { 'If-None-Match': etag } })).status()
    ).toBe(404);
    await cacheProbe.close();
  });

  test('未登录访问 /studio 会被挡在门外，但发布页不需要登录', async ({ page, browser }) => {
    const context = await browser.newContext();
    const anon = await context.newPage();

    await anon.goto('/studio');
    await expect(anon).toHaveURL(/\/login/);

    // 而 /p/* 是公开路由。这里用一个不存在的 slug —— 关键是它**没有**被
    // 重定向到 /login，说明匿名访问确实被放行了。
    const res = await anon.goto('/p/definitely-not-a-real-slug');
    expect(anon.url()).not.toMatch(/\/login/);
    expect(res?.status()).toBe(404);

    await context.close();
    void page;
  });
});
