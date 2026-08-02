/**
 * E2E 全局 setup —— 建库 + 起应用
 *
 * 用独立的 e2e 数据库（`tc_e2e_*`），与 vitest 的 worker 库
 * （`tc_it_*`）互不干扰：两者可以同时跑。
 *
 * 应用用生产构建启动而不是 dev server：
 *   · dev server 的首次编译会让第一个测试超时
 *   · 我们要验证的是生产行为，不是 dev 行为
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

// Playwright 以 config 所在目录为 cwd 运行；不能用 import.meta（CJS 上下文）
const APP_ROOT = process.cwd();
const MIGRATIONS_DIR = join(APP_ROOT, 'supabase/migrations');
const SEED_FILE = join(APP_ROOT, 'supabase/seed.sql');
const STATE_FILE = join(APP_ROOT, 'test-results/e2e-state.json');

const ADMIN_DSN =
  process.env.TEST_PG_ADMIN_URL ??
  process.env.DATABASE_URL?.replace(/\/[^/]*$/, '/postgres') ??
  'postgresql://localhost:5432/postgres';

const PLATFORM_SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
END $do$;
`;

async function withClient<T>(dsn: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: dsn });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      // 任何 HTTP 响应都说明服务器起来了 —— 包括 307（未登录重定向到 /login）
      if (res.status > 0) return;
    } catch (e) {
      lastError = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`应用在 ${timeoutMs}ms 内没有起来。最后一次错误：${lastError}`);
}

export default async function globalSetup(): Promise<void> {
  const port = Number(process.env.E2E_PORT ?? 3210);
  const baseUrl = `http://127.0.0.1:${port}`;
  const dbName = `tc_e2e_${Date.now().toString(36)}`;
  const dsn = ADMIN_DSN.replace(/\/[^/]*$/, `/${dbName}`);

  // ── 1. 建库 ───────────────────────────────────────────────────────────────
  console.log(`▸ 创建 e2e 数据库 ${dbName}`);
  await withClient(ADMIN_DSN, async (admin) => {
    // 顺便清掉上次崩溃留下的 e2e 库
    const { rows } = await admin.query(
      `SELECT datname FROM pg_database WHERE datname LIKE 'tc_e2e_%'`
    );
    for (const r of rows) {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [r.datname]
      );
      await admin.query(`DROP DATABASE IF EXISTS "${r.datname}"`);
    }
    await admin.query(`CREATE DATABASE "${dbName}"`);
  });

  await withClient(dsn, async (c) => {
    await c.query(PLATFORM_SHIM);
    for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
      await c.query(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    }
    if (existsSync(SEED_FILE)) await c.query(readFileSync(SEED_FILE, 'utf8'));
  });

  // ── 2. 起应用 ─────────────────────────────────────────────────────────────
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DATABASE_URL: dsn,
    BETTER_AUTH_SECRET: 'e2e-secret-at-least-32-characters-long',
    BETTER_AUTH_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
    // 应用启动时会校验这些变量存在。E2E 不碰 Supabase Storage，
    // 所以值本身不重要 —— 但缺了会在模块顶层 throw。
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'e2e-anon',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'e2e-service',
  };

  console.log(`▸ 启动应用 ${baseUrl}（生产构建）`);
  const server: ChildProcess = spawn('pnpm', ['next', 'start', '-p', String(port)], {
    cwd: APP_ROOT,
    env,
    stdio: 'pipe',
    detached: true, // 独立进程组，teardown 时能整组杀掉
  });

  let serverLog = '';
  server.stdout?.on('data', (d) => { serverLog += String(d); });
  server.stderr?.on('data', (d) => { serverLog += String(d); });

  try {
    await waitForServer(`${baseUrl}/login`, 60_000);
  } catch (e) {
    console.error('应用启动失败，日志：\n' + serverLog.slice(-3000));
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* 已退出 */ }
    throw e;
  }

  console.log(`▸ 应用已就绪`);

  // teardown 需要这些信息。Playwright 的 globalSetup 无法直接向
  // globalTeardown 传值，所以落盘。
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ dbName, pid: server.pid, adminDsn: ADMIN_DSN }, null, 2)
  );
}
