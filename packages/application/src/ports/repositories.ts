/**
 * Repository 端口 —— Phase 2A 的九张核心表
 *
 * ## 三条硬规则
 *
 * 1. **每个方法的第一个参数是 `actor: Actor`。**
 *    由 scripts/check-architecture.mjs 静态强制（ADR-001）。
 *    实现里 user_id 条件必须写进 SQL，而不是取出来再比对 —— 后者一旦有人
 *    删掉那行 if 就是静默越权。
 *
 * 2. **跨用户访问返回 `NotFoundError`，不返回 403。**
 *    区分 403 和 404 会泄露「这个 id 存在」，可被用来枚举资源。
 *
 * 3. **这里只有接口，没有 SQL。**
 *    实现在 packages/infrastructure-postgres。换库、换测试替身都不需要动
 *    用例代码 —— 这是 ADR-000 供应商无关的落点。
 *
 * ## 命名约定
 *
 *   findXxx  找不到返回 null（调用方决定这是不是错误）
 *   getXxx   找不到抛 NotFoundError
 *   listXxx  返回数组，可能为空
 */

import type {
  Account,
  AccountEvent,
  AccountEventType,
  AccountStatus,
  Actor,
  Asset,
  AssetId,
  AssetMetadataCorrection,
  CorrectionField,
  CorrectionId,
  CorrectionSource,
  CreateAssetInput,
  CreateJourneyInput,
  CreateMomentInput,
  InterpretationRevision,
  InterpretationRevisionId,
  Journey,
  JourneyId,
  Moment,
  MomentId,
  MomentAsset,
  MomentAssetRole,
  MomentTombstone,
  Observation,
  ObservationId,
  PersistedAccountStatus,
  PresentationConfig,
  Publication,
  PublicationId,
  RendererType,
  Visibility,
  Work,
  WorkBlock,
  WorkBlockId,
  WorkBlockType,
  WorkId,
  WorkPresentation,
  WorkSnapshot,
  WorkVersion,
  WorkVersionId,
} from '@tc/domain';

// ── 通用 ─────────────────────────────────────────────────────────────────────

export interface Page {
  readonly limit?: number;
  readonly offset?: number;
}

// ── Journey ──────────────────────────────────────────────────────────────────

export interface JourneyRepository {
  create(actor: Actor, input: CreateJourneyInput): Promise<Journey>;
  findById(actor: Actor, id: JourneyId): Promise<Journey | null>;
  listByUser(actor: Actor, page?: Page): Promise<Journey[]>;
  /**
   * 删除 Journey。
   *
   * J-2：**Moment 不跟着删**，只是 journey_id 置空变成「未归类」。
   * 由外键的 ON DELETE SET NULL 保证，不靠应用层记得去清。
   */
  delete(actor: Actor, id: JourneyId): Promise<void>;
}

// ── Moment ───────────────────────────────────────────────────────────────────

export interface MomentFilter extends Page {
  /** 传 null 表示「只要未归类的」；不传表示全部 */
  readonly journeyId?: JourneyId | null;
}

export interface MomentRepository {
  create(actor: Actor, input: CreateMomentInput): Promise<Moment>;
  findById(actor: Actor, id: MomentId): Promise<Moment | null>;
  listByUser(actor: Actor, filter?: MomentFilter): Promise<Moment[]>;
  /** 归类 / 取消归类。传 null 把 Moment 变回未归类。 */
  assignToJourney(actor: Actor, id: MomentId, journeyId: JourneyId | null): Promise<Moment>;
  /**
   * 删除 Moment。
   *
   * ⚠️ 调用前必须先给引用它的 work_blocks 写墓碑，否则 chk_block_shape 会
   * 让删除失败。编排在 use-cases/moment.ts 的 deleteMoment 里。
   */
  delete(actor: Actor, id: MomentId): Promise<void>;
}

// ── Observation ──────────────────────────────────────────────────────────────

export interface AddObservationInput {
  readonly content: string;
  /** 什么时候记的。不传则由数据库取 now()。 */
  readonly recordedAt?: string;
}

export interface ObservationRepository {
  /** Moment 不属于 actor 时抛 NotFoundError —— 不先查再判断，避免 TOCTOU */
  add(actor: Actor, momentId: MomentId, input: AddObservationInput): Promise<Observation>;
  listByMoment(actor: Actor, momentId: MomentId): Promise<Observation[]>;
  /** 批量取，给发布快照用 —— 避免 N+1 */
  listByMoments(actor: Actor, momentIds: readonly MomentId[]): Promise<Observation[]>;
}

