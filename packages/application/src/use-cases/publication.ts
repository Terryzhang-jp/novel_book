/**
 * 发布用例 —— 「旧作品保留了我当时的表达」
 *
 * ## 这个文件要同时成立两件相反的事
 *
 *   草稿  引用实时内容 → 改一次理解，所有草稿一起变新
 *   发布  冻结当时内容 → 改一次理解，三个月前的链接一个字都不变
 *
 * 只做到第一件，产品就没有「保存当时的自己」的能力；
 * 只做到第二件，就退回成一堆互不相干的复制品。
 *
 * ## 判定标准（ADR-006）
 *
 * 渲染一个 Publication 时**不允许查询任何实时表**。
 * 这条不是靠自觉：test/integration/publication-snapshot.test.ts 会把
 * moments / observations / interpretation_revisions / work_blocks /
 * work_presentations 全部改名，然后要求发布页照样渲染出来。
 */

import {
  ConflictError,
  NotFoundError,
  canServePublications,
  requireUser,
  slugify,
  defaultConfigFor,
  freezePresentation,
  type Actor,
  parseObjectKey,
  type Publication,
  type PublicationId,
  type SnapshotAsset,
  type RendererType,
  type Visibility,
  type WorkId,
  type WorkVersion,
} from '@tc/domain';
import type {
  CreatePublishedAssetInput,
  MomentAssetView,
  PublishedPage,
} from '../ports/repositories';
import type { ImageDeriver, StorageKit } from '../ports/media';
import type { CoreRepositories, UnitOfWork } from '../ports/unit-of-work';
import { buildWorkSnapshot } from '../snapshot';
import { loadWorkDetail } from './work';

/**
 * 发布需要的三样东西。
 *
 * storage 和 deriver 是**必需的**，不是可选的 —— 做成可选的话，
 * 忘了注入就会静默发布出一篇没有任何图片的文章，而且不会有任何报错。
 * 「环境缺失就跳过」是这个项目已经明令禁止的模式。
 */
export interface PublishDeps {
  readonly core: UnitOfWork;
  readonly storage: StorageKit;
  readonly deriver: ImageDeriver;
}

/** 第一版唯一的派生预设。长边 1600，够网页看，也不至于把原图挂上公网。 */
const WEB_PRESET = { name: 'web1600' as const, maxEdge: 1600 };

export interface PublishCommand {
  readonly workId: WorkId;
  /** 默认 narrative。gallery 是同一份内容的另一种表现（ADR-010 R5）。 */
  readonly rendererType?: RendererType;
  /**
   * 默认 unlisted（知道链接才能看），不是 public。
   *
   * 「点了发布 = 全网可搜」是个危险的默认值。要进公开列表必须显式选。
   */
  readonly visibility?: Visibility;
  /** 墓碑时间戳等需要「现在」的地方。用例层不做 IO。 */
  readonly now: string;
}

export interface PublishResult extends PublishedPage {
  /** true = 这次是第一次发布（新建了 Publication），false = 重新发布 */
  readonly firstPublish: boolean;
  /** 生成了几份派生副本 */
  readonly derivedAssets: number;
  /**
   * 没有进入发布页的证据数量。
   *
   * 目前只有音频会被跳过：安全派生（剥离元数据）对音频还没实现，
   * 而把原字节直接公开会连带公开录制设备信息。
   *
   * **显式返回而不是静默跳过** —— 用户必须知道他的发布页少了什么。
   */
  readonly skippedAssets: number;
}

/**
 * 发布 / 重新发布。
 *
 * 重新发布**沿用同一个 slug**，只是把 Publication 指向新版本 ——
 * 已经分享出去的链接不能因为作者改了一次错别字就失效。
 */
