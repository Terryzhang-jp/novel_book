/**
 * Moment / Observation / Interpretation —— 体验层的核心（ADR-004）
 *
 * 三层必须在数据结构上分开，否则事后的解释会反向污染当时发生的事：
 *
 *   事实 Facts          时间、地点、素材、来源      客观，原始值不可覆盖
 *   观察 Observation    当时注意到什么              当场，可多条
 *   理解 Interpretation 后来如何解释                事后，可演化
 *
 * **Moment 不必须有照片。** 这是产品定位的分水岭 —— 若要求必须有，
 * 产品中心仍然是 Photo，只是改名叫 Moment。
 */

import type { JourneyId, UserId } from './journey';
import { InvariantViolation } from './journey';

export type MomentId = string;
export type ObservationId = string;
export type InterpretationRevisionId = string;

// ── 来源可追溯（事实层）──────────────────────────────────────────────────────

/**
 * 一个事实字段是怎么来的。
 *
 * 旧系统的教训：手动地点覆盖 EXIF 之后**原值无法恢复**。
 * 记下来源之后，「AI 推断的字段被用户纠正过」这件事就能被保护 ——
 * 不会被下一次 AI 推断再覆盖回去。
 */
export const PROVENANCE_SOURCES = ['exif', 'user', 'ai', 'derived'] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export interface FieldProvenance {
  readonly source: ProvenanceSource;
  /** AI 推断时必填 */
  readonly confidence?: number;
  readonly recordedAt?: string;
}

export interface MomentProvenance {
  readonly _v: 1;
  readonly [field: string]: FieldProvenance | 1;
}

// ── Moment ───────────────────────────────────────────────────────────────────

