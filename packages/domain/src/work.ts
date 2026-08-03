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

import type { MomentAssetRole } from './asset';
import {
  assertRendererAvailable,
  defaultConfigFor,
  freezePresentation,
  isRendererType,
  parsePresentationConfig,
  type FrozenPresentation,
  type PresentationConfig,
  type RendererType,
} from './presentation';
import type {
  InterpretationRevision,
  InterpretationRevisionId,
  Moment,
  MomentId,
  Observation,
  ObservationId,
} from './moment';
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
export const SNAPSHOT_VERSION = 2;

export interface WorkSnapshot {
  readonly _v: 2;
  readonly work: { readonly id: WorkId; readonly title: string };
  /**
   * 表现。四个字段缺一不可（ADR-010 R2）——
   * 少了 rendererVersion，半年后改一次渲染代码，旧 Publication 的外观
   * 就跟着变了，而 JSON 一个字节都没动。
   */
  readonly presentation: FrozenPresentation;
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

/**
 * 快照里的一份素材 —— ADR-008 A9。
 *
 * 这里存的**永远是派生副本**，不是原图（S-2）。原图永不公开。
 *
 * 两个 hash 分工不同：
 *   derivedHash  出现在公开 URL 里。用它而不是 objectKey，
 *                因为 objectKey 含 `users/{userId}/`，会泄露作者的内部 id
 *   objectKey    服务端取件用，不出现在页面上
 *
 * 刻意**没有 URL 字段**（S-1）：签名 URL 会过期，存进不可变快照
 * 就等于给这篇文章设了一个到期日，过期后整页变裂图。
 */
/**
 * 冻结在快照里的一份发布派生副本。
 *
 * `kind` 决定哪几个字段有意义 —— 图片有宽高，音频有时长。
 * 不用一组「可选字段随便填」是因为渲染端否则只能靠 mimeType 猜自己该读什么，
 * 而那正是 timezone 那一列的教训（一处装两种语义，读取方靠猜）。
 */
export type SnapshotAsset = {
  readonly role: MomentAssetRole;
  readonly derivedHash: string;
  readonly objectKey: string;
  readonly mimeType: string;
  readonly note?: string;
} & (
  | { readonly kind: 'image'; readonly width: number; readonly height: number }
  | { readonly kind: 'audio'; readonly durationMs: number }
);

/**
 * 派生副本在公开 URL 里的文件名。
 *
 * 只出现内容 hash 和扩展名 —— objectKey 里有 userId，放进公开 URL
 * 等于泄露作者的内部 id（ADR-008 A8）。
 *
 * 扩展名由 mimeType 决定而不是从 objectKey 抄：objectKey 是内部布局，
 * 公开 URL 是对外契约，两者不该被绑在一起。
 */
const PUBLIC_EXT: Readonly<Record<string, string>> = {
  'image/webp': 'webp',
  'audio/ogg': 'opus',
};

export function publicAssetFile(asset: Pick<SnapshotAsset, 'derivedHash' | 'mimeType'>): string {
  const ext = PUBLIC_EXT[asset.mimeType];
  if (!ext) {
    // 明确失败。给一个兜底扩展名意味着某天新增一种派生格式时，
    // 它会以错误的文件名悄悄发出去。
    throw new InvariantViolation('P-asset', `没有为 ${asset.mimeType} 定义公开扩展名`);
  }
  return `${asset.derivedHash}.${ext}`;
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
  /**
   * 证据。缺失或空数组都合法（S-3）——
   * 无素材的 Moment 是一等公民，不是「还没上传」的中间状态。
   */
  readonly assets?: readonly SnapshotAsset[];
}

export interface WorkVersion {
  readonly id: WorkVersionId;
  /** 可空 —— 删 Work 不删已发布版本（ADR-005/006） */
  readonly workId?: WorkId;
  readonly userId: UserId;
  /** 这条版本线属于哪种表现。snapshot.presentation.rendererType 的投影。 */
  readonly rendererType: RendererType;
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

/**
 * 从一个即将被删除的 Moment 生成墓碑。
 *
 * ## 为什么这一步不能省
 *
 * `work_blocks.moment_id` 是 `ON DELETE SET NULL`，而 `chk_block_shape` 要求
 * moment_ref 类型的 block **必须有 moment_id 或 tombstone 之一**。
 * 所以删一个被引用的 Moment 时，如果不先写墓碑，数据库会直接抛
 * check 约束错误 —— 删除失败。
 *
 * 这个「不方便」是刻意留下的：它逼着删除路径正面回答
 * 「Work 里那个位置将来显示什么」，而不是留一个无法解释的空洞。
 */
export function buildMomentTombstone(
  moment: Pick<Moment, 'title'>,
  observations: readonly Pick<Observation, 'content'>[],
  interpretation: Pick<InterpretationRevision, 'content'> | null,
  deletedAt: string
): MomentTombstone {
  return {
    _v: 1,
    ...(moment.title ? { title: moment.title } : {}),
    observations: observations.map((o) => o.content),
    ...(interpretation ? { interpretation: interpretation.content } : {}),
    deletedAt,
  };
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
  if (snapshot._v !== SNAPSHOT_VERSION) {
    throw new InvariantViolation('P-1', `未知的 snapshot 版本 ${String(snapshot._v)}`);
  }
  if (!snapshot.work?.title) {
    throw new InvariantViolation('P-1', 'snapshot 缺少 work.title');
  }
  if (!snapshot.presentation?.rendererType) {
    throw new InvariantViolation('P-1', 'snapshot 缺少 presentation');
  }
  if (!snapshot.presentation.rendererVersion) {
    // 没有它，「保留当时的表达」就只覆盖文字，不覆盖视觉
    throw new InvariantViolation('P-1', 'snapshot 缺少 rendererVersion');
  }
  assertRendererAvailable(snapshot.presentation);
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
    // S-4：素材同理。只有 id 没有派生副本信息 = 渲染时得回头查 assets 表
    (b.moment?.assets ?? []).forEach((a, j) => {
      if (!a.derivedHash || !a.objectKey) {
        throw new InvariantViolation(
          'P-3',
          `第 ${i} 个 block 的第 ${j} 份素材缺少派生副本信息 —— 渲染时会需要查实时表`
        );
      }
      // 按 kind 各查各的必填项。图片缺尺寸会让页面在图片加载前跳动；
      // 音频缺时长会让播放器显示成损坏文件。
      if (a.kind === 'image' && (!a.width || !a.height)) {
        throw new InvariantViolation('P-3', `第 ${i} 个 block 的第 ${j} 份素材缺少尺寸`);
      }
      if (a.kind === 'audio' && !a.durationMs) {
        throw new InvariantViolation('P-3', `第 ${i} 个 block 的第 ${j} 份音频缺少时长`);
      }
    });
  });
}

