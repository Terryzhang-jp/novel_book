/**
 * Phase 2D-1 —— 账号生命周期，真实浏览器
 *
 * 集成测试已经在用例层证明了状态机、冷静期和级联删除。这条测试要回答的是
 * 另一个问题：**一个真实的人，用一个真实的浏览器，能不能真的做到这件事。**
 *
 * 它要走完一整圈：
 *
 *   发布作品 → 申请删除 → 公开链接当场打不开 → 登录也被拒
 *          → 用令牌撤销 → 重新登录 → 内容一个字都没变
 *          → 再次申请删除 → 等待期结束 → 永久删除 → 什么都不剩
 *
 * ## 30 天怎么过去的
 *
 * 不等，也不改系统时间：最后一步由运维 CLI 执行，
 * 而那个 CLI 的 `--now` 注入的是 Clock 端口 —— 和生产**完全同一条代码路径**，
 * 只是时钟被拨到了 31 天后。
 *
 * 换句话说，这条测试验证的正是「30 天后那个定时任务跑起来会发生什么」，
 * 而不是某个测试专用的删除分支。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { expectLoginRejected, freshEmail, login, register } from './helpers';

const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const APP_ROOT = process.cwd();

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);

/** global-setup 把 e2e 库的信息落在这里 */
function e2eDsn(): string {
  const state = JSON.parse(
    readFileSync(join(APP_ROOT, 'test-results/e2e-state.json'), 'utf8')
  ) as { dbName: string; adminDsn: string };
  return state.adminDsn.replace(/\/[^/]*$/, `/${state.dbName}`);
}

/**
 * 运维 CLI。**这是生产里真正会跑的那条路径** ——
 * 定时任务调的是同一个 runDueDeletions，只是时钟不同。
 */
function runAccountCli(args: string[]): string {
  return execFileSync('pnpm', ['account', ...args], {
    cwd: APP_ROOT,
    env: { ...process.env, DATABASE_URL: e2eDsn() },
    encoding: 'utf8',
  });
}