export interface Moment {
  readonly id: MomentId;
  readonly userId: UserId;
  /** 可空 —— 现场先速记，之后再归类（ADR-004 M4） */
  readonly journeyId?: JourneyId;
  readonly title?: string;
  readonly occurredAt?: string;
  /** 第一版用自由文本，不接 Place 系统 */
  readonly placeLabel?: string;
  readonly provenance: MomentProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateMomentInput {
  readonly journeyId?: JourneyId;
  readonly title?: string;
  readonly occurredAt?: string;
  readonly placeLabel?: string;
}

// ── Observation ──────────────────────────────────────────────────────────────

/**
 * 现场注意到什么。
 *
 * 允许多条：现场记一条、回家再记一条，是**两次不同的观察**，
 * 不是对同一条的编辑。所以它是列表而不是字段。
 */
export interface Observation {
  readonly id: ObservationId;
  readonly momentId: MomentId;
  readonly userId: UserId;
  readonly content: string;
  /** 什么时候记的 —— 与 moment.occurredAt（什么时候发生的）不同 */
  readonly recordedAt: string;
  readonly createdAt: string;
}

// ── Interpretation ───────────────────────────────────────────────────────────

export const INTERPRETATION_STATUSES = ['current', 'superseded'] as const;
export type InterpretationStatus = (typeof INTERPRETATION_STATUSES)[number];

/**
 * 一次理解。
 *
 * 建模成 revision 而不是 Moment 上的一个字符串字段 —— 变化的是**解释**，
 * 不是事实和观察。这条链支撑的是产品最独特的长期价值：
 *
 *   旅行当晚的理解 → 一周后的理解 → 和另一段旅行比较后的新理解
 */
export interface InterpretationRevision {
  readonly id: InterpretationRevisionId;
  readonly momentId: MomentId;
  readonly userId: UserId;
  readonly content: string;
  /** 指向被它取代的那一版。首版为 undefined。 */
  readonly supersedesId?: InterpretationRevisionId;
  /** 这次理解基于哪些观察 */
  readonly basedOnObservationIds: readonly ObservationId[];
  readonly status: InterpretationStatus;
  readonly createdAt: string;
}

// ── 不变量 ───────────────────────────────────────────────────────────────────

export function assertValidMomentInput(input: CreateMomentInput): void {
  if (input.occurredAt && Number.isNaN(Date.parse(input.occurredAt))) {
    throw new InvariantViolation('M-time', 'occurredAt 不是合法时间');
  }
  // 刻意不校验「必须有标题 / 必须有地点 / 必须有素材」——
  // Moment 可以只有一句观察。见 ADR-004 M1。
}

export function assertValidObservationContent(content: string): void {
  if (!content?.trim()) {
    throw new InvariantViolation('M-4', 'Observation 内容不能为空');
  }
}

export function assertValidInterpretationContent(content: string): void {
  if (!content?.trim()) {
    throw new InvariantViolation('I-content', 'Interpretation 内容不能为空');
  }
}

/**
 * 校验一次 supersede 是否合法。
 *
 * 数据库有唯一索引和触发器兜底，但在这里先校验能给出**可读的错误**，
 * 而不是把 Postgres 的约束名抛给用户。
 */
export function assertValidSupersede(
  momentId: MomentId,
  current: InterpretationRevision | null,
  supersedesId: InterpretationRevisionId | undefined
): void {
  if (!current) {
    if (supersedesId) {
      throw new InvariantViolation('I-2', '这是首个理解，不应该 supersede 任何 revision');
    }
    return;
  }
  if (!supersedesId) {
    throw new InvariantViolation(
      'I-2',
      `该 Moment 已有当前理解（${current.id}），新 revision 必须 supersede 它`
    );
  }
  if (supersedesId !== current.id) {
    throw new InvariantViolation(
      'I-2',
      `只能 supersede 当前理解 ${current.id}，不能 supersede 历史版本 ${supersedesId}`
    );
  }
  if (current.momentId !== momentId) {
    throw new InvariantViolation('I-4', '不能 supersede 另一个 Moment 的 revision');
  }
}

/**
 * 把 revision 列表按时间顺序还原成理解演化链。
 *
 * 纯函数 —— 链的形状是领域知识，不该散落在 UI 里。
 * 返回从最早到最新；`current` 必然是最后一个。
 */
export function buildInterpretationChain(
  revisions: readonly InterpretationRevision[]
): InterpretationRevision[] {
  if (revisions.length === 0) return [];

  const byId = new Map(revisions.map((r) => [r.id, r]));
  const supersededBy = new Map<InterpretationRevisionId, InterpretationRevision>();
  for (const r of revisions) {
    if (r.supersedesId) supersededBy.set(r.supersedesId, r);
  }

  // 起点：没有被任何 revision supersede 过的那一条之前……
  // 实际上起点是「supersedesId 为空」的那条
  const root = revisions.find((r) => !r.supersedesId);
  if (!root) {
    // 数据损坏（环）。不静默返回半个链 —— 那会让 UI 显示错误的历史。
    throw new InvariantViolation('I-6', 'Interpretation 链没有起点，可能存在环');
  }

  const chain: InterpretationRevision[] = [];
  const seen = new Set<InterpretationRevisionId>();
  let node: InterpretationRevision | undefined = root;
  while (node) {
    if (seen.has(node.id)) {
      throw new InvariantViolation('I-6', 'Interpretation 链存在环');
    }
    seen.add(node.id);
    chain.push(node);
    node = supersededBy.get(node.id);
  }

  if (chain.length !== revisions.length) {
    throw new InvariantViolation(
      'I-5',
      `链长度 ${chain.length} 与 revision 数 ${revisions.length} 不符 —— 可能存在分叉`
    );
  }
  // 未使用但保留：byId 便于将来做完整性诊断
  void byId;
  return chain;
}

/** 当前理解。没有则返回 null。 */
export function currentInterpretation(
  revisions: readonly InterpretationRevision[]
): InterpretationRevision | null {
  const currents = revisions.filter((r) => r.status === 'current');
  if (currents.length > 1) {
    throw new InvariantViolation('I-1', `一个 Moment 出现了 ${currents.length} 条当前理解`);
  }
  return currents[0] ?? null;
}
