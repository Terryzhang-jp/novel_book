/**
 * 账号生命周期用例 —— ADR-007
 *
 * ## 四个动作，四条路径
 *
 *   disableAccount            管理员停用     可恢复
 *   reactivateAccount         恢复
 *   requestAccountDeletion    用户申请删除   30 天内可撤销
 *   cancelAccountDeletion     撤销
 *   finalizeAccountDeletion   永久删除       **不可逆**
 *
 * 「退出登录」不在这里 —— 它由 Better Auth 处理，而且它**什么都不该改**。
 * 把它放进这个文件会给人一种「登出也是一种账号状态变更」的错觉。
 *
 * ## 撤销为什么用令牌，而不是登录后点一下
 *
 * ADR-007 要求 deletion_requested 状态下不能建立 session。那是对的：
 * 「我要删除这个账号」之后还能正常登录使用，等于删除申请没有任何效力。
 *
 * 于是撤销必须是一条不需要 session 的路径 —— 一次性令牌。
 * 明文只在申请的那一刻返回一次，落库的是 sha256。
 *
 * 已知代价：令牌丢了就只能走运维路径（scripts/account-lifecycle.mjs）。
 * 真实部署里这封信应该同时发到注册邮箱，邮件通道还没接
 * （verification-gaps.json → account-cancel-token-not-emailed）。
 */

import {
  ForbiddenError,
  NotFoundError,
  assertDeletable,
  assertTransitionAllowed,
  canCancelDeletion,
  deletionDeadline,
  requireUser,
  userObjectPrefix,
  type Account,
  type AccountEvent,
  type Actor,
  type ObjectStorage,
} from '@tc/domain';
import type { Clock, TokenIssuer } from '../ports/clock';
import type { CoreRepositories, UnitOfWork } from '../ports/unit-of-work';

export interface AccountDeps {
  readonly core: UnitOfWork;
  readonly clock: Clock;
  readonly tokens: TokenIssuer;
}

/**
 * 永久删除还要能删对象存储里的字节。
 *
 * 写成必填而不是 `storage?:` —— 可选的话，某个调用方忘了传，
 * 结果就是「数据库行删了，照片还在磁盘上」，而且没有任何报错。
 */
export interface FinalizeDeps extends AccountDeps {
  readonly storage: ObjectStorage;
}

/**
 * 只有系统 actor 能停用 / 恢复 / 执行永久删除。
 *
 * systemActor 强制带 reason，那句 reason 会原样进审计日志 ——
 * 「谁、何时、为什么」里的「为什么」就是这么来的。
 */
function requireSystem(actor: Actor, action: string): string {
  if (actor.type !== 'system') {
    throw new ForbiddenError(`${action} 只能由系统/运维执行，当前 actor 是 ${actor.type}`);
  }
  return actor.reason;
}

async function loadAccount(
  repos: CoreRepositories,
  actor: Actor,
  userId: string
): Promise<Account> {
  const account = await repos.accounts.findById(actor, userId);
  if (!account) throw new NotFoundError('Account');
  return account;
}

// ── 停用 / 恢复 ──────────────────────────────────────────────────────────────

export interface AccountActionResult {
  readonly account: Account;
  readonly revokedSessions: number;
}

/**
 * 停用。内容**一行都不删**。
 *
 * 效果只有两个：登不进来，公开页面取不到。
 * 这正是「可恢复」的含义 —— 恢复的时候不需要做任何数据修复。
 */
export async function disableAccount(
  deps: AccountDeps,
  actor: Actor,
  userId: string,
  reason?: string
): Promise<AccountActionResult> {
  const systemReason = requireSystem(actor, '停用账号');
  const at = deps.clock.now();

  return deps.core.transaction(async (repos) => {
    const before = await loadAccount(repos, actor, userId);
    assertTransitionAllowed(before.status, 'disabled');

    const account = await repos.accounts.transition(actor, userId, {
      from: before.status,
      to: 'disabled',
      at,
    });
    const revokedSessions = await repos.accounts.revokeSessions(actor, userId);

    await repos.accounts.recordEvent(actor, {
      userId,
      type: 'disabled',
      fromStatus: before.status,
      toStatus: 'disabled',
      reason: reason ?? systemReason,
      detail: { revokedSessions },
    });
    return { account, revokedSessions };
  });
}

