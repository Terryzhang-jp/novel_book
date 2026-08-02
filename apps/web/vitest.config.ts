/**
 * Vitest — 单元测试
 *
 * 边界：**允许 mock，禁止碰数据库和网络。**
 * 这一层测的是纯逻辑：输入校验、EXIF 归一化、JSON 转换、权限判断函数、
 * 排版算法、以及未来的领域纯函数。
 *
 * 需要真实数据库的测试放 vitest.integration.config.ts，两者不共享配置，
 * 免得「本来该连库的测试被 mock 掉了」这种事悄悄发生。
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    name: 'unit',
    environment: 'node',
    globals: false, // 显式 import，不靠全局注入
    include: ['test/unit/**/*.test.{ts,tsx}', 'lib/**/*.unit.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],

    // 单元测试必须快。超过 5 秒说明它在做不该做的事（IO / 网络 / 等待）。
    testTimeout: 5_000,
    hookTimeout: 5_000,

    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: './test-results/unit.xml' },

    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage/unit',
      include: ['lib/**/*.ts', 'scripts/**/*.mjs'],
      exclude: [
        'lib/**/*.d.ts',
        'lib/supabase/**', // 遗留 adapter，由集成测试覆盖
        '**/*.test.ts',
      ],
      // 现在不设阈值 —— 覆盖率目标应该在有足够测试之后再定，
      // 提前设一个能通过的低阈值只会制造虚假达标感。
    },
  },
});
