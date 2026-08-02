/**
 * 真实浏览器主链路
 *
 * 把数据库层的契约提升为产品契约：集成测试证明了 Repository 的行为，
 * 这里证明用户在**真实浏览器 + 真实 HTTP + 真实 cookie session** 下
 * 也能完成同样的事。
 *
 * ## ⚠️ 当前能覆盖到哪里
 *
 * 遗留应用的数据操作全部走 `supabaseAdmin` → PostgREST，需要完整的
 * Supabase 本地栈（Docker）。E2E 环境里没有，所以：
 *
 *   ✅ 可以覆盖：认证链路（Better Auth 直连 pg 连接池）
 *                注册 / 登录 / session 持久化 / 路由保护 / 未登录 401
 *
 *   ❌ 暂时无法覆盖：照片、文档、地点、画布的创建与读取
 *                    —— 它们的 fetch 会打到不存在的 PostgREST
 *
 * 这不是测试写得不够，是**遗留应用与供应商强绑定**的直接后果，
 * 也正是 ADR-000 要解决的问题。缺口记在 verification-gaps.json 的
 * e2e-data-operations-need-supabase。
 *
 * 资源级跨用户隔离已由 44 条 Repository 契约在集成层证明
 * （test/integration/photo-repository.contract.ts）。
 */

import { test, expect } from '@playwright/test';
import { freshEmail, login, PASSWORD, register } from './helpers';

// 注册 / 登录的表单细节见 e2e/helpers.ts —— 两条链路共用，避免各修各的一份

/**
 * 通过**产品真实的登出按钮**登出。
 *
 * 不要用 `page.request.post('/api/auth/sign-out')` —— 实测那样调用会返回
 * 200 但 cookie 不清、session 不失效，看起来像个安全漏洞，实际是
 * APIRequestContext 与浏览器 cookie jar 的行为差异。
 *
 * E2E 的意义就是走用户真正走的路径。产品的登出按钮是正确工作的：
 * cookie 清空、跳回 /login、再访问受保护页被中间件挡回。
 */
async function logoutViaUi(page: import('@playwright/test').Page) {
  await page.goto('/documents');
  await page.getByRole('button', { name: /Sign Out/i }).first().click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
}

/** 当前 session 对应的用户。走 Better Auth，不经 Supabase。 */
async function currentUser(
  api: import('@playwright/test').APIRequestContext
): Promise<{ id: string; email: string } | null> {
  const res = await api.get('/api/auth/get-session');
  if (!res.ok()) return null;
  const body = (await res.json()) as { user?: { id: string; email: string } } | null;
  return body?.user ?? null;
}

// ════════════════════════════════════════════════════════════════════════════
// 流程 A · 新用户注册后立即可用
//
// 直接守护 Commit 10a 修好的那个断裂：修复前新注册用户在业务表里没有对应
// 行。这条在真实浏览器上验证「注册 → 拿到 session → 能进受保护区域」。
// ════════════════════════════════════════════════════════════════════════════

test.describe('流程 A · 新用户注册后立即可用', () => {
  test('注册 → 自动登录 → 进受保护页 → 登出 → 再登录 → session 恢复', async ({ page }) => {
    const email = freshEmail('flow-a');

    // ── 注册并自动获得 session ──────────────────────────────────────────
    await register(page, email, 'E2E User');

    const afterSignup = await currentUser(page.request);
    expect(afterSignup, '注册后没有拿到 session').not.toBeNull();
    expect(afterSignup!.email).toBe(email);
    const userId = afterSignup!.id;
    expect(userId).toBeTruthy();

    // ── 能进受保护区域 ──────────────────────────────────────────────────
    await page.goto('/documents');
    await expect(page).toHaveURL(/\/documents/, { timeout: 15_000 });

    // ── 登出（走产品真实按钮）────────────────────────────────────────
    await logoutViaUi(page);
    expect(await currentUser(page.request), '登出后 session 仍在').toBeNull();

    // 登出后访问受保护页面应被中间件挡回登录页
    await page.goto('/documents');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // ── 再登录 ──────────────────────────────────────────────────────────
    await login(page, email);

    const afterRelogin = await currentUser(page.request);
    expect(afterRelogin, '重新登录后没有 session').not.toBeNull();
    // 同一个用户 —— 不是新建了一个
    expect(afterRelogin!.id).toBe(userId);
    expect(afterRelogin!.email).toBe(email);
  });

  test('注册时密码不一致 → 停留在注册页，不创建账号', async ({ page }) => {
    const email = freshEmail('mismatch');
    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#name', 'Mismatch');
    await page.fill('#password', PASSWORD);
    await page.fill('#confirmPassword', `${PASSWORD}-different`);
    await page.selectOption('#securityQuestion', { index: 1 });
    await page.fill('#securityAnswer', 'a');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/register/);
    expect(await currentUser(page.request)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 流程 B · 会话隔离与路由保护
//
// 两个真实浏览器 context = 两个独立 cookie jar = 两个真实用户。
// 覆盖中间件、路由处理器、session 解析这些集成测试碰不到的层。
//
// ⚠️ 资源级隔离（Bob 拿 Alice 的 photo id）需要 Supabase，见文件头说明。
//    那部分由 44 条 Repository 契约在集成层证明。
// ════════════════════════════════════════════════════════════════════════════

test.describe('流程 B · 会话隔离与路由保护', () => {
  test('两个 context 拿到各自独立的 session，不会串', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();

    try {
      const alicePage = await aliceCtx.newPage();
      const bobPage = await bobCtx.newPage();

      const aliceEmail = freshEmail('alice');
      const bobEmail = freshEmail('bob');

      await register(alicePage, aliceEmail, 'Alice');
      await register(bobPage, bobEmail, 'Bob');

      const alice = await currentUser(alicePage.request);
      const bob = await currentUser(bobPage.request);

      expect(alice).not.toBeNull();
      expect(bob).not.toBeNull();
      expect(alice!.email).toBe(aliceEmail);
      expect(bob!.email).toBe(bobEmail);
      // 两个身份必须是不同的人 —— 串了就是致命的 session 泄露
      expect(alice!.id).not.toBe(bob!.id);

      // Bob 登出不应影响 Alice
      await logoutViaUi(bobPage);
      expect(await currentUser(bobPage.request)).toBeNull();
      const aliceStill = await currentUser(alicePage.request);
      expect(aliceStill, 'Bob 登出把 Alice 的 session 也带走了').not.toBeNull();
      expect(aliceStill!.id).toBe(alice!.id);
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });

  test('未登录访问受保护 API → 401（不是 500）', async ({ request }) => {
    // 这条抓到过一个真 bug：13 个路由的 catch 块比对的错误消息字符串和
    // requireAuth 实际抛的对不上，导致未登录一律返回 500。
    for (const path of ['/api/locations', '/api/photos', '/api/documents', '/api/profile']) {
      const res = await request.get(path);
      expect(res.status(), `${path} 未登录时应返回 401，实际 ${res.status()}`).toBe(401);
    }
  });

  test('未登录访问受保护页面 → 重定向到登录', async ({ page }) => {
    for (const path of ['/gallery', '/documents', '/canvas', '/profile']) {
      await page.goto(path);
      await expect(page, `${path} 未登录时应重定向到 /login`).toHaveURL(/\/login/, {
        timeout: 15_000,
      });
    }
  });

  test('公开页面无需登录即可访问', async ({ page }) => {
    await page.goto('/chichibu');
    await expect(page).toHaveURL(/\/chichibu/, { timeout: 15_000 });
  });
});