export async function publishWork(
  deps: PublishDeps,
  actor: Actor,
  command: PublishCommand
): Promise<PublishResult> {
  requireUser(actor);
  const rendererType: RendererType = command.rendererType ?? 'narrative';
  const visibility: Visibility = command.visibility ?? 'unlisted';

  return deps.core.transaction(async (r) => {
    const detail = await loadWorkDetail(r, actor, command.workId);

    // Presentation 是独立实体（ADR-005 修正）。没有就建一份默认的 ——
    // 让 1..n 的关系从第一次发布起就是真的，而不是等接入排版工具才补。
    const presentation =
      detail.presentations.find((p) => p.rendererType === rendererType) ??
      (await r.works.upsertPresentation(
        actor,
        command.workId,
        rendererType,
        defaultConfigFor(rendererType)
      ));

    // ── 派生安全副本 ────────────────────────────────────────────────────
    // 在建 snapshot 之前做完，因为快照里存的是派生副本而不是原图（S-2）。
    const momentIds = [...detail.moments.keys()];
    const evidence = (await r.assets.listByMoments(actor, momentIds)).filter(
      // 已删除的素材不进发布页 —— 用户删掉它就是不想再出现
      (v) => !v.asset.deletedAt
    );
    const { byMoment, ledger, skipped } = await deriveEvidence(deps, actor, evidence);

    const snapshot = buildWorkSnapshot({
      work: detail.work,
      blocks: detail.blocks,
      // 冻结的不只是 config，还有 rendererVersion —— 否则半年后改一次
      // 渲染代码，旧 Publication 的外观就跟着变了（ADR-010 R2）
      presentation: freezePresentation(rendererType, presentation.config),
      moments: detail.moments,
      observations: detail.observations,
      interpretations: detail.interpretations,
      assets: byMoment,
      now: command.now,
    });

    const versionNumber = await r.publications.nextVersionNumber(
      actor,
      command.workId,
      rendererType
    );
    const version = await r.publications.createVersion(actor, {
      workId: command.workId,
      rendererType,
      versionNumber,
      snapshot,
    });

    // 账本在版本建好之后写。它不在读取路径上（A10），
    // 只用于账号删除时清理、对账、避免重复派生。
    for (const entry of ledger) {
      await r.publishedAssets.create(actor, { ...entry, workVersionId: version.id });
    }

    // 只看**这个 renderer** 的 Publication。
    // 发布 narrative 不该动 gallery 的链接 —— 它们是两次独立的
    // 「我决定把这一版给别人看」（ADR-010 R5）。
    const existing = await r.publications.findByWork(actor, command.workId, rendererType);
    if (existing) {
      const publication = await r.publications.repoint(actor, existing.publication.id, version.id);
      return {
        publication,
        version,
        firstPublish: false,
        derivedAssets: ledger.length,
        skippedAssets: skipped,
      };
    }

    const publication = await createWithUniqueSlug(
      r,
      actor,
      detail.work.title,
      command.workId,
      version.id,
      visibility,
      rendererType
    );
    return {
      publication,
      version,
      firstPublish: true,
      derivedAssets: ledger.length,
      skippedAssets: skipped,
    };
  });
}

/**
 * 把证据变成可以公开的派生副本。
 *
 * ## 为什么不能直接公开原图
 *
 * 原图带着 GPS —— 精确到用户家门口。还带着相机序列号、拍摄参数、
 * 有时还有内嵌缩略图（那可能是裁剪前的画面）。
 * 「发布一篇文章」不该等于把这些一起发出去。
 *
 * ## 派生对象也是内容寻址的
 *
 * key 由**派生后**的字节决定，所以和原图的 key 必然不同，
 * 快照里也就不可能出现原图的 key（S-2）。
 * 同一张图在多个版本里派生出的字节相同 ⇒ 同一个对象，不会重复占空间。
 */
async function deriveEvidence(
  deps: PublishDeps,
  actor: Actor,
  evidence: readonly MomentAssetView[]
): Promise<{
  byMoment: Map<string, SnapshotAsset[]>;
  ledger: Omit<CreatePublishedAssetInput, 'workVersionId'>[];
  skipped: number;
}> {
  const { userId } = requireUser(actor);
  const byMoment = new Map<string, SnapshotAsset[]>();
  const ledger: Omit<CreatePublishedAssetInput, 'workVersionId'>[] = [];
  const seen = new Map<string, SnapshotAsset>();
  let skipped = 0;

  for (const { link, asset } of evidence) {
    if (asset.type !== 'image') {
      // 音频的安全派生（剥离元数据）还没实现。跳过并计数 ——
      // 静默漏掉会让用户以为发布页就该长这样。
      skipped += 1;
      continue;
    }

    let derived = seen.get(asset.id);
    if (!derived) {
      const original = await deps.storage.storage.get(asset.objectKey);
      const out = await deps.deriver.derive(original, { maxEdge: WEB_PRESET.maxEdge });
      const objectKey = deps.storage.buildObjectKey(userId, out.bytes, out.mimeType);
      const { hash } = parseObjectKey(objectKey);

      await deps.storage.storage.put({
        key: objectKey,
        body: out.bytes,
        contentType: out.mimeType,
        overwrite: true,
      });

      derived = {
        role: link.role,
        derivedHash: hash,
        objectKey,
        mimeType: out.mimeType,
        width: out.width,
        height: out.height,
      };
      seen.set(asset.id, derived);
      ledger.push({
        sourceAssetId: asset.id,
        objectKey,
        sha256: hash,
        mimeType: out.mimeType,
        width: out.width,
        height: out.height,
        byteSize: out.bytes.byteLength,
        preset: WEB_PRESET.name,
      });
    }

    const bucket = byMoment.get(link.momentId);
    // role 和 note 是**关系**上的，同一份素材在两个 Moment 里可以不同角色，
    // 所以这里基于共享的派生结果再套一层关系数据
    const item: SnapshotAsset = {
      ...derived,
      role: link.role,
      ...(link.note ? { note: link.note } : {}),
    };
    if (bucket) bucket.push(item);
    else byMoment.set(link.momentId, [item]);
  }

  return { byMoment, ledger, skipped };
}

