/**
 * 账号生命周期 —— ADR-007
 *
 * ## 这个文件存在的理由
 *
 * 「退出登录」和「删除我的账号」在旧系统里走同一条代码路径（删 user 行）。
 * 一个是每天发生几十次的日常操作，一个是不可逆的终点。它们长得一样，
 * 是因为除了外键的 `ON DELETE CASCADE` 之外，没有任何地方写下过它们的区别。
 *
 * 这里把区别写下来，而且写成**纯函数**：状态机、能不能登录、能不能对外
 * 提供内容、什么时候可以真正执行删除。所有调用方（页面、API、定时任务、
 * 运维脚本）共用同一份判断。
 *
 * ## `deleted` 是一个不落库的状态
 *
 * 状态机的终点是 `deleted`，但数据库里查不到 status='deleted' 的行 ——
 * 那一步会把整行删掉，CASCADE 随即清空业务数据。`deleted` 存在于
 * account_events 的审计记录里。
 *
 * 之所以仍然把它放进类型：`canAuthenticate('deleted')` 这样的问题
 * 应该有答案，而不是「这个值不可能出现」然后在某处默认放行。
 */

import { InvariantViolation } from './journey';

export const ACCOUNT_STATUSES = ['active', 'disabled', 'deletion_requested', 'deleted'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** 能出现在 "user".status 里的值。`deleted` 不在其中 —— 那时候行已经没了。 */
export const PERSISTED_ACCOUNT_STATUSES = [
  'active',
  'disabled',
  'deletion_requested',
] as const;
export type PersistedAccountStatus = (typeof PERSISTED_ACCOUNT_STATUSES)[number];

export function isAccountStatus(v: unknown): v is AccountStatus {
  return typeof v === 'string' && (ACCOUNT_STATUSES as readonly string[]).includes(v);
}

export function isPersistedAccountStatus(v: unknown): v is PersistedAccountStatus {
  return (
    typeof v === 'string' && (PERSISTED_ACCOUNT_STATUSES as readonly string[]).includes(v)
  );
}

/**
 * 冷静期。
 *
 * 30 天不是随便挑的：它要长到足够一个人「反悔」（包括账号被他人恶意申请
 * 删除后本人有时间发现），又不能长到让「我要消失」变成一句空话。
 */
export const DELETION_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── 状态机 ───────────────────────────────────────────────────────────────────

/**
 * 允许的迁移。**没列出来的一律禁止**，包括看起来无害的那些：
 *
 *   disabled → deletion_requested   一个被停用的账号不该还能自助申请删除
 *                                    （他根本登录不进来），要删由运维直接终结
 *   deleted  → 任何状态              不可逆就是不可逆
 *
 * 白名单而不是黑名单：将来加状态时，忘记补规则的后果是「被拒绝」，
 * 不是「静默放行」。
 */
const ALLOWED_TRANSITIONS: Readonly<Record<AccountStatus, readonly AccountStatus[]>> = {
  active: ['disabled', 'deletion_requested'],
  disabled: ['active'],
  deletion_requested: ['active', 'deleted'],
  deleted: [],
};

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransitionAllowed(from: AccountStatus, to: AccountStatus): void {
  if (from === to) {
    throw new InvariantViolation('AC-1', `账号已经是 ${from} 状态`);
  }
  if (!canTransition(from, to)) {
    throw new InvariantViolation('AC-1', `不允许从 ${from} 迁移到 ${to}（ADR-007 状态机）`);
  }
}

// ── 状态决定什么 ─────────────────────────────────────────────────────────────

/**
 * 能不能建立 / 继续使用 session。
 *
 * ⚠️ 这个判断必须同时用在**两个**地方，少一个就有洞：
 *
 *   建立 session 时   否则停用之后还能重新登录进来
 *   每次读取 session 时 否则已经签发的 cookie 在过期前一直有效 ——
 *                      Better Auth 的 cookieCache 让这个窗口有 5 分钟
 */
export function canAuthenticate(status: AccountStatus): boolean {
  return status === 'active';
}

/**
 * 这个账号的公开内容能不能被送出去。
 *
 * 三种非 active 状态**全部**不能：
 *
 *   disabled            管理员停用，内容保留但不对外
 *   deletion_requested  用户说了「我要消失」，等 30 天的是数据，不是可见性
 *   deleted             行都没了
 *
 * 注意它和 canAuthenticate 目前取值相同，但**不是同一件事**。将来若出现
 * 「只读账号」（能登录不能改），两者就会分开。合并成一个函数会让那时候的
 * 修改必须先做一次考古。
 */
export function canServePublications(status: AccountStatus): boolean {
  return status === 'active';
}

// ── 删除窗口 ─────────────────────────────────────────────────────────────────

export function deletionDeadline(requestedAt: Date, graceDays = DELETION_GRACE_DAYS): Date {
  return new Date(requestedAt.getTime() + graceDays * DAY_MS);
}

export interface DeletionWindow {
  readonly requestedAt: Date;
  readonly effectiveAt: Date;
}

/**
 * 现在能不能撤销。
 *
 * 到期之后不能撤销 —— 否则「30 天」就没有终点：定时任务还没跑到的账号
 * 可以无限期地在到期后撤销，实际保留期变成「取决于任务什么时候跑」。
 */
export function canCancelDeletion(window: DeletionWindow, now: Date): boolean {
  return now.getTime() < window.effectiveAt.getTime();
}

/**
 * 现在能不能执行永久删除。
 *
 * 只判断时间。状态判断在 assertDeletable 里 —— 分开是为了让
 * 「还没到期」和「状态不对」是两条不同的错误信息。
 */
export function isDeletionDue(window: DeletionWindow, now: Date): boolean {
  return now.getTime() >= window.effectiveAt.getTime();
}

export function remainingGraceMs(window: DeletionWindow, now: Date): number {
  return Math.max(0, window.effectiveAt.getTime() - now.getTime());
}

/**
 * 永久删除的前置断言。
 *
 * 这是整个系统里唯一一处「不可逆」的守门。写成显式的断言而不是一串 if，
 * 是因为它将来一定会被定时任务、运维脚本、测试三种调用方复用，
 * 而其中任何一个漏掉一个条件都意味着**删错人**。
 */
export function assertDeletable(
  status: AccountStatus,
  window: DeletionWindow | undefined,
  now: Date
): asserts window is DeletionWindow {
  if (status !== 'deletion_requested') {
    throw new InvariantViolation(
      'AC-4',
      `只有 deletion_requested 的账号可以被永久删除，当前是 ${status}`
    );
  }
  if (!window) {
    // chk_deletion_fields 保证了这不会发生。留着是因为断言的成本是零，
    // 而它挡住的是「删除了一个没有等待期的账号」。
    throw new InvariantViolation('AC-2', 'deletion_requested 状态缺少等待期字段');
  }
  if (!isDeletionDue(window, now)) {
    const days = Math.ceil(remainingGraceMs(window, now) / DAY_MS);
    throw new InvariantViolation('AC-3', `冷静期还剩约 ${days} 天，不能提前执行永久删除`);
  }
}

// ── 审计 ─────────────────────────────────────────────────────────────────────

export const ACCOUNT_EVENT_TYPES = [
  'disabled',
  'reactivated',
  'deletion_requested',
  'deletion_cancelled',
  'deletion_finalized',
  'sessions_revoked',
  /** 行已经删了，但对象存储里还有字节没清干净 —— 必须留下痕迹 */
  'storage_cleanup_incomplete',
] as const;
export type AccountEventType = (typeof ACCOUNT_EVENT_TYPES)[number];

export interface AccountEvent {
  readonly id: string;
  readonly userId: string;
  readonly type: AccountEventType;
  readonly fromStatus?: AccountStatus;
  readonly toStatus?: AccountStatus;
  readonly actorType: 'user' | 'system' | 'anonymous';
  readonly actorId?: string;
  readonly reason?: string;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
}

// ── 账号 ─────────────────────────────────────────────────────────────────────

export interface Account {
  readonly userId: string;
  readonly email: string;
  readonly status: PersistedAccountStatus;
  readonly statusChangedAt: Date;
  readonly deletion?: DeletionWindow;
}

/** 从 Account 取出删除窗口 —— 断言函数需要它是可选的独立值 */
export function deletionWindowOf(account: Account): DeletionWindow | undefined {
  return account.deletion;
}

/**
 * 给用户看的状态说明。
 *
 * 放在 domain 而不是页面里：运维脚本、API 错误响应、页面提示应该说同一句话。
 * 三处各写一遍的结果是它们会慢慢分叉，然后用户在不同地方看到不同的解释。
 */
export const ACCOUNT_STATUS_LABELS: Readonly<Record<AccountStatus, string>> = {
  active: '正常',
  disabled: '已停用',
  deletion_requested: '已申请删除，等待期内',
  deleted: '已永久删除',
};

export function accountStatusExplanation(status: AccountStatus): string {
  switch (status) {
    case 'active':
      return '账号正常。';
    case 'disabled':
      return '账号已被停用。内容仍然完整保存在服务器上，但你无法登录，公开页面也已下架。';
    case 'deletion_requested':
      return '你申请了删除账号。公开页面已经下架，等待期结束后数据将被永久删除。等待期内可以撤销。';
    case 'deleted':
      return '账号及其全部数据已被永久删除，无法恢复。';
  }
}
