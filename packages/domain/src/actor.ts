/**
 * 调用者身份 —— ADR-001
 *
 * 定义为联合类型而不是单一的 `{ userId }`：否则「公开 Publication 的匿名
 * 访问」和「后台清理任务」这两类合法场景只能靠绕过 Repository 约束来实现，
 * 等于给越权开了一道后门。
 *
 * 这个模块必须保持零依赖、零 IO —— scripts/check-architecture.mjs 会强制。
 */

export type Actor =
  | { readonly type: 'user'; readonly userId: string; readonly sessionId: string }
  | { readonly type: 'anonymous' }
  | { readonly type: 'system'; readonly reason: string };

export type UserActor = Extract<Actor, { type: 'user' }>;

// ── 构造器 ───────────────────────────────────────────────────────────────────

export function userActor(userId: string, sessionId: string): UserActor {
  return { type: 'user', userId, sessionId };
}

export const ANONYMOUS: Actor = { type: 'anonymous' };

/**
 * 系统 actor 必须写明 reason。
 *
 * 它既是审计线索，也是一道心理门槛 —— 写下「为什么这个操作需要越过用户
 * 边界」比默默传一个 admin flag 更难糊弄过去。
 */
export function systemActor(reason: string): Actor {
  if (!reason.trim()) {
    throw new Error('system actor 必须说明 reason');
  }
  return { type: 'system', reason };
}

// ── 错误 ─────────────────────────────────────────────────────────────────────

/**
 * 资源不存在，或调用者无权知道它是否存在。
 *
 * ⚠️ 这两种情况**故意**用同一个错误表示。对普通用户区分 403 和 404 会泄露
 * 「这个 id 存在」这一事实 —— 攻击者可以用它枚举资源。
 * 真实原因记在服务端日志里（见 reason 字段），对外统一 404。
 */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  /** 内部原因，只进日志，不进响应体 */
  readonly internalReason: 'absent' | 'forbidden';

  constructor(resource: string, internalReason: 'absent' | 'forbidden' = 'absent') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.internalReason = internalReason;
  }
}

/** 需要登录但 actor 是 anonymous */
export class UnauthenticatedError extends Error {
  readonly code = 'UNAUTHENTICATED' as const;
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * 明确的权限拒绝。
 *
 * 只用在「资源存在与否本身不敏感」的场景（例如配额、只读模式）。
 * 跨用户访问一律用 NotFoundError，不用这个。
 */
export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// ── 收窄 ─────────────────────────────────────────────────────────────────────

/** 收窄到已登录用户。需要 userId 的 Repository 方法用它。 */
export function requireUser(actor: Actor): UserActor {
  if (actor.type !== 'user') {
    throw new UnauthenticatedError(`此操作需要登录，当前 actor 是 ${actor.type}`);
  }
  return actor;
}

/** actor 是否能以「所有者」身份访问属于 ownerId 的资源 */
export function ownsResource(actor: Actor, ownerId: string): boolean {
  if (actor.type === 'system') return true; // 已在 systemActor 处留下 reason
  if (actor.type === 'user') return actor.userId === ownerId;
  return false;
}
