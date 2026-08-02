/**
 * E2E 全局 teardown —— 关应用 + 删库
 *
 * 无论测试成功失败都要执行，否则会留下跑着的 Next.js 进程和几十 MB 的
 * 僵尸数据库。global-setup 里也有开头清理作为二次保险。
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;
// 同上：不能用 import.meta
const STATE_FILE = join(process.cwd(), 'test-results/e2e-state.json');

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE_FILE)) return;

  const { dbName, pid, adminDsn } = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    dbName: string; pid: number; adminDsn: string;
  };

  // 杀整个进程组 —— next start 会 fork 子进程，只杀父进程会留下孤儿占着端口
  if (pid) {
    try { process.kill(-pid, 'SIGTERM'); } catch { /* 已退出 */ }
    await new Promise((r) => setTimeout(r, 500));
    try { process.kill(-pid, 'SIGKILL'); } catch { /* 已退出 */ }
  }

  if (dbName) {
    const c = new Client({ connectionString: adminDsn });
    try {
      await c.connect();
      await c.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [dbName]
      );
      await c.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      console.log(`▸ 已清理 e2e 数据库 ${dbName}`);
    } catch (e) {
      console.warn(`清理 e2e 数据库失败：${(e as Error).message}`);
    } finally {
      await c.end().catch(() => {});
    }
  }

  unlinkSync(STATE_FILE);
}
