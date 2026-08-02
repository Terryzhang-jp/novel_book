/**
 * 集成测试的 PostgreSQL 生命周期管理
 *
 * ## 策略：template database + 每 worker 一个克隆
 *
 * 朴素做法是「每个 test file 重放一遍 migration + seed」——在 baseline 有
 * 660 行 DDL、seed 有 10 张照片的情况下，每次约 300–600ms，几十个测试文件
 * 就是几十秒的纯等待。
 *
 * PostgreSQL 的 `CREATE DATABASE ... TEMPLATE ...` 是文件级复制，
 * 实测比重放快一到两个数量级。所以：
 *
 *   进程启动  →  建一次 template（migration + seed 已加载）
 *   每个 worker →  从 template 克隆一个自己的库
 *   worker 结束 →  删自己的库
 *   进程结束  →  可选保留 template（下次复用）
 *
 * ## 必须处理的坑（每一条都踩过）
 *
 * 1. `CREATE DATABASE` **不能在事务里跑** —— 用独立连接，且不开事务
 * 2. 作为 template 的库**不能有任何活动连接**，否则报
 *    "source database is being accessed by other users"
 * 3. template 要标记 `datallowconn = false` 防止别人误连（可选，这里用
 *    主动断连代替，避免留下无法删除的库）
 * 4. 库名必须含 run id + worker id，否则并行跑会互相覆盖
 * 5. 测试崩溃时 afterAll 可能不执行 → 启动时清理上一次的残留
 * 6. worker 数要受控，否则 Postgres 的 max_connections（默认 100）会被打爆
 * 7. migration 或 seed 变了要自动重建 template —— 用内容 hash 做指纹
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

// ════════════════════════════════════════════════════════════════════════════
// 配置
// ════════════════════════════════════════════════════════════════════════════

const APP_ROOT = resolve(import.meta.dirname, '../..');
const MIGRATIONS_DIR = join(APP_ROOT, 'supabase/migrations');
const SEED_FILE = join(APP_ROOT, 'supabase/seed.sql');

/** 连到 `postgres` 维护库用于 CREATE/DROP DATABASE */
export const ADMIN_DSN =
  process.env.TEST_PG_ADMIN_URL ??
  process.env.DATABASE_URL?.replace(/\/[^/]*$/, '/postgres') ??
  'postgresql://localhost:5432/postgres';

/** 所有测试库共用的前缀，便于批量清理 */
const DB_PREFIX = 'tc_it_';