/**
 * slug 冲突时加后缀重试。
 *
 * 先试 `title`，再试 `title-2`…`title-5`，最后退回到带 Work id 前缀的形式。
 * 不用随机数：同样的输入应该产出同样的 slug，否则测试和排查都变成猜谜。
 */
async function createWithUniqueSlug(
  r: CoreRepositories,
  actor: Actor,
  title: string,
  workId: WorkId,
  workVersionId: string,
  visibility: Visibility,
  renderer: RendererType
): Promise<Publication> {
  // narrative 用干净的 slug，其他 renderer 带后缀 —— 同一个 Work 的两种表现
  // 是两个链接，读者从 URL 就能看出自己在看哪一种
  const base = renderer === 'narrative' ? slugify(title) : `${slugify(title)}-${renderer}`;
  const candidates = [base, ...[2, 3, 4, 5].map((n) => `${base}-${n}`), `${base}-${workId.slice(0, 8)}`];

  let lastError: unknown;
  for (const slug of candidates) {
    try {
      return await r.publications.create(actor, { workVersionId, slug, visibility });
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new ConflictError('publication.slug', base);
}

export async function withdrawPublication(
  uow: UnitOfWork,
  actor: Actor,
  id: PublicationId
): Promise<Publication> {
  requireUser(actor);
  // P-4：只写 withdrawn_at。删行的话就无法区分「作者已下架」和「从来不存在」，
  // 而我们已经决定要给访客显示前者。
  return uow.publications.withdraw(actor, id);
}

export function listPublications(uow: UnitOfWork, actor: Actor): Promise<PublishedPage[]> {
  requireUser(actor);
  return uow.publications.listByUser(actor);
}

export function listWorkVersions(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId,
  renderer?: RendererType
): Promise<WorkVersion[]> {
  requireUser(actor);
  return uow.publications.listVersions(actor, workId, renderer);
}

// ── 访客视角 ─────────────────────────────────────────────────────────────────

/**
 * 一个 slug 对访客意味着什么。
 *
 * 三种状态刻意分开：
 *   not_found  不存在、或者是别人的私有页面 —— 两者返回同一种，不泄露存在性
 *   withdrawn  作者主动下架 —— 显示「已下架」而不是 404
 *   ok         正常渲染
 */
export type PublicationView =
  | { readonly status: 'not_found' }
  | { readonly status: 'withdrawn'; readonly page: PublishedPage }
  | { readonly status: 'ok'; readonly page: PublishedPage };

export async function viewPublication(
  uow: UnitOfWork,
  actor: Actor,
  slug: string
): Promise<PublicationView> {
  const page = await uow.publications.findBySlug(actor, slug);
  if (!page) return { status: 'not_found' };

  // ⚠️ 作者的账号状态决定这一页还能不能被送出去（ADR-007）。
  //
  // 停用、申请删除、已删除 —— 三种情况一律 not_found，**不是** withdrawn：
  // 「已下架」这个页面会告诉访客「这里曾经有东西，是作者收起来了」，
  // 而账号被停用是作者与平台之间的事，不该对着全世界公告。
  //
  // 这里多了一次查库。它换来的是「下架」立刻生效且不需要任何批处理：
  // 没有一张表被改写，所以撤销停用之后所有页面自动恢复，
  // 也不会把「作者自己撤回过的页面」误当成停用的一部分重新上线。
  //
  // 注意这不违反 ADR-006 的快照自洽：快照回答的是「这一页写了什么」，
  // 这次查询回答的是「这一页现在还能不能给人看」。两个问题。
  const authorStatus = await uow.accounts.findStatus(actor, page.publication.userId);
  if (!authorStatus || !canServePublications(authorStatus)) {
    return { status: 'not_found' };
  }

  const isOwner =
    actor.type === 'user' ? actor.userId === page.publication.userId : actor.type === 'system';

  // private 只有作者自己能看。对其他人和「不存在」返回同一种状态。
  if (page.publication.visibility === 'private' && !isOwner) {
    return { status: 'not_found' };
  }
  if (page.publication.withdrawnAt) {
    return { status: 'withdrawn', page };
  }
  return { status: 'ok', page };
}

/** 找不到时抛 NotFoundError 的版本，给 API 路由用 */
export async function getPublicationOrThrow(
  uow: UnitOfWork,
  actor: Actor,
  slug: string
): Promise<PublishedPage> {
  const view = await viewPublication(uow, actor, slug);
  if (view.status === 'not_found') throw new NotFoundError('Publication');
  return view.page;
}