// ── Interpretation ───────────────────────────────────────────────────────────

export interface AppendInterpretationInput {
  readonly content: string;
  /** 首版为 undefined；之后必须等于当前 revision 的 id */
  readonly supersedesId?: InterpretationRevisionId;
  readonly basedOnObservationIds: readonly ObservationId[];
}

export interface InterpretationRepository {
  /** 全部 revision，按 created_at 升序。链的形状交给 buildInterpretationChain 还原。 */
  listByMoment(actor: Actor, momentId: MomentId): Promise<InterpretationRevision[]>;
  findCurrent(actor: Actor, momentId: MomentId): Promise<InterpretationRevision | null>;
  /** 批量取当前理解，给发布快照用 */
  listCurrentByMoments(
    actor: Actor,
    momentIds: readonly MomentId[]
  ): Promise<InterpretationRevision[]>;
  /**
   * 追加一版理解。
   *
   * **必须在事务里调用** —— 它做两件事：把被取代的那版标记为 superseded，
   * 插入新的 current。中间断开会留下零个或两个 current，
   * 数据库的 uq_interpretation_current 会挡住后者，但前者是静默的数据损坏。
   */
  append(
    actor: Actor,
    momentId: MomentId,
    input: AppendInterpretationInput
  ): Promise<InterpretationRevision>;
}

// ── Work ─────────────────────────────────────────────────────────────────────

export interface AppendBlockInput {
  readonly type: WorkBlockType;
  readonly textContent?: string;
  readonly momentId?: MomentId;
}

export interface WorkRepository {
  create(actor: Actor, input: { title: string }): Promise<Work>;
  findById(actor: Actor, id: WorkId): Promise<Work | null>;
  listByUser(actor: Actor, page?: Page): Promise<Work[]>;
  /** P-5：已发布版本不跟着删，work_versions.work_id 置空 */
  delete(actor: Actor, id: WorkId): Promise<void>;

  listBlocks(actor: Actor, workId: WorkId): Promise<WorkBlock[]>;
  appendBlock(actor: Actor, workId: WorkId, input: AppendBlockInput): Promise<WorkBlock>;
  removeBlock(actor: Actor, workId: WorkId, blockId: WorkBlockId): Promise<void>;
  /**
   * 按给定顺序重排。orderedIds 必须是该 Work 全部 block 的一个排列。
   *
   * uq_work_block_position 是 DEFERRABLE 的，所以可以在一个事务里直接改成
   * 目标顺序，不需要先挪到临时的负数位置。
   */
  reorderBlocks(actor: Actor, workId: WorkId, orderedIds: readonly WorkBlockId[]): Promise<WorkBlock[]>;
  /**
   * 给所有引用某 Moment 的 block 写墓碑。删 Moment 之前必须先调。
   *
   * 刻意**不按 actor 过滤 block** —— 这是数据库完整性操作，漏掉任何一行都会
   * 让后续的 DELETE 撞上 chk_block_shape。跨用户引用在
   * addMomentToWork 处已被禁止，所以正常情况下不会有别人的 block；
   * 真出现了也必须一并处理，而不是留一行坏数据。
   */
  tombstoneBlocksReferencing(
    actor: Actor,
    momentId: MomentId,
    tombstone: MomentTombstone
  ): Promise<number>;

  listPresentations(actor: Actor, workId: WorkId): Promise<WorkPresentation[]>;
  findPresentation(
    actor: Actor,
    workId: WorkId,
    rendererType: RendererType
  ): Promise<WorkPresentation | null>;
  /** (work_id, renderer_type) 唯一 —— 每种输出各一套，互不覆盖（ADR-005 修正） */
  upsertPresentation(
    actor: Actor,
    workId: WorkId,
    rendererType: RendererType,
    config: PresentationConfig
  ): Promise<WorkPresentation>;
  /**
   * 删除一种表现方式。
   *
   * **已发布的 Publication 不受影响** —— 它引用的是快照，
   * 快照里已经冻了完整的 presentation。两者之间没有外键，
   * 这是设计使然而不是遗漏。
   */
  deletePresentation(
    actor: Actor,
    workId: WorkId,
    rendererType: RendererType
  ): Promise<void>;
}

// ── Publication ──────────────────────────────────────────────────────────────

