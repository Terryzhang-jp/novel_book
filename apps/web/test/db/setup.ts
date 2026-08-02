/**
 * 集成测试的 Vitest setup
 *
 * 每个 worker 独立跑一次：建库 → 暴露连接池 → 结束时删库。
 *
 * ## 关于「没有数据库时怎么办」
 *
 * **CI 里必须失败，不能 skip 后显示绿色。**
 *
 * 「环境缺失就跳过」是测试体系里最常见的自欺方式：CI 一片绿，但实际上
 * 什么都没验证。所以这里的规则是：
 *
 *   CI（process.env.CI）        → 连不上数据库直接 throw，测试红
 *   本地且显式 ALLOW_NO_DB=1    → 打印醒目警告后跳过
 *   本地默认                    → 也 throw，并给出启动数据库的提示
 *
 * 本地开发想只跑单元测试，用 `pnpm test:unit`，不要靠 skip 集成测试。
 */

import { afterAll, beforeAll, inject } from 'vitest';
import pg from 'pg';
import {
  createWorkerDatabase,
  dropDatabase,
  dsnFor,
  probeFailed,
  probePostgres,
} from './template';

const { Pool } = pg;

/** 当前 worker 的连接池。测试通过 getPool() 获取。 */
let pool: pg.Pool | null = null;
let dbName: string | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error(
      'getPool() 在 setup 完成前被调用。' +
        '确认这个测试文件被 vitest.integration.config.ts 收录。'
    );
  }
  return pool;
}

export function getDbName(): string {
  if (!dbName) throw new Error('数据库尚未初始化');
  return dbName;
}

/** 便捷查询。返回 rows。 */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

/**
 * 在事务里跑一段测试并**总是回滚**。
 * 适合「不想让这条测试的写入影响后续测试」的场景。
 */
export async function inRollback<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

beforeAll(async () => {
  const probe = await probePostgres();

  if (probeFailed(probe)) {
    const hint = [
      '',
      '  集成测试需要一个可用的 PostgreSQL。',
      '',
      `  连接串: ${process.env.TEST_PG_ADMIN_URL ?? process.env.DATABASE_URL ?? '(默认 postgresql://localhost:5432/postgres)'}`,
      `  错误:   ${probe.error}`,
      '',
      '  本地启动方式（任选其一）：',
      '    brew services start postgresql@17',
      '    pnpm db:start                        # 完整 Supabase 本地栈（需 Docker）',
      '',
      '  只想跑单元测试： pnpm test:unit',
      '',
    ].join('\n');

    if (process.env.CI) {
      throw new Error(`CI 环境缺少 PostgreSQL —— 集成测试不能被跳过。${hint}`);
    }
    if (process.env.ALLOW_NO_DB === '1') {
      // eslint-disable-next-line no-console
      console.warn(
        `\n\x1b[43m\x1b[30m  ⚠  ALLOW_NO_DB=1：集成测试未运行，本次结果不代表通过  \x1b[0m${hint}`
      );
      return;
    }
    throw new Error(`无法连接 PostgreSQL。${hint}`);
  }

  // template 由 globalSetup 建好，这里只克隆
  const runId = inject('runId') as string;
  const workerId = process.env.VITEST_POOL_ID ?? '1';

  dbName = await createWorkerDatabase(runId, workerId);
  pool = new Pool({
    connectionString: dsnFor(dbName),
    // 每 worker 少量连接即可。worker 数 × max 不能超过 Postgres 的 max_connections。
    max: 4,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });

  // 冒烟：确认 seed 真的在
  const [{ count }] = await sql<{ count: string }>('SELECT count(*)::text AS count FROM users');
  if (Number(count) === 0) {
    throw new Error('测试库里没有 seed 数据 —— template 可能建错了');
  }
});

afterAll(async () => {
  // 无论测试成功失败都要清理，否则残留库会越积越多
  try {
    await pool?.end();
  } catch {
    /* 池已关闭 */
  }
  pool = null;

  if (dbName && process.env.KEEP_TEST_DB !== '1') {
    try {
      await dropDatabase(dbName);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`清理测试库失败 ${dbName}: ${(err as Error).message}`);
    }
  }
  dbName = null;
});
