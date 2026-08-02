/**
 * E2E 共用动作
 *
 * 注册和登录被两条测试链路共用。抽出来不是为了少写几行 ——
 * 是因为这两个表单各有一处**不写下来就会重复踩**的坑（见下面的注释）。
 * 复制两份的话，下一个人只会修好自己那份。
 */

import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'e2e-password-123456';

/** 每次运行用不同邮箱，避免和上一次的残留冲突 */
export function freshEmail(tag: string): string {
  return `e2e-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@dev.local`;
}

/**
 * 走完整的注册表单。
 *
 * 密保问题两个字段是必填的（这个产品没有邮件系统，密码找回靠它）。
 * 漏填时表单静默不提交、页面上也没有明显报错 —— 第一次写这个测试就卡在
 * 这里，所以封装成一处，避免每条测试各漏一个字段。
 */
/**
 * 注册。被限流时等待后重试。
 *
 * Better Auth 对 /sign-up/email 有内置限流，窗口很短。E2E 一次 run 会连续
 * 注册好几个用户，撞上是必然的。
 *
 * **不去把限流关掉** —— 那样测的就不是产品的真实行为了。等一会儿再试，
 * 顺便还证明了限流是「暂时拒绝」而不是「永久拒绝」。
 */
export async function register(page: Page, email: string, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await attemptRegister(page, email, name);
      return;
    } catch (err) {
      const rateLimited = err instanceof Error && /too many requests|请求过于频繁/i.test(err.message);
      if (!rateLimited || attempt >= 3) throw err;
      await page.waitForTimeout(11_000);
    }
  }
}

async function attemptRegister(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/register');
  await page.fill('#email', email);
  await page.fill('#name', name);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.selectOption('#securityQuestion', { index: 1 });
  await page.fill('#securityAnswer', 'e2e-answer');
  await page.click('button[type="submit"]');
  // 断言 URL 变化而不是等某个具体元素 —— 后者会因为一次 UI 调整就红，
  // 而它其实不关心页面长什么样。
  //
  // 失败时先把页面上的错误文案捞出来。默认的报错只会说「URL 还是 /register」，
  // 而真正的原因（密码太短、邮箱重复、被限流）就写在页面上 ——
  // 不捞出来就得靠人去翻 trace。
  try {
    await expect(page).not.toHaveURL(/\/register/, { timeout: 25_000 });
  } catch (err) {
    const shown = await page.locator('.text-destructive').first().innerText().catch(() => '');
    throw new Error(`注册没有成功。页面上的提示：「${shown || '（页面没有显示任何错误）'}」`, {
      cause: err,
    });
  }
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');

  // 登录页默认展示的是 Google 登录，邮箱表单藏在一个切换后面。
  // 不硬编码那个按钮的文案 —— 直接等 #email 可见，不可见才去找切换入口。
  const emailField = page.locator('#email');
  if (!(await emailField.isVisible().catch(() => false))) {
    const toggle = page.getByRole('button', { name: /邮箱登录|email/i });
    if (await toggle.count()) await toggle.first().click();
  }
  await emailField.waitFor({ state: 'visible', timeout: 15_000 });

  await emailField.fill(email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 25_000 });
}