/**
 * 一个可渲染的已发布页面。
 *
 * `version.snapshot` 自带渲染所需的全部内容 —— 拿到这个对象之后
 * **不允许再查任何实时表**（ADR-006 判定标准）。
 */
export interface PublishedPage {
  readonly publication: Publication;
  readonly version: WorkVersion;
}

export interface PublicationRepository {
  /**
   * 该 Work 在**某个 renderer 上**的下一个版本号。没有历史版本时返回 1。
   *
   * 版本线按 renderer 分开 —— narrative 发到第 3 版时 gallery 可能还在
   * 第 1 版，那是正常的，不该互相挤占号段（ADR-010 R5）。
   */
  nextVersionNumber(actor: Actor, workId: WorkId, renderer: RendererType): Promise<number>;
  createVersion(
    actor: Actor,
    input: {
      workId: WorkId;
      rendererType: RendererType;
      versionNumber: number;
      snapshot: WorkSnapshot;
    }
  ): Promise<WorkVersion>;
  listVersions(actor: Actor, workId: WorkId, renderer?: RendererType): Promise<WorkVersion[]>;

  create(
    actor: Actor,
    input: { workVersionId: WorkVersionId; slug: string; visibility: Visibility }
  ): Promise<Publication>;
  /** 再次发布：同一个 slug 指向新版本，链接不变 */
  repoint(actor: Actor, id: PublicationId, workVersionId: WorkVersionId): Promise<Publication>;
  /** P-4：撤回**不删记录**，只写 withdrawn_at */
  withdraw(actor: Actor, id: PublicationId): Promise<Publication>;

  /** 某个 Work 在某个 renderer 上的 Publication。每种 renderer 各一个。 */
  findByWork(
    actor: Actor,
    workId: WorkId,
    renderer: RendererType
  ): Promise<PublishedPage | null>;
  listByUser(actor: Actor, page?: Page): Promise<PublishedPage[]>;
  /**
   * 按 slug 读取，**允许 anonymous**。
   *
   * 只 JOIN publications 和 work_versions 两张表。
   * 可见性判断交给调用方（use-cases/publication.ts），因为「已下架」
   * 和「不存在」在产品上是两种不同的页面。
   */
  findBySlug(actor: Actor, slug: string): Promise<PublishedPage | null>;
}

// ── Asset / 证据（ADR-008）────────────────────────────────────────────────────

/**
 * 一份证据在某个 Moment 里的完整视图。
 *
 * 关系和素材一起返回 —— 分两次查会让调用方自己去 join，
 * 而那正是「某个页面漏了 role」这类 bug 的来源。
 */
export interface MomentAssetView {
  readonly link: MomentAsset;
  readonly asset: Asset;
}

export interface AttachAssetInput {
  readonly role?: MomentAssetRole;
  readonly note?: string;
}

export interface AppendCorrectionInput {
  readonly field: CorrectionField;
  readonly value: unknown;
  readonly source: CorrectionSource;
  readonly confidence?: number;
  readonly supersedesId?: CorrectionId;
}

export interface AssetRepository {
  create(actor: Actor, input: CreateAssetInput): Promise<Asset>;
  findById(actor: Actor, id: AssetId): Promise<Asset | null>;
  /** 去重用：同一用户 + 同一字节 = 同一个 Asset（A-1） */
  findBySha256(actor: Actor, sha256: string): Promise<Asset | null>;
  listByUser(actor: Actor, page?: Page): Promise<Asset[]>;
  /**
   * 软删除。**不物理删对象**（ADR-008 A7）——
   * 引用它的 Moment 要留下占位，作品里不出现无法解释的空洞。
   */
  softDelete(actor: Actor, id: AssetId): Promise<Asset>;
  /** 重新上传一份删掉的素材 = 想要它回来。清 deleted_at，不新建行。 */
  restore(actor: Actor, id: AssetId): Promise<Asset>;

  listByMoment(actor: Actor, momentId: MomentId): Promise<MomentAssetView[]>;
  /** 批量版本，给发布快照用 —— 避免 N+1 */
  listByMoments(actor: Actor, momentIds: readonly MomentId[]): Promise<MomentAssetView[]>;
  attach(
    actor: Actor,
    momentId: MomentId,
    assetId: AssetId,
    input?: AttachAssetInput
  ): Promise<MomentAsset>;
  /** 「从 Moment 移除」—— 和「删除 Asset」是两件事（A7） */
  detach(actor: Actor, momentId: MomentId, assetId: AssetId): Promise<void>;
  reorder(
    actor: Actor,
    momentId: MomentId,
    orderedAssetIds: readonly AssetId[]
  ): Promise<MomentAsset[]>;