async function anonymous(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** 造一个有内容、有证据、已发布的账号 */
async function seedPublishedWork(page: Page): Promise<{ pubHref: string; imgSrc: string }> {
  // Moment 只能记在某段旅程里 —— 先有旅程（ADR-003 的边界）
  await page.goto('/studio');
  await page.fill('[data-testid="journey-title"]', '一个人的美术馆');
  await page.selectOption('[data-testid="journey-type"]', 'outing');
  await page.fill('[data-testid="journey-started"]', '2026-05-02T13:00');
  await page.click('[data-testid="journey-submit"]');
  await expect(page).toHaveURL(/\/studio\/journeys\//);

  await page.fill('[data-testid="moment-title"]', '闭馆前十分钟');
  await page.fill('[data-testid="moment-place"]', '县立美术馆');
  await page.fill('[data-testid="moment-observation"]', '保安开始关灯，从最里面那间往外关。');
  await page.click('[data-testid="moment-submit"]');
  await expect(page).toHaveURL(/\/studio\/moments\//);

  await page.setInputFiles('[data-testid="asset-file"]', {
    name: 'evidence.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await page.selectOption('[data-testid="asset-role"]', 'supporting');
  await page.click('[data-testid="asset-submit"]');
  await expect(page.locator('[data-testid="evidence-list"] > li')).toHaveCount(1);

  await page.fill('[data-testid="interpretation-input"]', '我以为我在看画，其实我在等被赶走。');
  await page.click('[data-testid="interpretation-submit"]');

  await page.goto('/studio/moments');
  const momentId = (
    await page.locator('[data-testid="all-moments"] code').first().innerText()
  ).trim();

  await page.goto('/studio/works');
  await page.fill('[data-testid="work-title"]', '闭馆');
  await page.click('[data-testid="work-submit"]');
  await expect(page).toHaveURL(/\/studio\/works\//);

  await page.fill('[data-testid="moment-ref-input"]', momentId);
  await page.click('[data-testid="moment-ref-submit"]');
  await expect(page.locator('[data-testid="block-list"] > li')).toHaveCount(1);

  await page.click('[data-testid="publish-narrative"]');
  await expect(page.locator('[data-testid="publication-narrative"]')).toBeVisible();
  const pubHref = (await page
    .locator('[data-testid="publication-narrative"] a')
    .first()
    .getAttribute('href'))!;

  // 拿一次派生图的地址 —— 删除之后要确认这个 URL 也 404
  const visitor = await page.context().browser()!.newContext();
  const vp = await visitor.newPage();
  await vp.goto(pubHref);
  const imgSrc = (await vp.locator('[data-testid="pub-asset"] img').getAttribute('src'))!;
  await visitor.close();

  return { pubHref, imgSrc };
}

test.describe('账号生命周期', () => {
  // 注册可能被限流等一轮，中间还要跑一次 CLI
  test.setTimeout(180_000);

  test('申请删除 → 立刻下架 → 撤销 → 完全恢复 → 到期永久删除', async ({ page, browser }) => {
    const email = freshEmail('account');
    await register(page, email, '账号生命周期');

    const { pubHref, imgSrc } = await seedPublishedWork(page);

    // ── 基线：匿名访客现在看得到 ─────────────────────────────────────────
    const before = await anonymous(browser);
    await before.page.goto(pubHref);
    await expect(before.page.locator('[data-testid="pub-title"]')).toHaveText('闭馆');
    const renderBefore = await before.page.locator('article').innerText();
    expect((await before.page.request.get(`${BASE}${imgSrc}`)).status()).toBe(200);
    await before.context.close();

    // ── 1. 确认文字不对时什么都不该发生 ──────────────────────────────────
    await page.goto('/studio/account');
    await expect(page.locator('[data-testid="account-status"]')).toContainText('正常');

    await page.fill('[data-testid="deletion-confirm"]', '删除');
    await page.click('[data-testid="request-deletion"]');
    await expect(page).toHaveURL(/\/studio\/account\?error=/);
    await expect(page.locator('[data-testid="account-status"]')).toContainText('正常');

    // ── 2. 申请删除 ─────────────────────────────────────────────────────
    await page.fill('[data-testid="deletion-confirm"]', '删除我的账号');
    await page.fill('[data-testid="deletion-reason"]', '想清空重来');
    await page.click('[data-testid="request-deletion"]');

    await expect(page).toHaveURL(/\/account\/deletion-requested/);
    const token = (await page.locator('[data-testid="cancel-token"]').innerText()).trim();
    expect(token.length).toBeGreaterThan(20);

    // ── 3. ⭐ 公开链接当场就打不开 ───────────────────────────────────────
    // 没有等待，没有后台任务 —— 下一次访问就已经取不到了。
    const during = await anonymous(browser);
    const gone = await during.page.goto(pubHref);
    expect(gone?.status()).toBe(404);
    expect((await during.page.request.get(`${BASE}${imgSrc}`)).status()).toBe(404);
    await during.context.close();

    // ── 4. 等待期内登录也被拒绝 ─────────────────────────────────────────
    // 光撤销 session 不够 —— 密码还是对的，能重新登录的话删除申请就是空话。
    const blocked = await anonymous(browser);
    // 断言的是**账号状态那句话**，不只是「没进去」——
    // 后者被限流也能满足（见 helpers 里的说明）
    await expectLoginRejected(blocked.page, email, /申请了删除账号/);
    await blocked.context.close();

    // ── 5. 用令牌撤销（不需要登录，因为根本登不进来）────────────────────
    const restorer = await anonymous(browser);
    await restorer.page.goto('/account/restore');
    await restorer.page.fill('[data-testid="restore-token"]', token);
    await restorer.page.click('[data-testid="restore-submit"]');
    await expect(restorer.page).toHaveURL(/\/login\?notice=/);
    await restorer.context.close();

    // ── 6. ⭐ 恢复之后内容一个字都没变 ───────────────────────────────────
    const after = await anonymous(browser);
    await after.page.goto(pubHref);
    await expect(after.page.locator('[data-testid="pub-title"]')).toHaveText('闭馆');
    expect(await after.page.locator('article').innerText()).toBe(renderBefore);
    expect((await after.page.request.get(`${BASE}${imgSrc}`)).status()).toBe(200);
    await after.context.close();

    // 而且他确实能重新登录了
    const back = await anonymous(browser);
    await login(back.page, email);
    await back.page.goto('/studio/account');
    await expect(back.page.locator('[data-testid="account-status"]')).toContainText('正常');
    // 审计里两条记录都在：申请过，也撤销过
    await expect(back.page.locator('[data-testid="account-events"]')).toContainText('申请删除账号');
    await expect(back.page.locator('[data-testid="account-events"]')).toContainText('撤销删除申请');

    // ── 7. 再来一次，这次走到底 ─────────────────────────────────────────
    await back.page.fill('[data-testid="deletion-confirm"]', '删除我的账号');
    await back.page.click('[data-testid="request-deletion"]');
    await expect(back.page).toHaveURL(/\/account\/deletion-requested/);
    await back.context.close();

    // 冷静期没结束，运维也删不掉 —— CLI 走的是同一个断言
    expect(() =>
      runAccountCli([
        'finalize',
        email,
        '--reason',
        'E2E：验证冷静期',
        '--now',
        new Date().toISOString(),
      ])
    ).toThrow(/冷静期/);

    // ── 8. 把时钟拨到 31 天后再执行 ──────────────────────────────────────
    const in31Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    const output = runAccountCli([
      'finalize',
      email,
      '--reason',
      'E2E：等待期结束后的永久删除',
      '--now',
      in31Days,
    ]);
    expect(output).toContain('已永久删除');

    // ── 9. ⭐ 什么都不剩 ────────────────────────────────────────────────
    const final = await anonymous(browser);
    expect((await final.page.goto(pubHref))?.status()).toBe(404);
    expect((await final.page.request.get(`${BASE}${imgSrc}`)).status()).toBe(404);

    // 账号也没了 —— 这次不再是状态拦截，而是查无此人：
    // 拒绝的理由从「你的账号被…」变成普通的凭据错误
    await expectLoginRejected(final.page, email, /邮箱或密码错误|invalid/i);
    await final.context.close();
  });
});
