/**
 * 集成测试的全局 setup —— 整个 run 只跑一次
 *
 * 职责：
 *   1. 清理上次异常退出留下的 worker 库
 *   2. 建（或复用）template database
 *   3. 生成本次 run 的唯一 id，供各 worker 命名自己的库
 */

import type { TestProject } from 'vitest/node';
import { cleanupStaleDatabases, ensureTemplate, probeFailed, probePostgres } from './template';

/**
 * supabase/config.toml 里声明的 db.major_version。
 * 两处要保持一致 —— 不一致说明测试环境没有准确模拟目标环境。
 */
const DECLARED_PG_MAJOR = 15;

export default async function globalSetup(project: TestProject) {
  const probe = await probePostgres();
  if (probeFailed(probe)) {
    // 这里不 throw —— 让 setup.ts 里那段带提示的逻辑统一处理，
    // 免得同一个错误报两遍、还少了排查提示。
    project.provide('runId', 'nodb');
    return;
  }

  // 本次 run 的 id。用时间戳而不是随机数，方便排查残留库是哪次留下的。
  const runId = `${Date.now().toString(36)}`;
  project.provide('runId', runId);

  const stale = await cleanupStaleDatabases();
  if (stale.length > 0) {
    console.log(`▸ 清理上次残留的测试库 ${stale.length} 个`);
  }

  const { templateName, created, elapsedMs } = await ensureTemplate();
  console.log(
    created
      ? `▸ 建立 template database ${templateName}（${elapsedMs}ms）`
      : `▸ 复用 template database ${templateName}`
  );
  console.log(`▸ PostgreSQL: ${probe.version}`);

  // 版本漂移检查。
  // 「本地能跑、线上炸」最常见的来源之一就是测试环境和生产环境的大版本不同：
  // 生成列、JSONB 操作符、并行查询计划、索引类型在 14/15/16/17 之间都有差异。
  // 这里不硬失败（会挡住新人上手），但必须显式告警 —— 沉默才是问题。
  const actualMajor = Number(/PostgreSQL (\d+)/.exec(probe.version)?.[1] ?? 0);
  const expectedMajor = Number(process.env.EXPECTED_PG_MAJOR ?? DECLARED_PG_MAJOR);
  if (actualMajor && actualMajor !== expectedMajor) {
    const msg =
      `▸ ⚠ PostgreSQL 大版本不一致：测试环境是 ${actualMajor}，` +
      `supabase/config.toml 声明的是 ${expectedMajor}。\n` +
      '    测试通过不代表在目标版本上也通过。请统一版本，或用 EXPECTED_PG_MAJOR 显式声明。';
    if (project.config.name && process.env.CI) {
      // CI 上视为错误 —— 生产版本必须被准确模拟
      throw new Error(msg);
    }
    console.warn(`\x1b[33m${msg}\x1b[0m`);
  }

  return async () => {
    // teardown：worker 库由各自的 afterAll 清理，这里只兜底
    const leftovers = await cleanupStaleDatabases();
    if (leftovers.length > 0) {
      console.log(`▸ 兜底清理 ${leftovers.length} 个测试库`);
    }
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    runId: string;
  }
}
