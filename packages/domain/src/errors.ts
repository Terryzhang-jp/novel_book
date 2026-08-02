/**
 * 跨聚合共用的错误类型
 *
 * 身份相关的错误（NotFoundError / UnauthenticatedError / ForbiddenError）在
 * actor.ts —— 它们的语义和「谁在调用」绑定。这里放的是与身份无关的冲突。
 */

/**
 * 唯一性冲突。
 *
 * 典型场景：两个人同时用同一个标题发布，slug 撞车。
 *
 * 刻意做成**可重试**的信号而不是 500：调用方应该换一个 slug 再试，
 * 而不是把 Postgres 的约束名（uq_publication_slug）扔给用户看。
 */
export class ConflictError extends Error {
  readonly code = 'CONFLICT' as const;
  /** 冲突的资源类别，例如 'publication.slug' */
  readonly resource: string;

  constructor(resource: string, detail?: string) {
    super(detail ? `${resource} 冲突：${detail}` : `${resource} 已被占用`);
    this.name = 'ConflictError';
    this.resource = resource;
  }
}

export function isConflictError(e: unknown): e is ConflictError {
  return e instanceof ConflictError;
}
