/**
 * Route Handler 与新核心之间的接线
 *
 * Server Action 那一侧已经有 `run()` + `toUserMessage()`。Route Handler 需要
 * 的是同一组语义的 **HTTP 版本**：状态码、JSON 形状、以及「什么时候
 * 必须说 404」。
 *
 * 分开写是因为两者的失败表达方式不同（一个回文案，一个回状态码），
 * 但**判断依据必须是同一套错误类型** —— 否则同一个越权访问会在页面上
 * 变成 404、在 API 上变成 403，攻击者拿两条路径一对比就知道资源存在。
 */

import { NextResponse } from 'next/server';
import {
  ConflictError,
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  UnauthenticatedError,
  type Actor,
} from '@tc/domain';
import { AuthRequiredError } from '@/lib/auth/helpers';
import { AccountNotActiveError } from '@/lib/core/errors';
import { requireActor } from '@/lib/core/context';

export type ApiActor =
  | { readonly response: NextResponse; readonly actor: null }
  | { readonly response: null; readonly actor: Actor };

/**
 * 当前调用者，**并且账号必须是 active**。
 *
 * 和 `lib/api/guard.ts` 的 `requireApiAuth` 的区别正是这一条：那个只看
 * session 存不存在，看不到账号状态。遗留接口切到新用例之后必须走这一个 ——
 * 否则一个已申请删除的账号还能通过旧 URL 往系统里写东西（ADR-007 / 15B）。
 */
export async function requireApiActor(): Promise<ApiActor> {
  try {
    return { response: null, actor: await requireActor() };
  } catch (error) {
    return { response: apiError(error), actor: null };
  }
}

/**
 * 领域错误 → HTTP。
 *
 * ## 404 而不是 403
 *
 * NotFoundError 覆盖「不存在」和「不属于你」两种情况，两者返回**同一个**
 * 响应（ADR-001）。区分开会泄露 id 是否存在，那是可枚举的。
 *
 * ForbiddenError 是另一回事：它表达的是「这个动作你不能做」（账号被停用、
 * 只能由运维执行），资源是否存在本身不敏感，所以照实说 403。
 */
export function apiError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError || error instanceof UnauthenticatedError) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }
  if (error instanceof AccountNotActiveError) {
    return NextResponse.json(
      { error: error.message, code: 'ACCOUNT_NOT_ACTIVE', status: error.status },
      { status: 403 }
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message, code: 'FORBIDDEN' }, { status: 403 });
  }
  if (error instanceof InvariantViolation) {
    // 领域不变量的消息是写给人读的（「文件超过 25 MB」），可以原样回给客户端。
    // 编号去掉 —— 它对调用方没有意义。
    return NextResponse.json(
      {
        error: error.message.replace(/^违反不变量 [A-Za-z0-9-]+：/, ''),
        code: 'INVALID_INPUT',
      },
      { status: 400 }
    );
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message, code: 'CONFLICT' }, { status: 409 });
  }

  // 兜底。原始错误必须进服务端日志，但**不能**进响应体 ——
  // 数据库错误信息里常常带表名和列名。
  console.error('[api] 未预期的错误：', error);
  return NextResponse.json(
    { error: 'Internal error', code: 'INTERNAL' },
    { status: 500 }
  );
}
