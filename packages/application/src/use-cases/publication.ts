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
  requireUser,
  slugify,
  DEFAULT_PRESENTATION_CONFIG,
  type Actor,
  type Publication,
  type PublicationId,
  type RendererType,
  type Visibility,
  type WorkId,
  type WorkVersion,
} from '@tc/domain';
import type { PublishedPage } from '../ports/repositories';
import type { CoreRepositories, UnitOfWork } from '../ports/unit-of-work';
import { buildWorkSnapshot } from '../snapshot';
import { loadWorkDetail } from './work';

export interface PublishCommand {
  readonly workId: WorkId;
  /** 第一版只有 web。参数留着是为了让「加一种输出」不需要改签名。 */
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
}

/**
 * 发布 / 重新发布。
 *
 * 重新发布**沿用同一个 slug**，只是把 Publication 指向新版本 ——
 * 已经分享出去的链接不能因为作者改了一次错别字就失效。
 */
export async function publishWork(
  uow: UnitOfWork,
  actor: Actor,
  command: PublishCommand
): Promise<PublishResult> {
  requireUser(actor);
  const rendererType: RendererType = command.rendererType ?? 'web';
  const visibility: Visibility = command.visibility ?? 'unlisted';

  return uow.transaction(async (r) => {
    const detail = await loadWorkDetail(r, actor, command.workId);

    // Presentation 是独立实体（ADR-005 修正）。没有就建一份默认的 ——
    // 让 1..n 的关系从第一次发布起就是真的，而不是等接入排版工具才补。
    const presentation =
      detail.presentations.find((p) => p.rendererType === rendererType) ??
      (await r.works.upsertPresentation(
        actor,
        command.workId,
        rendererType,
        DEFAULT_PRESENTATION_CONFIG
      ));

    const snapshot = buildWorkSnapshot({
      work: detail.work,
      blocks: detail.blocks,
      presentation: { rendererType, config: presentation.config },
      moments: detail.moments,
      observations: detail.observations,
      interpretations: detail.interpretations,
      now: command.now,
    });

    const versionNumber = await r.publications.nextVersionNumber(actor, command.workId);
    const version = await r.publications.createVersion(actor, {
      workId: command.workId,
      versionNumber,
      snapshot,
    });

    const existing = await r.publications.findByWork(actor, command.workId);
    if (existing) {
      const publication = await r.publications.repoint(actor, existing.publication.id, version.id);
      return { publication, version, firstPublish: false };
    }

    const publication = await createWithUniqueSlug(
      r,
      actor,
      detail.work.title,
      command.workId,
      version.id,
      visibility
    );
    return { publication, version, firstPublish: true };
  });
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
  visibility: Visibility
): Promise<Publication> {
  const base = slugify(title);
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
  workId: WorkId
): Promise<WorkVersion[]> {
  requireUser(actor);
  return uow.publications.listVersions(actor, workId);
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
