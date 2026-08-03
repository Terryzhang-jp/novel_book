/**
 * 与 pg 打交道的公共部分
 *
 * ADR-000：只用标准 pg driver，不用任何 Supabase SDK。
 * 这让整套核心能在「本地 Postgres、无 Docker、无平台账号」的环境下
 * 完整运行和测试 —— 一个平台实例的消失不能让系统失去可运行性。
 */

import type { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, InvariantViolation, NotFoundError } from '@tc/domain';

/**
 * 连接池或事务连接。
 *
 * 每个 Repository 都接受它，所以同一份实现既能走连接池，
 * 也能被绑到某个事务上 —— 事务边界由 UnitOfWork 决定，Repository 不关心。
 */
export type Queryable = Pool | PoolClient;

// ── Postgres 错误翻译 ────────────────────────────────────────────────────────

interface PgError extends Error {
  readonly code?: string;
  readonly constraint?: string;
  readonly detail?: string;
}

function isPgError(e: unknown): e is PgError {
  return e instanceof Error && typeof (e as PgError).code === 'string';
}

/**
 * 约束名 → 领域错误。
 *
 * ## 为什么要翻译
 *
 * 直接把 `duplicate key value violates unique constraint
 * "uq_publication_slug"` 抛给上层有两个问题：上层只能靠**字符串匹配**去判断
 * 发生了什么（这个项目已经因为字符串匹配出过一次事故 —— 23 个路由把 401
 * 返回成了 500），而且这段文字最终会出现在用户面前。
 *
 * 没列到的约束**原样抛出**，不做兜底翻译 —— 假装认识一个不认识的错误
 * 比报错更危险。
 */
const CONSTRAINT_MAP: Record<
  string,
  { kind: 'conflict' | 'invariant' | 'forbidden'; code: string; hint: string }
> = {
  uq_publication_slug: { kind: 'conflict', code: 'publication.slug', hint: '这个链接地址已被占用' },
  uq_interpretation_current: {
    kind: 'invariant',
    code: 'I-1',
    hint: '一个 Moment 只能有一条当前理解',
  },
  uq_interpretation_supersedes: {
    kind: 'invariant',
    code: 'I-5',
    hint: '这一版理解已经被别的版本取代过了 —— 再取代一次会让链分叉',
  },
  uq_work_block_position: { kind: 'invariant', code: 'W-3', hint: 'Work 内的 position 必须唯一' },
  uq_work_presentation: {
    kind: 'invariant',
    code: 'W-4',
    hint: '同一个 Work 的同一种输出只能有一套配置',
  },
  uq_work_version: { kind: 'invariant', code: 'P-2', hint: 'Work 的版本号必须唯一' },
  chk_block_shape: {
    kind: 'invariant',
    code: 'W-block',
    hint: 'text block 必须有文字；moment_ref block 必须有 Moment 或墓碑',
  },
  chk_journey_period: { kind: 'invariant', code: 'J-4', hint: 'endedAt 不能早于 startedAt' },
  chk_snapshot_versioned: { kind: 'invariant', code: 'P-1', hint: '快照必须带 _v 版本号' },
  chk_no_self_supersede: { kind: 'invariant', code: 'I-4', hint: '一版理解不能取代它自己' },

  // 触发器抛的（20260809000000）。它带 CONSTRAINT 子句，所以走的是这张表
  // 而不是下面那条按 message 前缀的兜底 —— 后者认的是「违反不变量 」开头的消息。
  require_active_owner: {
    kind: 'forbidden',
    code: 'AC-5',
    hint: '这个账号已被停用或正在等待删除，系统不再为它写入新内容',
  },
};

/** 把一次 pg 调用包起来，出错时翻译成领域错误 */
export async function translating<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isPgError(err)) throw err;

    const mapped = err.constraint ? CONSTRAINT_MAP[err.constraint] : undefined;
    if (mapped) {
      if (mapped.kind === 'conflict') throw new ConflictError(mapped.code, mapped.hint);
      // ForbiddenError 而不是 NotFoundError：这里资源存在与否本身不敏感 ——
      // 调用方就是账号本人或代表他的后台任务，说清楚比含糊其辞有用。
      if (mapped.kind === 'forbidden') throw new ForbiddenError(mapped.hint);
      throw new InvariantViolation(mapped.code, mapped.hint);
    }

    // 触发器抛的 RAISE EXCEPTION 没有 constraint 字段，只能认 message。
    // 只认我们自己写的前缀，不做模糊匹配。
    if (err.message.startsWith('违反不变量 ')) {
      const code = /违反不变量 ([A-Za-z0-9-]+)/.exec(err.message)?.[1] ?? '未知';
      throw new InvariantViolation(code, err.message);
    }

    throw err;
  }
}

/** 影响行数为 0 → 资源不存在或不属于 actor。两者返回同一个错误（ADR-001）。 */
export function assertAffected(rowCount: number | null, resource: string): void {
  if (!rowCount) throw new NotFoundError(resource, 'forbidden');
}
