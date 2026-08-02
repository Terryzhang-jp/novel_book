/**
 * 发布快照的组装 —— ADR-006 的核心
 *
 * 纯函数：给定「发布那一刻的实时数据」，产出一个**自洽的** WorkSnapshot。
 * 没有 IO，所以可以在单元测试里穷举各种形状（空 Work、墓碑 block、
 * 有观察没理解、有理解没观察……）。
 *
 * ## 一句话说清它在防什么
 *
 * 只存外键的「快照」不是快照。Moment 一改，旧 Publication 跟着变，
 * 用户点开三个月前分享出去的链接，看到的是他今天的想法 ——
 * 那正是这个产品最不该发生的事。
 */

import {
  assertSnapshotIsSelfContained,
  buildMomentTombstone,
  currentInterpretation,
  renumber,
  type InterpretationRevision,
  type Moment,
  type MomentId,
  type Observation,
  type PresentationConfig,
  type RendererType,
  type SnapshotBlock,
  type SnapshotMoment,
  type Work,
  type WorkBlock,
  type WorkSnapshot,
} from '@tc/domain';

export interface SnapshotSources {
  readonly work: Work;
  readonly blocks: readonly WorkBlock[];
  readonly presentation: { readonly rendererType: RendererType; readonly config: PresentationConfig };
  /** 被引用到的 Moment，按 id 索引 */
  readonly moments: ReadonlyMap<MomentId, Moment>;
  /** 每个 Moment 的观察，按 id 索引 */
  readonly observations: ReadonlyMap<MomentId, readonly Observation[]>;
  /** 每个 Moment 的全部 revision（不只是 current）—— 由这里挑出 current */
  readonly interpretations: ReadonlyMap<MomentId, readonly InterpretationRevision[]>;
  /** 引用的 Moment 已被删除时，墓碑的时间戳落哪一刻 */
  readonly now: string;
}

function freezeMoment(
  moment: Moment,
  observations: readonly Observation[],
  revisions: readonly InterpretationRevision[]
): SnapshotMoment {
  const current = currentInterpretation(revisions);
  return {
    ...(moment.title ? { title: moment.title } : {}),
    ...(moment.occurredAt ? { occurredAt: moment.occurredAt } : {}),
    ...(moment.placeLabel ? { placeLabel: moment.placeLabel } : {}),
    observations: observations.map((o) => ({
      id: o.id,
      content: o.content,
      recordedAt: o.recordedAt,
    })),
    // 冻结的是**内容本身**，不是 revisionId。
    // 只存 id 的话，用户改一次理解，三个月前的链接就变了。
    ...(current
      ? {
          interpretation: {
            revisionId: current.id,
            content: current.content,
            createdAt: current.createdAt,
          },
        }
      : {}),
  };
}

/**
 * 组装快照。
 *
 * 出口处调用 `assertSnapshotIsSelfContained` —— 与其相信这段代码永远正确，
 * 不如让它在写库之前自己证明一次。
 */
export function buildWorkSnapshot(src: SnapshotSources): WorkSnapshot {
  // position 重新规整成 0..n-1。数据库允许有空洞（只保证唯一），
  // 但快照的契约是「连续」，assertSnapshotIsSelfContained 会检查。
  const ordered = renumber(src.blocks);

  const blocks: SnapshotBlock[] = ordered.map((b, index) => {
    if (b.type === 'text') {
      return { type: 'text', position: index, text: b.textContent ?? '' };
    }

    const moment = b.momentId ? src.moments.get(b.momentId) : undefined;
    if (moment) {
      return {
        type: 'moment_ref',
        position: index,
        momentId: moment.id,
        moment: freezeMoment(
          moment,
          src.observations.get(moment.id) ?? [],
          src.interpretations.get(moment.id) ?? []
        ),
      };
    }

    // Moment 已被删除（或读不到）：用 block 上已有的墓碑；
    // 连墓碑都没有就现场造一个，绝不产出「只有 id 没有内容」的假快照。
    return {
      type: 'moment_ref',
      position: index,
      momentId: b.momentId ?? null,
      tombstone: b.tombstone ?? buildMomentTombstone({}, [], null, src.now),
    };
  });

  const snapshot: WorkSnapshot = {
    _v: 1,
    work: { id: src.work.id, title: src.work.title },
    presentation: { rendererType: src.presentation.rendererType, config: src.presentation.config },
    blocks,
  };

  assertSnapshotIsSelfContained(snapshot);
  return snapshot;
}