export async function reactivateAccount(
  deps: AccountDeps,
  actor: Actor,
  userId: string,
  reason?: string
): Promise<Account> {
  const systemReason = requireSystem(actor, '恢复账号');
  const at = deps.clock.now();

  return deps.core.transaction(async (repos) => {
    const before = await loadAccount(repos, actor, userId);
    assertTransitionAllowed(before.status, 'active');

    const account = await repos.accounts.transition(actor, userId, {
      from: before.status,
      to: 'active',
      at,
    });
    await repos.accounts.recordEvent(actor, {
      userId,
      type: 'reactivated',
      fromStatus: before.status,
      toStatus: 'active',
      reason: reason ?? systemReason,
      detail: {},
    });
    return account;
  });
}

// ── 申请删除 ─────────────────────────────────────────────────────────────────

export interface DeletionRequest {
  readonly account: Account;
  /** ⚠️ 明文，只在这里出现这一次。落库的是它的 sha256。 */
  readonly cancelToken: string;
  readonly effectiveAt: Date;
  readonly revokedSessions: number;
}

/**
 * 用户申请删除自己的账号。
 *
 * 三件事在同一个事务里发生：状态变更、session 全部撤销、审计。
 * 撤销 session 包含**当前这一个** —— 申请完之后立刻就登出了。
 * 这不是副作用，是这个动作的定义：一个申请删除的账号不该还能继续用。
 */
export async function requestAccountDeletion(
  deps: AccountDeps,
  actor: Actor,
  input: { reason?: string } = {}
): Promise<DeletionRequest> {
  const { userId } = requireUser(actor);
  const now = deps.clock.now();
  const effectiveAt = deletionDeadline(now);
  const issued = deps.tokens.issue();

  return deps.core.transaction(async (repos) => {
    const before = await loadAccount(repos, actor, userId);
    assertTransitionAllowed(before.status, 'deletion_requested');

    const account = await repos.accounts.transition(actor, userId, {
      from: before.status,
      to: 'deletion_requested',
      at: now,
      deletion: { requestedAt: now, effectiveAt, cancelTokenHash: issued.hash },
    });
    const revokedSessions = await repos.accounts.revokeSessions(actor, userId);

    await repos.accounts.recordEvent(actor, {
      userId,
      type: 'deletion_requested',
      fromStatus: before.status,
      toStatus: 'deletion_requested',
      ...(input.reason ? { reason: input.reason } : {}),
      // ⚠️ 审计里**不写令牌**（明文和哈希都不写）。
      // 审计日志的读者是运维，他们不该因为读日志就获得撤销别人删除的能力。
      detail: { effectiveAt: effectiveAt.toISOString(), revokedSessions },
    });
    return { account, cancelToken: issued.token, effectiveAt, revokedSessions };
  });
}

/**
 * 撤销删除。**不需要 session** —— 申请之后就登不进来了。
 *
 * 找不到令牌时统一抛 NotFoundError，不区分「令牌错了」「已经撤销过」
 * 「已经删完了」。区分开就是一个在线的令牌探测器。
 */
export async function cancelAccountDeletion(
  deps: AccountDeps,
  actor: Actor,
  token: string
): Promise<Account> {
  const now = deps.clock.now();
  const hash = deps.tokens.hash(token);

  return deps.core.transaction(async (repos) => {
    const account = await repos.accounts.findByCancelTokenHash(actor, hash);
    if (!account || !account.deletion) throw new NotFoundError('DeletionRequest');

    // 到期之后不能再撤销。否则「30 天」的实际长度取决于
    // 定时任务什么时候跑到这一行 —— 那不是一个可以对用户承诺的期限。
    if (!canCancelDeletion(account.deletion, now)) {
      throw new NotFoundError('DeletionRequest');
    }
    assertTransitionAllowed(account.status, 'active');

    const restored = await repos.accounts.transition(actor, account.userId, {
      from: account.status,
      to: 'active',
      at: now,
    });
    await repos.accounts.recordEvent(actor, {
      userId: account.userId,
      type: 'deletion_cancelled',
      fromStatus: account.status,
      toStatus: 'active',
      detail: {
        // 撤销发生在等待期的哪一天，是个有用的产品信号
        graceRemainingMs: account.deletion.effectiveAt.getTime() - now.getTime(),
      },
    });
    return restored;
  });
}

// ── 永久删除 ─────────────────────────────────────────────────────────────────

export interface FinalizeResult {
  readonly userId: string;
  /** 排队等待清理的对象数 */
  readonly queuedObjects: number;
  /** 本次调用里当场删掉的 */
  readonly deletedObjects: number;
  /** 没删掉、留在队列里等重试的 */
  readonly retryingObjects: number;
  /** true = 这个账号在本次调用之前就已经删完了。**不是错误。** */
  readonly alreadyDeleted: boolean;
}