/** Supabase 平台垫片 —— 见 supabase/legacy/RECONSTRUCTION-NOTES.md */
const PLATFORM_SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
END $do$;
`;

// ════════════════════════════════════════════════════════════════════════════
// 工具
// ════════════════════════════════════════════════════════════════════════════

/** 用独立连接执行若干条语句。CREATE/DROP DATABASE 必须走这里（不能在事务内）。 */
async function withAdminClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: ADMIN_DSN });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function withDbClient<T>(dbName: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const dsn = ADMIN_DSN.replace(/\/[^/]*$/, `/${dbName}`);
  const client = new Client({ connectionString: dsn });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** 断开某个库上的所有其他连接。CREATE DATABASE ... TEMPLATE 之前必须做。 */
async function terminateConnections(admin: pg.Client, dbName: string): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
}

/**
 * migration + seed 的内容指纹。
 * 内容一变，template 名就变 → 自动重建，不会用到过期的 template。
 */
export function schemaFingerprint(): string {
  const h = createHash('sha256');
  const files = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];
  for (const f of files) {
    h.update(f);
    // 转成 Uint8Array —— 新版 @types/node 的 BinaryLike 不再直接接受 Buffer
    h.update(new Uint8Array(readFileSync(join(MIGRATIONS_DIR, f))));
  }
  if (existsSync(SEED_FILE)) h.update(new Uint8Array(readFileSync(SEED_FILE)));
  h.update(PLATFORM_SHIM);
  return h.digest('hex').slice(0, 12);
}

export function templateDbName(): string {
  return `${DB_PREFIX}tpl_${schemaFingerprint()}`;
}

// ════════════════════════════════════════════════════════════════════════════
// Template 建立
// ════════════════════════════════════════════════════════════════════════════

export interface EnsureTemplateResult {
  templateName: string;
  /** true = 本次新建，false = 复用已有 */
  created: boolean;
  elapsedMs: number;
}

/**
 * 确保 template database 存在且是最新的。幂等。
 *
 * 顺带清理**指纹不同的旧 template** —— 否则改一次 schema 就多留一个几十 MB
 * 的僵尸库。
 */
export async function ensureTemplate(): Promise<EnsureTemplateResult> {
  const t0 = Date.now();
  const name = templateDbName();

  const exists = await withAdminClient(async (admin) => {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    return rows.length > 0;
  });

  if (exists) {
    return { templateName: name, created: false, elapsedMs: Date.now() - t0 };
  }

  await withAdminClient(async (admin) => {
    // 清掉指纹过期的 template
    const { rows } = await admin.query(
      `SELECT datname FROM pg_database WHERE datname LIKE $1 AND datname <> $2`,
      [`${DB_PREFIX}tpl_%`, name]
    );
    for (const r of rows) {
      await terminateConnections(admin, r.datname);
      await admin.query(`DROP DATABASE IF EXISTS "${r.datname}"`);
    }
    await admin.query(`CREATE DATABASE "${name}"`);
  });

  // 在新库里装垫片 + 重放 migration + seed
  await withDbClient(name, async (c) => {
    await c.query(PLATFORM_SHIM);

    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) {
      throw new Error(`没有找到任何 migration：${MIGRATIONS_DIR}`);
    }
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
      try {
        await c.query(sql);
      } catch (err) {
        throw new Error(`migration 失败 ${f}: ${(err as Error).message}`);
      }
    }

    if (existsSync(SEED_FILE)) {
      try {
        await c.query(readFileSync(SEED_FILE, 'utf8'));
      } catch (err) {
        throw new Error(`seed 失败: ${(err as Error).message}`);
      }
    }
  });

  return { templateName: name, created: true, elapsedMs: Date.now() - t0 };
}

// ════════════════════════════════════════════════════════════════════════════
// Worker 数据库
// ════════════════════════════════════════════════════════════════════════════

/**
 * 从 template 克隆一个测试库。
 *
 * 名字含 run id 和 worker id：并行 worker 之间互不干扰，
 * 同一台机器上同时跑两次测试也不会撞车。
 */
export async function createWorkerDatabase(runId: string, workerId: string): Promise<string> {
  const template = templateDbName();
  const dbName = `${DB_PREFIX}${runId}_${workerId}`;

  await withAdminClient(async (admin) => {
    await terminateConnections(admin, dbName);
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    // CREATE DATABASE ... TEMPLATE 要求 template 上没有活动连接
    await terminateConnections(admin, template);
    await admin.query(`CREATE DATABASE "${dbName}" TEMPLATE "${template}"`);
  });

  return dbName;
}

export async function dropDatabase(dbName: string): Promise<void> {
  await withAdminClient(async (admin) => {
    await terminateConnections(admin, dbName);
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  });
}

/**
 * 清理上一次异常退出留下的测试库。
 *
 * 只清 worker 库，**不清 template** —— template 是可复用的缓存资产。
 * 用 `--force-template` 时才连 template 一起清。
 */
export async function cleanupStaleDatabases(options: { includeTemplates?: boolean } = {}): Promise<string[]> {
  const dropped: string[] = [];
  await withAdminClient(async (admin) => {
    const pattern = options.includeTemplates ? `${DB_PREFIX}%` : `${DB_PREFIX}%`;
    const { rows } = await admin.query(
      `SELECT datname FROM pg_database WHERE datname LIKE $1`,
      [pattern]
    );
    for (const r of rows) {
      const isTemplate = r.datname.startsWith(`${DB_PREFIX}tpl_`);
      if (isTemplate && !options.includeTemplates) continue;
      await terminateConnections(admin, r.datname);
      await admin.query(`DROP DATABASE IF EXISTS "${r.datname}"`);
      dropped.push(r.datname);
    }
  });
  return dropped;
}

/** 组装某个测试库的连接串 */
export function dsnFor(dbName: string): string {
  return ADMIN_DSN.replace(/\/[^/]*$/, `/${dbName}`);
}

/**
 * 探测 PostgreSQL 是否可用。
 *
 * ⚠️ 调用方**不得**在探测失败时 skip 测试然后显示绿色 ——
 * CI 里没有数据库就必须失败。见 test/db/setup.ts。
 */
export type ProbeResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

/** 类型守卫。比裸 `!probe.ok` 更稳，也让调用点的意图更明确。 */
export function probeFailed(p: ProbeResult): p is Extract<ProbeResult, { ok: false }> {
  return p.ok === false;
}

export async function probePostgres(): Promise<ProbeResult> {
  try {
    const version = await withAdminClient(async (c) => {
      const { rows } = await c.query<{ version: string }>('SELECT version()');
      return String(rows[0]?.version ?? '').split(' ').slice(0, 2).join(' ');
    });
    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
