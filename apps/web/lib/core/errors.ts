/**
 * 领域错误 → 给人看的文案
 *
 * 为什么要有这一层：领域层抛的是 `违反不变量 I-5：...`，那是给开发者看的。
 * 直接显示给用户，用户只会看到一串他不认识的编号。
 *
 * 但也不能全部压成「操作失败」—— 那样用户不知道该怎么办。
 * 所以逐类翻译，翻译不了的才用兜底文案，并且**把原始错误打进日志**。
 */

import {
  accountStatusExplanation,
  ConflictError,
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  UnauthenticatedError,
  type PersistedAccountStatus,
} from '@tc/domain';

/**
 * 账号不是 active（ADR-007）。
 *
 * 和 AuthRequiredError 分开：「你没登录」和「你的账号被停用了」对用户是
 * 完全不同的两件事。把后者显示成「请登录」，用户会反复尝试登录并怀疑密码错了。
 *
 * 定义在这个文件而不是 context.ts：那边会 import pg 和 next/navigation，
 * 而错误类型应该能被任何一层拿来判断，包括不碰数据库的那些。
 */
export class AccountNotActiveError extends Error {
  readonly code = 'ACCOUNT_NOT_ACTIVE' as const;
  readonly status: PersistedAccountStatus;
  constructor(status: PersistedAccountStatus) {
    super(accountStatusExplanation(status));
    this.name = 'AccountNotActiveError';
    this.status = status;
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof AccountNotActiveError) {
    return error.message;
  }
  if (error instanceof InvariantViolation) {
    // 领域不变量的消息本来就是写给人读的（「endedAt 不能早于 startedAt」），
    // 只是前面带了编号。去掉编号，保留内容。
    return error.message.replace(/^违反不变量 [A-Za-z0-9-]+：/, '');
  }
  if (error instanceof NotFoundError) {
    // 「不存在」和「不属于你」返回同一句 —— 不泄露资源是否存在（ADR-001）
    return '找不到这个内容，或者它不属于你。';
  }
  if (error instanceof ConflictError) {
    return error.message;
  }
  if (error instanceof UnauthenticatedError) {
    return '请先登录。';
  }
  if (error instanceof ForbiddenError) {
    // 和 NotFoundError 不同：这里资源是否存在**本身不敏感**（例如
    // 「停用账号只能由运维执行」），说清楚比含糊其辞更有用。
    return error.message;
  }

  // 兜底。原始错误必须留在服务端日志里，否则线上排查时什么都没有。
  console.error('[studio] 未预期的错误：', error);
  return '操作没有成功。请稍后重试。';
}