/** 一个对象重试多少次之后放弃并报警 */
export const MAX_CLEANUP_ATTEMPTS = 8;

/**
 * 事务内的删除主体。返回 null 表示这一行已经不在了。
 *
 * 抽出来是因为「点名删一个」和「批量删到期的」只在**怎么拿到账号**上不同：
 * 前者按 id 阻塞加锁，后者用 SKIP LOCKED 认领下一个。
 * 后面的步骤必须逐字相同，写两遍迟早会分叉。
 */
async function purgeLocked(
  repos: CoreRepositories,
  actor: Actor,
  account: Account,
  now: Date
): Promise<{ userId: string; queued: number }> {
  assertDeletable(account.status, account.deletion, now);

  const storageKeys = await repos.accounts.listStorageKeys(actor, account.userId);

  // ⭐ 要删哪些字节，**在事务里就写下来**。
  //
  // 14D 的做法是提交之后再循环删，进程崩在中间那些 key 就永远丢了 ——
  // 行已经没了，再也查不出该删什么。入队之后最坏情况只是「晚一点删」。
  const queued = await repos.storageCleanup.enqueue(
    actor,
    storageKeys.map((objectKey) => ({
      ownerId: account.userId,
      objectKey,
      reason: 'account_deleted' as const,
    }))
  );

  await repos.accounts.recordEvent(actor, {
    userId: account.userId,
    type: 'deletion_finalized',
    fromStatus: account.status,
    toStatus: 'deleted',
    detail: {
      requestedAt: account.deletion!.requestedAt.toISOString(),
      effectiveAt: account.deletion!.effectiveAt.toISOString(),
      storageKeys: storageKeys.length,
    },
  });

  await repos.accounts.purge(actor, account.userId);
  return { userId: account.userId, queued };
}

/**
 * 永久删除。**不可逆。**
 *
 * ## 顺序
 *
 *   1. 事务内：`FOR UPDATE` 锁住账号 → 断言可删 → 清理任务入队 → 写审计 → 删行
 *   2. 事务外：尽力跑一次清理队列
 *
 * 为什么删字节在事务之外：对象存储不参与数据库事务。放进去的话，
 * 一个删文件失败会回滚已经成功的行删除，用户的删除请求变成「什么都没发生」。
 *
 * 反过来的失败（行删了、字节还在）不泄露数据 —— 所有读取路径都要先查到
 * 数据库记录才能拿到 objectKey，而记录已经没了。它是存储成本问题，
 * 所以交给队列重试。
 *
 * ## 幂等
 *
 * 重复调用不会报错：第二次拿到的锁会发现行已经不在，直接返回
 * `alreadyDeleted: true`。定时任务重叠执行、运维手抖点两次、
 * 崩溃后重放 —— 都是安全的。
 */
export async function finalizeAccountDeletion(
  deps: FinalizeDeps,
  actor: Actor,
  userId: string
): Promise<FinalizeResult> {
  requireSystem(actor, '永久删除账号');
  const now = deps.clock.now();

  const outcome = await deps.core.transaction(async (repos) => {
    // 阻塞加锁：另一个进程正在删同一个账号时，这里会等它提交完，
    // 然后看到行已消失。**不用 SKIP LOCKED** —— 跳过之后返回「没找到」
    // 会被误读成「已经删完了」，而实际上那次删除可能刚刚回滚。
    const account = await repos.accounts.lockForDeletion(actor, userId);
    if (!account) return null; // 已经删完了
    return purgeLocked(repos, actor, account, now);
  });

  if (!outcome) {
    return {
      userId,
      queuedObjects: 0,
      deletedObjects: 0,
      retryingObjects: 0,
      alreadyDeleted: true,
    };
  }

  // 顺带扫一遍该用户的存储前缀：上传成功但数据库写失败会留下孤儿对象，
  // 它们在任何表里都查不到，只有这里能扫到。
  let extra = 0;
  try {
    const orphans: { ownerId: string; objectKey: string; reason: 'orphan' }[] = [];
    for await (const objectKey of deps.storage.list(userObjectPrefix(userId))) {
      orphans.push({ ownerId: userId, objectKey, reason: 'orphan' });
    }
    extra = await deps.core.storageCleanup.enqueue(actor, orphans);
  } catch {
    // 列举失败不影响已入队的部分 —— 那部分才是有引用的数据
  }

  const swept = await processStorageCleanup(deps, actor, { limit: outcome.queued + extra + 16 });
  return {
    userId,
    queuedObjects: outcome.queued + extra,
    deletedObjects: swept.deleted,
    retryingObjects: swept.failed,
    alreadyDeleted: false,
  };
}

