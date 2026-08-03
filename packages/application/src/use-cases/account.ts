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
import type { CoreRepositories } from '../ports/unit-of-work';
import type { UnitOfWork } from '../ports/unit-of-work';

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
  readonly deletedObjects: number;
  readonly failedObjects: readonly string[];
}

/**
 * 永久删除。**不可逆。**
 *
 * ## 顺序是有讲究的
 *
 *   1. 事务内：断言可删 → 收集 object key → 写审计 → DELETE user 行（CASCADE）
 *   2. 事务外：删对象存储里的字节
 *
 * 为什么收集 key 必须在删行之前：行删掉之后，assets 和 published_assets
 * 都被 CASCADE 清空了，再也查不到该删哪些文件。
 *
 * 为什么删字节在事务之外：对象存储不参与数据库事务。放进去的话，
 * 一个删文件失败会回滚已经成功的行删除，用户的删除请求变成「什么都没发生」。
 *
 * 反过来的失败（行删了、字节没删干净）不会泄露数据 ——
 * 所有读取路径都要先查到数据库里的记录才能拿到 objectKey，而记录已经没了。
 * 它是存储成本问题，所以记一条 storage_cleanup_incomplete 审计留待对账。
 */
export async function finalizeAccountDeletion(
  deps: FinalizeDeps,
  actor: Actor,
  userId: string
): Promise<FinalizeResult> {
  requireSystem(actor, '永久删除账号');
  const now = deps.clock.now();

  const keys = await deps.core.transaction(async (repos) => {
    const account = await loadAccount(repos, actor, userId);
    // 这一行是整个系统里唯一的「不可逆」守门。
    assertDeletable(account.status, account.deletion, now);

    const storageKeys = await repos.accounts.listStorageKeys(actor, userId);

    await repos.accounts.recordEvent(actor, {
      userId,
      type: 'deletion_finalized',
      fromStatus: account.status,
      toStatus: 'deleted',
      detail: {
        requestedAt: account.deletion.requestedAt.toISOString(),
        effectiveAt: account.deletion.effectiveAt.toISOString(),
        storageKeys: storageKeys.length,
      },
    });

    await repos.accounts.purge(actor, userId);
    return storageKeys;
  });

  // ── 事务之外：清字节 ──
  const all = new Set(keys);
  try {
    // 顺带扫一遍该用户的存储前缀：上传成功但数据库写失败会留下孤儿对象，
    // 它们在任何表里都查不到，只有这里能扫到。
    for await (const key of deps.storage.list(userObjectPrefix(userId))) {
      all.add(key);
    }
  } catch {
    // 列举失败不影响删除已知的 key —— 已知的那部分才是有引用的数据
  }

  const failed: string[] = [];
  let deleted = 0;
  for (const key of all) {
    try {
      await deps.storage.delete(key);
      deleted += 1;
    } catch {
      failed.push(key);
    }
  }

  if (failed.length > 0) {
    // 审计表没有外键，所以在 user 行已经不存在之后仍然写得进去 ——
    // 这正是当初不给它加外键的原因。
    await deps.core.accounts.recordEvent(actor, {
      userId,
      type: 'storage_cleanup_incomplete',
      detail: { failed: failed.slice(0, 50), failedCount: failed.length },
    });
  }

  return { userId, deletedObjects: deleted, failedObjects: failed };
}

/**
 * 定时任务入口：把所有到期的账号删掉。
 *
 * 单个失败不中断整批 —— 一个损坏的账号不该让其他人的删除请求
 * 无限期地卡在队列里。
 */
export async function runDueDeletions(
  deps: FinalizeDeps,
  actor: Actor,
  limit = 50
): Promise<{ results: FinalizeResult[]; errors: { userId: string; message: string }[] }> {
  requireSystem(actor, '批量执行到期删除');
  const due = await deps.core.accounts.listDueForDeletion(actor, deps.clock.now(), limit);

  const results: FinalizeResult[] = [];
  const errors: { userId: string; message: string }[] = [];
  for (const account of due) {
    try {
      results.push(await finalizeAccountDeletion(deps, actor, account.userId));
    } catch (err) {
      errors.push({
        userId: account.userId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { results, errors };
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
