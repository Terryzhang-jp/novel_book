/**
 * Vitest — 集成测试
 *
 * 边界：**连真实 PostgreSQL，禁止 mock 数据库。**
 *
 * 为什么单独一份配置而不是用 workspace/projects：
 * 两套测试的失败含义完全不同 —— 单元测试红了是逻辑错，集成测试红了可能是
 * 环境没起来。分开跑、分开报告，才不会互相掩盖。
 *
 * 数据库生命周期见 test/db/template.ts。
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { cpus } from 'node:os';

/**
 * worker 数上限。
 *
 * 每个 worker 一个数据库 + 一个连接池（max 4）。Postgres 默认
 * max_connections = 100，留出余量给 psql / 应用 / template 操作，
 * 所以最多 8 个 worker（8 × 4 = 32 连接）。
 */
const MAX_WORKERS = Math.max(1, Math.min(8, cpus().length - 1));

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    name: 'integration',
    environment: 'node',
    globals: false,
    include: ['test/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],

    globalSetup: ['./test/db/global-setup.ts'],
    setupFiles: ['./test/db/setup.ts'],

    // 每 worker 一个数据库 —— 必须用 forks 而不是 threads，
    // 因为 pg 连接池不能跨 worker 共享，且 fork 隔离更彻底。
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: MAX_WORKERS, minForks: 1 },
    },
    // 同一个文件内的测试串行，避免同库并发写互相干扰
    fileParallelism: true,
    sequence: { concurrent: false },

    // 建库 + 重放 migration 可能要几秒
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 30_000,

    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: './test-results/integration.xml' },

    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage/integration',
      include: ['lib/**/*.ts'],
    },
  },
});