/**
 * 定时任务入口：把所有到期的账号删掉。
 *
 * **一个一个认领**，而不是先 list 再逐个删。后者在两个工作进程同时跑时
 * 会列出同一批账号，然后其中一个的每一次删除都撞在另一个刚删掉的行上 ——
 * 表现为一半的任务「失败」，而实际上什么问题都没有。
 *
 * SKIP LOCKED 让它们各取各的：同一个账号只会被删一次，两个进程都不空转。
 */
export async function runDueDeletions(
  deps: FinalizeDeps,
  actor: Actor,
  limit = 50
): Promise<{ results: FinalizeResult[]; errors: { userId: string; message: string }[] }> {
  requireSystem(actor, '批量执行到期删除');

  const results: FinalizeResult[] = [];
  const errors: { userId: string; message: string }[] = [];

  for (let i = 0; i < limit; i++) {
    const now = deps.clock.now();
    let claimed: { userId: string; queued: number } | null;
    try {
      claimed = await deps.core.transaction(async (repos) => {
        const account = await repos.accounts.claimNextDueForDeletion(actor, now);
        if (!account) return null;
        return purgeLocked(repos, actor, account, now);
      });
    } catch (err) {
      // 单个失败不中断整批 —— 一个损坏的账号不该让别人的删除请求
      // 无限期卡在队列里。但也不能就这样接着循环：下一轮会再次认领到
      // 同一个账号（它还在 deletion_requested），变成死循环。
      // 所以记下来就停，交给下一次调度。
      errors.push({
        userId: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      });
      break;
    }

    if (!claimed) break; // 没有到期的了
    const swept = await processStorageCleanup(deps, actor, { limit: claimed.queued + 16 });
    results.push({
      userId: claimed.userId,
      queuedObjects: claimed.queued,
      deletedObjects: swept.deleted,
      retryingObjects: swept.failed,
      alreadyDeleted: false,
    });
  }

  return { results, errors };
}

// ── 清理队列 ─────────────────────────────────────────────────────────────────

export interface CleanupRun {
  readonly claimed: number;
  readonly deleted: number;
  readonly failed: number;
}

/**
 * 跑一轮对象清理。
 *
 * 可以被多个进程同时调用 —— `claimBatch` 用 `FOR UPDATE SKIP LOCKED`，
 * 各取各的。删除本身也是幂等的（对象不存在时 delete 不报错），
 * 所以即使同一个 key 被处理两次也没有后果。
 */
export async function processStorageCleanup(
  deps: FinalizeDeps,
  actor: Actor,
  options: { limit?: number } = {}
): Promise<CleanupRun> {
  requireSystem(actor, '清理对象存储');
  const now = deps.clock.now();
  const jobs = await deps.core.storageCleanup.claimBatch(actor, now, options.limit ?? 100);

  let deleted = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await deps.storage.delete(job.objectKey);
      await deps.core.storageCleanup.markDone(actor, job.id, deps.clock.now());
      deleted += 1;
    } catch (err) {
      await deps.core.storageCleanup.markFailed(
        actor,
        job.id,
        err instanceof Error ? err.message : String(err),
        deps.clock.now(),
        MAX_CLEANUP_ATTEMPTS
      );
      failed += 1;
    }
  }
  return { claimed: jobs.length, deleted, failed };
}

export function storageCleanupStats(uow: UnitOfWork, actor: Actor) {
  requireSystem(actor, '查看清理队列');
  return uow.storageCleanup.stats(actor);
}

// ── 查询 ─────────────────────────────────────────────────────────────────────

export async function getAccount(uow: UnitOfWork, actor: Actor): Promise<Account> {
  const { userId } = requireUser(actor);
  const account = await uow.accounts.findById(actor, userId);
  if (!account) throw new NotFoundError('Account');
  return account;
}

/** 本人只能看自己的；运维（system）可以看任意账号的。 */
export async function listAccountEvents(
  uow: UnitOfWork,
  actor: Actor,
  userId?: string
): Promise<AccountEvent[]> {
  if (actor.type === 'system') {
    if (!userId) throw new NotFoundError('Account');
    return uow.accounts.listEvents(actor, userId);
  }
  const me = requireUser(actor);
  if (userId && userId !== me.userId) throw new NotFoundError('Account');
  return uow.accounts.listEvents(actor, me.userId);
}