  listCorrections(actor: Actor, assetId: AssetId): Promise<AssetMetadataCorrection[]>;
  appendCorrection(
    actor: Actor,
    assetId: AssetId,
    input: AppendCorrectionInput
  ): Promise<AssetMetadataCorrection>;
}

export interface CreatePublishedAssetInput {
  readonly workVersionId: WorkVersionId;
  readonly sourceAssetId?: AssetId;
  readonly objectKey: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly byteSize: number;
  /** 图片必填 */
  readonly width?: number;
  /** 图片必填 */
  readonly height?: number;
  /** 音频必填 */
  readonly durationMs?: number;
  /**
   * 预设名里带着参数（尺寸 / 编码 / 码率）。
   * 改参数 = 新预设名，这样旧副本不会被追溯解释成新参数。
   * 数据库的 chk_published_asset_shape 保证每种预设的必填项都在。
   */
  readonly preset: 'web1600' | 'audio_opus64';
}

export interface PublishedAsset extends CreatePublishedAssetInput {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: string;
}

/**
 * 发布派生副本的账本。
 *
 * ⚠️ **不在读取路径上**（ADR-008 A10）。渲染发布页和取派生图都只读
 * publications + work_versions —— 需要的一切都在快照里。
 * 这张表只用于账号删除时清理、对账、避免重复派生。
 */
export interface PublishedAssetRepository {
  create(actor: Actor, input: CreatePublishedAssetInput): Promise<PublishedAsset>;
  listByVersion(actor: Actor, workVersionId: WorkVersionId): Promise<PublishedAsset[]>;
}

// ── Account ──────────────────────────────────────────────────────────────────

/**
 * 账号生命周期的读写 —— ADR-007
 *
 * ## 为什么它在这里，而不是塞进 Better Auth
 *
 * Better Auth 管的是「这个人是谁、密码对不对、session 有没有过期」。
 * 它不该知道「这个账号申请了删除，所以他的公开页面要下架」——
 * 那是产品语义，不是认证语义。
 *
 * 分开的实际好处：认证换实现（哪天不用 Better Auth 了）不会带走状态机。
 *
 * ## 唯一允许删 user 行的地方
 *
 * `purge` 是整个系统里唯一一处 `DELETE FROM "user"`，
 * 数据库的 trg_guard_user_delete 触发器会确认这一点 ——
 * 任何别处的删除语句都会直接报错。
 */
export interface AccountEventInput {
  readonly userId: string;
  readonly type: AccountEventType;
  readonly fromStatus?: AccountStatus;
  readonly toStatus?: AccountStatus;
  readonly reason?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface AccountTransition {
  /** 期望的当前状态。写成条件而不是先读后写 —— 见下面的说明。 */
  readonly from: PersistedAccountStatus;
  readonly to: PersistedAccountStatus;
  readonly at: Date;
  /** to='deletion_requested' 时必填 */
  readonly deletion?: {
    readonly requestedAt: Date;
    readonly effectiveAt: Date;
    readonly cancelTokenHash: string;
  };
}

export interface AccountRepository {
  findById(actor: Actor, userId: string): Promise<Account | null>;

  /**
   * 只取状态。发布页每次访问都要问一次，所以单独开一个方法，
   * 而不是取整行再丢掉大部分。
   *
   * 返回 null 表示这个 user 行不存在 —— 对调用方而言等同于
   * `deleted`（账号已被永久删除），但这里如实返回 null，
   * 由调用方决定这是不是错误。
   */
  findStatus(actor: Actor, userId: string): Promise<PersistedAccountStatus | null>;

  /** 撤销令牌的持有者。找不到返回 null —— 不区分「令牌错」和「已经撤销过」。 */
  findByCancelTokenHash(actor: Actor, tokenHash: string): Promise<Account | null>;

  /**
   * 状态迁移。**compare-and-set**：`from` 不匹配就抛 NotFoundError。
   *
   * 不做成「先 findById 再 update」是因为那之间有窗口：两个并发请求
   * 都读到 active，都判断「可以申请删除」，然后都写入 ——
   * 第二个会覆盖第一个的等待期，把冷静期悄悄重置。
   */
  transition(actor: Actor, userId: string, input: AccountTransition): Promise<Account>;

