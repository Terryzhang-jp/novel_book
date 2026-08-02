/**
 * Journey —— 一段有边界的现实外出经历（ADR-003）
 *
 * 私人容器：记录为什么出发、看到了什么、回来后有什么不同。
 * **不可公开** —— 这个类型里没有任何 visibility 字段，公开必须经过
 * Work → Publication。
 */

export type JourneyId = string;
export type UserId = string;

/**
 * 只有两类。不引入 `encounter` —— 一次偶遇更像 Moment 而不是 Journey，
 * 类型太多会让用户在开始记录前先替产品做分类作业。
 */
export const JOURNEY_TYPES = ['trip', 'outing'] as const;
export type JourneyType = (typeof JOURNEY_TYPES)[number];

export function isJourneyType(v: unknown): v is JourneyType {
  return typeof v === 'string' && (JOURNEY_TYPES as readonly string[]).includes(v);
}

export interface Journey {
  readonly id: JourneyId;
  readonly userId: UserId;
  readonly title: string;
  readonly type: JourneyType;
  /** 为什么出发。可空 —— 不强迫用户在记录前先想清楚意图。 */
  readonly intent?: string;
  readonly startedAt: string;
  /** 空表示「进行中」 */
  readonly endedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateJourneyInput {
  readonly title: string;
  readonly type: JourneyType;
  readonly intent?: string;
  readonly startedAt: string;
  readonly endedAt?: string;
}

// ── 不变量 ───────────────────────────────────────────────────────────────────

export class InvariantViolation extends Error {
  readonly code = 'INVARIANT_VIOLATION' as const;
  readonly invariant: string;
  constructor(invariant: string, detail: string) {
    super(`违反不变量 ${invariant}：${detail}`);
    this.name = 'InvariantViolation';
    this.invariant = invariant;
  }
}

/**
 * 纯校验。放在 domain 而不是 Service —— 它不需要 IO，
 * 且必须对所有调用方一致（HTTP、CLI、迁移脚本）。
 */
export function assertValidJourneyInput(input: CreateJourneyInput): void {
  if (!input.title?.trim()) {
    throw new InvariantViolation('J-title', 'title 不能为空');
  }
  if (!isJourneyType(input.type)) {
    throw new InvariantViolation('J-1', `type 只能是 ${JOURNEY_TYPES.join(' 或 ')}`);
  }
  if (!input.startedAt) {
    throw new InvariantViolation('J-4', 'startedAt 必填');
  }
  if (input.endedAt && input.endedAt < input.startedAt) {
    throw new InvariantViolation('J-4', 'endedAt 不能早于 startedAt');
  }
}

/** 进行中的 Journey（还没结束） */
export function isOngoing(journey: Journey): boolean {
  return !journey.endedAt;
}