// ── 快照版本迁移 ─────────────────────────────────────────────────────────────

/** v1 的形状。留着只为读旧数据，不再产出。 */
interface SnapshotV1 {
  _v: 1;
  work: { id: WorkId; title: string };
  presentation?: { rendererType?: string; config?: unknown };
  blocks: readonly SnapshotBlock[];
}

/**
 * 读取时把快照升到当前版本。
 *
 * ## 只在读取时升级，**不改写数据库里的行**
 *
 * 已发布的快照是不可变的 —— 改写它就违背了它存在的理由。
 * 所以这是一个纯函数，每次读都跑一遍，数据库里那行永远是当初写下的样子。
 *
 * `chk_snapshot_versioned` 那个 `_v` 从建库第一天就在。这是它第一次派上用场：
 * v1 的 `rendererType: 'web'` 在 v2 里对应 `narrative@1`。
 */
/**
 * 给 `kind` 出现之前写下的 asset 补上 `kind: 'image'`。
 *
 * **这不是猜。** 音频派生是 Commit 15C 才有的能力，在那之前
 * publishWork 会跳过所有非图片素材（并把跳过数报给用户）——
 * 所以历史快照里的每一份派生副本必然是图片。
 *
 * 只在读取时补，不回写数据库：快照是不可变的。
 */
function withAssetKind(block: SnapshotBlock): SnapshotBlock {
  if (block.type !== 'moment_ref' || !block.moment?.assets) return block;
  return {
    ...block,
    moment: {
      ...block.moment,
      assets: block.moment.assets.map((a) =>
        'kind' in a ? a : ({ ...(a as object), kind: 'image' } as SnapshotAsset)
      ),
    },
  };
}

export function normalizeSnapshot(raw: unknown): WorkSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new InvariantViolation('P-1', 'snapshot 不是对象');
  }
  const v = (raw as { _v?: unknown })._v;

  if (v === SNAPSHOT_VERSION) {
    const snap = raw as WorkSnapshot;
    // 就算是当前版本也要过一次 config 校验：数据库里可能有迁移脚本
    // 或历史代码写进去的形状（ADR-010 R4）
    return {
      ...snap,
      presentation: {
        ...snap.presentation,
        config: parsePresentationConfig(snap.presentation.rendererType, snap.presentation.config),
      },
      blocks: snap.blocks.map(withAssetKind),
    };
  }

  if (v === 1) {
    const old = raw as unknown as SnapshotV1;
    // v1 只有一种 renderer，叫 'web'。它就是今天的 narrative。
    const renderer: RendererType = isRendererType(old.presentation?.rendererType)
      ? old.presentation.rendererType
      : 'narrative';
    // v1 的 config 是一个开放的 `{theme?, layout?, typography?}`，
    // 和 v2 的封闭枚举**没有忠实的对应关系**（v1 的 theme:'plain' 在 v2 里
    // 不存在）。所以不翻译，直接用默认配置。
    //
    // 硬要映射就是在猜用户当时想要什么；而报错会让所有旧发布页打不开。
    // 用默认值是唯一诚实的选择 —— 视觉可能变了，但页面还在，
    // 而且 v1 时期根本没有真正的版式可言。
    return {
      _v: SNAPSHOT_VERSION,
      work: old.work,
      presentation: freezePresentation(renderer, defaultConfigFor(renderer)),
      blocks: old.blocks ?? [],
    };
  }

  throw new InvariantViolation('P-1', `无法识别的 snapshot 版本 ${String(v)}`);
}
