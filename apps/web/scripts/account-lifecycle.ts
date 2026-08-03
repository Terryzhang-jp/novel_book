#!/usr/bin/env tsx
/**
 * 账号生命周期的运维入口 —— ADR-007
 *
 *   pnpm account status   <email|userId>
 *   pnpm account disable  <email|userId> --reason "..."
 *   pnpm account restore  <email|userId> --reason "..."
 *   pnpm account finalize <email|userId> --reason "..." [--now <ISO>]
 *   pnpm account run-due  --reason "..." [--now <ISO>] [--limit 50]
 *   pnpm account cleanup  --reason "..." [--limit 200]
 *
 * ## 为什么它必须走用例层，而不是直接写 SQL
 *
 * 这个脚本执行的是全系统唯一不可逆的操作。如果它自己拼一条
 * `DELETE FROM "user"`，那么状态机、冷静期断言、审计写入、对象存储清理
 * 就全都绕过去了 —— 而运维恰恰是最需要这些保护的场景，因为出手的人
 * 通常正处在「线上出事了赶紧处理」的状态。
 *
 * 所以这里只做三件事：解析参数、装配依赖、调用和页面完全相同的用例。
 * （数据库的 trg_guard_user_delete 触发器也保证了这一点：
 * 任何绕过 AccountRepository.purge 的删除语句都会直接报错。）
 *
 * ## --now 不是「假装时间」
 *
 * 它注入的是 Clock 端口，和生产走同一条代码路径。用途是演练：
 * 「如果今天是 9 月 5 日，run-due 会删掉谁？」
 *
 * ⚠️ 它**可以**用来提前执行删除。这是刻意的 —— 运维需要这个能力
 * （比如法务要求立即删除）。代价是它绕过了冷静期，所以每次使用都会
 * 带着 reason 进审计表。
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import {
  disableAccount,
  finalizeAccountDeletion,
  fixedClock,
  reactivateAccount,
  processStorageCleanup,
  RecordingAccountLifecycleNotifier,
  runDueDeletions,
  systemClock,
  type Clock,
  type FinalizeDeps,
} from '@tc/application';
import {
  ACCOUNT_STATUS_LABELS,
  systemActor,
  type Account,
  type Actor,
} from '@tc/domain';
// 复用应用自己的存储接线：运维脚本用另一套配置，就等于删的是另一个目录
import { getObjectStorage } from '../lib/core/storage';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function findAccount(pool: Pool, identifier: string): Promise<Account> {
  // 支持 email 或 id —— 运维手上通常只有用户报来的邮箱
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM "user" WHERE id = $1 OR lower(email) = lower($1)',
    [identifier]
  );
  const id = rows[0]?.id;
  if (!id) fail(`找不到账号：${identifier}`);

  const uow = new PostgresUnitOfWork(pool);
  const actor = systemActor('运维查询');
  const account = await uow.accounts.findById(actor, id);
  if (!account) fail(`找不到账号：${identifier}`);
  return account;
}

function describe(account: Account): string {
  const parts = [
    `${account.email}  (${account.userId})`,
    `状态：${ACCOUNT_STATUS_LABELS[account.status]}`,
  ];
  if (account.deletion) {
    parts.push(`申请于：${account.deletion.requestedAt.toISOString()}`);
    parts.push(`可执行删除：${account.deletion.effectiveAt.toISOString()}`);
  }
  return parts.join('\n  ');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const identifier = argv[1];

  if (!command) {
    fail('用法：pnpm account <status|disable|restore|finalize|run-due|cleanup> [identifier] [flags]');
  }
  if (!process.env.DATABASE_URL) fail('DATABASE_URL 未配置');

  const nowFlag = flag(argv, 'now');
  const clock: Clock = nowFlag ? fixedClock(new Date(nowFlag)) : systemClock;
  if (nowFlag && Number.isNaN(clock.now().getTime())) fail(`--now 不是合法时间：${nowFlag}`);

  const reason = flag(argv, 'reason');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

  try {
    const core = new PostgresUnitOfWork(pool);
    const deps: FinalizeDeps = {
      core,
      clock,
      // 运维路径不签发撤销令牌（它不申请删除，只执行或恢复）。
      // 给一个明确会爆的实现，而不是一个能悄悄产生弱令牌的假实现。
      tokens: {
        issue: () => fail('运维路径不应该签发撤销令牌'),
        hash: () => fail('运维路径不应该校验撤销令牌'),
      },
      storage: getObjectStorage(),
      // 运维路径也走同一套通知接线。当前实现只记录不发送，
      // 但把它接上意味着将来换真实 adapter 时运维动作也自动有通知。
      notifier: new RecordingAccountLifecycleNotifier((m) => console.log(`  ${m}`)),
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    };

    if (command === 'run-due') {
      if (!reason) fail('run-due 必须带 --reason（会进审计表）');
      const actor: Actor = systemActor(reason);
      const limit = Number(flag(argv, 'limit') ?? 50);
      const { results, errors } = await runDueDeletions(deps, actor, limit);
      console.log(`✓ 永久删除 ${results.length} 个到期账号（判定时刻 ${clock.now().toISOString()}）`);
      for (const r of results) {
        console.log(
          `  ${r.userId}：入队 ${r.queuedObjects} 个对象，已清理 ${r.deletedObjects} 个，` +
            `${r.retryingObjects} 个留在队列里重试`
        );
      }
      for (const e of errors) console.error(`  ✖ ${e.userId}：${e.message}`);
      const after = await core.storageCleanup.stats(actor);
      console.log(`  清理队列：待处理 ${after.pending}，已放弃 ${after.abandoned}`);
      return;
    }

    if (command === 'cleanup') {
      if (!reason) fail('cleanup 必须带 --reason（会进审计表）');
      const actor: Actor = systemActor(reason);
      const run = await processStorageCleanup(deps, actor, {
        limit: Number(flag(argv, 'limit') ?? 200),
      });
      const after = await core.storageCleanup.stats(actor);
      console.log(
        `✓ 认领 ${run.claimed}，删除 ${run.deleted}，失败 ${run.failed}。` +
          `队列剩余 ${after.pending}，已放弃 ${after.abandoned}`
      );
      if (after.abandoned > 0) {
        console.error(
          `  ⚠ 有 ${after.abandoned} 个对象重试到上限仍未删掉 —— 需要人工查看 ` +
            `storage_cleanup_jobs.last_error`
        );
      }
      return;
    }

    if (!identifier) fail(`${command} 需要一个 email 或 userId`);
    const account = await findAccount(pool, identifier);

    switch (command) {
      case 'status': {
        console.log(`  ${describe(account)}`);
        const events = await core.accounts.listEvents(systemActor('运维查询'), account.userId, {
          limit: 20,
        });
        if (events.length) {
          console.log('\n  最近的状态变更：');
          for (const e of events) {
            console.log(
              `    ${e.occurredAt.toISOString()}  ${e.type}` +
                `${e.reason ? `  —— ${e.reason}` : ''}`
            );
          }
        }
        return;
      }

      case 'disable': {
        if (!reason) fail('disable 必须带 --reason（会进审计表）');
        const result = await disableAccount(deps, systemActor(reason), account.userId, reason);
        console.log(`✓ 已停用 ${result.account.email}，撤销 ${result.revokedSessions} 个 session`);
        console.log('  内容一行都没删。restore 可以完全恢复。');
        return;
      }

      case 'restore': {
        // 也是「用户弄丢了撤销令牌」的唯一出路：
        // deletion_requested → active 在状态机里是允许的。
        if (!reason) fail('restore 必须带 --reason（会进审计表）');
        const restored = await reactivateAccount(deps, systemActor(reason), account.userId, reason);
        console.log(`✓ 已恢复 ${restored.email}`);
        return;
      }

      case 'finalize': {
        if (!reason) fail('finalize 必须带 --reason（会进审计表）');
        console.log(`⚠ 即将永久删除 ${account.email} 的全部数据。这一步不可逆。`);
        const result = await finalizeAccountDeletion(
          deps,
          systemActor(reason),
          account.userId
        );
        if (result.alreadyDeleted) {
          console.log('✓ 这个账号之前就已经删完了，什么都没有变（幂等）。');
          return;
        }
        console.log(
          `✓ 已永久删除。入队 ${result.queuedObjects} 个对象，已清理 ${result.deletedObjects} 个。`
        );
        if (result.retryingObjects) {
          console.error(
            `  ⚠ ${result.retryingObjects} 个对象这次没删掉，留在队列里重试。` +
              `跑 \`pnpm account cleanup --reason ...\` 可以再推一轮。`
          );
        }
        return;
      }

      default:
        fail(`未知命令 ${command}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
