/**
 * Work / Block / Presentation / Version / Publication —— 创作层（ADR-005、006）
 *
 * 核心：**内容与表现严格分离，且只有一份内容真相。**
 *
 *   Work.blocks            语义：顺序、文字、引用了哪些 Moment
 *   Work.presentations[]   表现：每种输出各一套（web / magazine / poster / map）
 *
 * 旧系统的 CanvasElement 把 text 和 x/y/fontSize 平铺在一起，后果是
 * 用户必须一开始选工具 = 提前选定最终输出格式。
 */

import type { MomentId, ObservationId, InterpretationRevisionId } from './moment';
import type { UserId } from './journey';
import { InvariantViolation } from './journey';

export type WorkId = string;
export type WorkBlockId = string;
export type WorkPresentationId = string;
export type WorkVersionId = string;
export type PublicationId = string;

// ── Work ─────────────────────────────────────────────────────────────────────

export interface Work {
  readonly id: WorkId;
  readonly userId: UserId;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// 刻意没有 journeyId —— Work 可跨 Journey（ADR-005 W1）
// 刻意没有 isPublic —— 公开性由 Publication 管（ADR-006）

// ── Block ────────────────────────────────────────────────────────────────────

/**
 * 第一版只有两种。
 * 不要一上来就实现六种 —— 先证明「引用而非复制」这个模型对。
 */
export const WORK_BLOCK_TYPES = ['text', 'moment_ref'] as const;
export type WorkBlockType = (typeof WORK_BLOCK_TYPES)[number];

/** Moment 被删除时留下的墓碑，让 Work 不出现无法解释的空洞 */
export interface MomentTombstone {
  readonly _v: 1;
  readonly title?: string;
  readonly observations: readonly string[];
  readonly interpretation?: string;
  readonly deletedAt: string;
}

export interface WorkBlock {
  readonly id: WorkBlockId;
  readonly workId: WorkId;
  readonly position: number;
  readonly type: WorkBlockType;
  readonly textContent?: string;
  /** type='moment_ref' 时指向被引用的 Moment。Moment 被删后变 null。 */
  readonly momentId?: MomentId;
  readonly tombstone?: MomentTombstone;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ── Presentation ─────────────────────────────────────────────────────────────

export const RENDERER_TYPES = ['web', 'magazine', 'poster', 'map'] as const;
export type RendererType = (typeof RENDERER_TYPES)[number];

/**
 * 一个 Work 对每种输出各有一套配置。
 *
 * 这是独立实体而不是 Work 上的字段 —— 否则同一 Work 的网页版式和杂志
 * 版式会互相覆盖（ADR-005 修正）。
 */
export interface WorkPresentation {
  readonly id: WorkPresentationId;
  readonly workId: WorkId;
  readonly rendererType: RendererType;
  readonly config: PresentationConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PresentationConfig {
  readonly _v: 1;
  readonly theme?: string;
  readonly layout?: string;
  readonly typography?: Record<string, string>;
}

export const DEFAULT_PRESENTATION_CONFIG: PresentationConfig = { _v: 1, theme: 'plain' };

// ── Version / Snapshot ───────────────────────────────────────────────────────

/**
 * 发布快照。
 *
 * ## 判定标准
 *
 * 渲染一个 Publication 时，**不允许查询 moments / observations /
 * interpretation_revisions / work_blocks / work_presentations 任何实时表**。
 * 只读这个对象就能渲染出完整页面。
 *
 * 只存外键是不够的：Moment 或 Interpretation 一改，旧 Publication 跟着变，
 * 那就等于没有快照。
 */
export interface WorkSnapshot {
  readonly _v: 1;
  readonly work: { readonly id: WorkId; readonly title: string };
  readonly presentation: {
    readonly rendererType: RendererType;
    readonly config: PresentationConfig;
  };
  readonly blocks: readonly SnapshotBlock[];
}

export type SnapshotBlock = SnapshotTextBlock | SnapshotMomentBlock;

export interface SnapshotTextBlock {
  readonly type: 'text';
  readonly position: number;
  readonly text: string;
}

export interface SnapshotMomentBlock {
  readonly type: 'moment_ref';
  readonly position: number;
  /** 仅供追溯。**渲染器不得用它去查库。** */
  readonly momentId: MomentId | null;
  readonly moment?: SnapshotMoment;
  readonly tombstone?: MomentTombstone;
}

/** 发布那一刻冻结的 Moment 展示内容 */
export interface SnapshotMoment {
  readonly title?: string;
  readonly occurredAt?: string;
  readonly placeLabel?: string;
  readonly observations: readonly {
    readonly id: ObservationId;
    readonly content: string;
    readonly recordedAt: string;
  }[];
  /** 发布那一刻的 current revision —— 冻结的是**内容本身**，不是 id */
  readonly interpretation?: {
    readonly revisionId: InterpretationRevisionId;
    readonly content: string;
    readonly createdAt: string;
  };
}

export interface WorkVersion {
  readonly id: WorkVersionId;
  /** 可空 —— 删 Work 不删已发布版本（ADR-005/006） */
  readonly workId?: WorkId;
  readonly userId: UserId;
  readonly versionNumber: number;
  readonly snapshot: WorkSnapshot;
  readonly createdAt: string;
}

// ── Publication ──────────────────────────────────────────────────────────────

/** 第一版不含 `shared` */
export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export interface Publication {
  readonly id: PublicationId;
  readonly workVersionId: WorkVersionId;
  readonly userId: UserId;
  readonly slug: string;
  readonly visibility: Visibility;
  readonly publishedAt: string;
  /** 撤回不删记录 —— 否则无法区分「作者已下架」和「从来不存在」 */
  readonly withdrawnAt?: string;
}

export function isWithdrawn(p: Publication): boolean {
  return Boolean(p.withdrawnAt);
}

/** 匿名访问者能否看到 */
export function isPubliclyVisible(p: Publication): boolean {
  if (isWithdrawn(p)) return false;
  return p.visibility === 'public' || p.visibility === 'unlisted';
}

// ── 不变量与纯函数 ───────────────────────────────────────────────────────────

export function assertValidWorkTitle(title: string): void {
  if (!title?.trim()) throw new InvariantViolation('W-title', 'Work 标题不能为空');
}

export function assertValidBlock(
  type: WorkBlockType,
  input: { textContent?: string; momentId?: MomentId }
): void {
  if (type === 'text') {
    if (!input.textContent?.trim()) {
      throw new InvariantViolation('W-block', 'text block 必须有内容');
    }
  } else {
    if (!input.momentId) {
      throw new InvariantViolation('W-block', 'moment_ref block 必须指定 momentId');
    }
  }
}

/**
 * 重新编号 position，保证连续且从 0 开始。
 *
 * 纯函数：顺序规则是领域知识。数据库的唯一约束是 DEFERRABLE 的，
 * 所以重排序可以一次性提交而不撞中间状态。
 */
export function renumber<T extends { position: number }>(blocks: readonly T[]): T[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((b, i) => ({ ...b, position: i }));
}

/** slug 生成。同名冲突由 Repository 加后缀解决。 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    // 保留中日文与字母数字，其余转连字符
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'untitled';
}

/**
 * 校验快照是否自洽 —— 能否脱离原始表独立渲染。
 *
 * 这是 ADR-006 判定标准的可执行形式：发布前跑一次，
 * 保证我们没有存下一个「只有 id 没有内容」的假快照。
 */
export function assertSnapshotIsSelfContained(snapshot: WorkSnapshot): void {
  if (snapshot._v !== 1) {
    throw new InvariantViolation('P-1', `未知的 snapshot 版本 ${String(snapshot._v)}`);
  }
  if (!snapshot.work?.title) {
    throw new InvariantViolation('P-1', 'snapshot 缺少 work.title');
  }
  if (!snapshot.presentation?.rendererType) {
    throw new InvariantViolation('P-1', 'snapshot 缺少 presentation');
  }
  snapshot.blocks.forEach((b, i) => {
    if (b.position !== i) {
      throw new InvariantViolation('P-1', `snapshot blocks 顺序不连续（第 ${i} 项 position=${b.position}）`);
    }
    if (b.type === 'text') {
      if (typeof b.text !== 'string') {
        throw new InvariantViolation('P-1', `第 ${i} 个 text block 没有冻结文字`);
      }
      return;
    }
    // moment_ref：必须冻结内容或墓碑之一，光有 id 不算
    if (!b.moment && !b.tombstone) {
      throw new InvariantViolation(
        'P-3',
        `第 ${i} 个 moment_ref block 只有 id 没有冻结内容 —— 渲染时会需要查实时表`
      );
    }
  });
}
