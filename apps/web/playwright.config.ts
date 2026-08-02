/**
 * Playwright —— 真实浏览器端到端
 *
 * ## 边界
 *
 * 这一层测的是**产品契约**，不是实现细节：用户能不能完成一件事。
 * 数据库层的断言归 vitest integration，这里只走 UI 和 HTTP。
 *
 * ## 环境
 *
 * 需要三样东西同时就绪：
 *   1. PostgreSQL（schema + seed 已加载）
 *   2. 跑起来的 Next.js
 *   3. 干净的数据库状态（每次 run 独立）
 *
 * global-setup 负责前两样。数据库用独立的 e2e 库，与 vitest 的
 * worker 库互不干扰。
 *
 * ## 为什么不并行
 *
 * 两条链路都涉及注册和跨用户访问，共用一个数据库。并行会互相污染。
 * 目前只有两条测试，串行的代价可以忽略；等测试变多再改成每 worker 一个库。
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3210);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/e2e',

  // 串行 —— 见文件头说明
  fullyParallel: false,
  workers: 1,

  // CI 上不允许 test.only 混进来
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: './test-results/e2e.xml' }]]
    : [['list']],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: BASE_URL,
    // 失败时才留证据，避免每次跑都产生几百 MB
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // 关掉动画，减少不稳定
    launchOptions: { args: ['--force-prefers-reduced-motion'] },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