  /** 到期可以永久删除的账号。只读，用于巡检和报表 —— **不要**拿它驱动删除。 */
  listDueForDeletion(actor: Actor, now: Date, limit?: number): Promise<Account[]>;

  /**
   * 认领**一个**到期待删账号。**必须在事务里调用。**
   *
   * `FOR UPDATE SKIP LOCKED`：两个工作进程同时跑时各拿各的，
   * 既不会争抢同一个账号，也不会互相阻塞。
   *
   * 用它而不是「先 list 再逐个删」——后者两个进程会列出同一批账号，
   * 然后其中一个的每一次删除都撞在另一个已经删掉的行上。
   */
  claimNextDueForDeletion(actor: Actor, now: Date): Promise<Account | null>;

  /**
   * 锁住一个账号准备删除。**必须在事务里调用。**
   *
   * 返回 null 表示这一行已经不在了 —— 对删除流程而言这是**成功**
   * （目标状态已达成），不是错误。幂等性就落在这个 null 上。
   */
  lockForDeletion(actor: Actor, userId: string): Promise<Account | null>;

  /**
   * 撤销该用户的全部 session，返回撤销条数。
   *
   * ⚠️ 这**不足以**立刻挡住已经登录的人：Better Auth 的 cookieCache
   * 让签名 cookie 在最长 5 分钟内不查库。真正的止血在每次读取 session 时
   * 复查 status（见 apps/web/lib/core/context.ts）。
   * 这里删行是为了让「重新打开页面」不会又变回登录态。
   */
  revokeSessions(actor: Actor, userId: string): Promise<number>;

  recordEvent(actor: Actor, input: AccountEventInput): Promise<AccountEvent>;
  listEvents(actor: Actor, userId: string, page?: Page): Promise<AccountEvent[]>;

  /**
   * 永久删除 user 行，靠外键 CASCADE 清空全部业务数据。
   *
   * **不可逆。** 调用前必须已经通过 assertDeletable，
   * 并且已经把对象存储的 key 收集完毕 —— 行删掉之后就查不到该删哪些字节了。
   */
  purge(actor: Actor, userId: string): Promise<void>;

  /**
   * 该用户在对象存储里的全部 key（原始素材 + 发布派生副本）。
   *
   * 必须在 purge **之前**调用。
   */
  listStorageKeys(actor: Actor, userId: string): Promise<string[]>;
}

// ── 对象清理队列 ─────────────────────────────────────────────────────────────

export type CleanupReason =
  | 'account_deleted'
  | 'publication_withdrawn'
  | 'asset_deleted'
  | 'orphan';

export interface StorageCleanupJob {
  readonly id: string;
  readonly ownerId: string;
  readonly objectKey: string;
  readonly reason: CleanupReason;
  readonly attempts: number;
  readonly lastError?: string;
}

export interface CleanupStats {
  readonly pending: number;
  readonly abandoned: number;
}

/**
 * 「有一个 object key 需要消失」的待办。
 *
 * 存在的理由是对象存储**不参与数据库事务**：删除账号的行可以原子提交，
 * 删除它的字节不能。所以把「要删什么」写进事务，把「删」放在事务之外重试。
 *
 * 崩溃安全性来自一条很小的规则：**认领即计数**。工作进程一取走任务就把
 * attempts +1 并把 next_attempt_at 推后，所以进程死在半路时这一行会在
 * 退避时间之后被重新认领，而不是永远停在 pending。
 */
export interface StorageCleanupRepository {
  /** 幂等入队：同一个 key 已经有待办时不重复插入 */
  enqueue(
    actor: Actor,
    jobs: readonly { ownerId: string; objectKey: string; reason: CleanupReason }[]
  ): Promise<number>;

  /**
   * 认领一批到期任务。
   *
   * `FOR UPDATE SKIP LOCKED` —— 两个工作进程同时跑时各拿各的，
   * 不会争抢同一行，也不会互相阻塞。
   */
  claimBatch(actor: Actor, now: Date, limit: number): Promise<StorageCleanupJob[]>;

  markDone(actor: Actor, id: string, at: Date): Promise<void>;
  /** 超过 maxAttempts 就标记 abandoned —— 无限重试等于无限报警 */
  markFailed(
    actor: Actor,
    id: string,
    error: string,
    at: Date,
    maxAttempts: number
  ): Promise<void>;

  stats(actor: Actor): Promise<CleanupStats>;
  listPendingFor(actor: Actor, ownerId: string): Promise<StorageCleanupJob[]>;
}
