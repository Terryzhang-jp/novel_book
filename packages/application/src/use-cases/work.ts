/**
 * Work 用例 —— 引用，而不是复制
 *
 * Work 里的 moment_ref block **只存 id**，不复制内容。修一处理解，
 * 所有引用它的草稿一起变新 —— 这是「一份内容真相」。
 *
 * 与之相对的是发布：发布那一刻会把内容冻进快照。
 * 草稿跟着变、已发布的不变，两者都成立才是对的（见 publication.ts）。
 */

import {
  assertValidBlock,
  assertValidWorkTitle,
  NotFoundError,
  requireUser,
  type Actor,
  type InterpretationRevision,
  type Moment,
  type MomentId,
  type Observation,
  type Work,
  type WorkBlock,
  type WorkBlockId,
  type WorkId,
  type WorkPresentation,
  parsePresentationConfig,
  type PresentationConfig,
  type RendererType,
} from '@tc/domain';
import type { Page } from '../ports/repositories';
import type { CoreRepositories, UnitOfWork } from '../ports/unit-of-work';

// ── 读模型 ───────────────────────────────────────────────────────────────────

/** 编辑页要显示的东西：block 顺序 + 每个引用 Moment 的当前内容 */
export interface WorkDetail {
  readonly work: Work;
  readonly blocks: readonly WorkBlock[];
  readonly presentations: readonly WorkPresentation[];
  readonly moments: ReadonlyMap<MomentId, Moment>;
  readonly observations: ReadonlyMap<MomentId, readonly Observation[]>;
  readonly interpretations: ReadonlyMap<MomentId, readonly InterpretationRevision[]>;
}

// ── 命令 ─────────────────────────────────────────────────────────────────────

export async function createWork(
  uow: UnitOfWork,
  actor: Actor,
  input: { title: string }
): Promise<Work> {
  requireUser(actor);
  assertValidWorkTitle(input.title);
  return uow.works.create(actor, input);
}

export function listWorks(uow: UnitOfWork, actor: Actor, page?: Page): Promise<Work[]> {
  requireUser(actor);
  return uow.works.listByUser(actor, page);
}

export function getWorkDetail(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId
): Promise<WorkDetail> {
  return loadWorkDetail(uow, actor, workId);
}

/**
 * 同上，但接受任意一套 repository —— 发布用例需要在**事务内**读同一份数据，
 * 用外面那套（走连接池的）会读到事务外的快照。
 */
export async function loadWorkDetail(
  repos: CoreRepositories,
  actor: Actor,
  workId: WorkId
): Promise<WorkDetail> {
  const uow = repos;
  const work = await uow.works.findById(actor, workId);
  if (!work) throw new NotFoundError('Work');

  const [blocks, presentations] = await Promise.all([
    uow.works.listBlocks(actor, workId),
    uow.works.listPresentations(actor, workId),
  ]);

  const momentIds = [
    ...new Set(blocks.map((b) => b.momentId).filter((id): id is MomentId => Boolean(id))),
  ];

  // 批量取，不在循环里查 —— 一个 20 段的 Work 走 N+1 就是 60 次往返。
  const [moments, observations, currents] = await Promise.all([
    Promise.all(momentIds.map((id) => uow.moments.findById(actor, id))),
    uow.observations.listByMoments(actor, momentIds),
    uow.interpretations.listCurrentByMoments(actor, momentIds),
  ]);

  return {
    work,
    blocks,
    presentations,
    moments: new Map(
      moments.filter((m): m is Moment => m !== null).map((m) => [m.id, m])
    ),
    observations: groupBy(observations, (o) => o.momentId),
    interpretations: groupBy(currents, (r) => r.momentId),
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => MomentId): Map<MomentId, T[]> {
  const out = new Map<MomentId, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export async function addTextBlock(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId,
  text: string
): Promise<WorkBlock> {
  requireUser(actor);
  assertValidBlock('text', { textContent: text });
  return uow.works.appendBlock(actor, workId, { type: 'text', textContent: text });
}

/**
 * 把一个 Moment 引用进 Work。
 *
 * ## 越权关口
 *
 * 数据库里 work_blocks.moment_id 只有外键，**没有**「Moment 和 Work 同属
 * 一人」的约束（那需要触发器）。所以 Alice 引用 Bob 的 Moment 能不能被拦住，
 * 完全取决于下面这三行。有一条专门的越权测试盯着它，
 * 并且 migration 20260803010000 加了触发器做第二道。
 */
export async function addMomentToWork(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId,
  momentId: MomentId
): Promise<WorkBlock> {
  requireUser(actor);
  return uow.transaction(async (r) => {
    const moment = await r.moments.findById(actor, momentId);
    // 别人的 Moment 和不存在的 Moment 返回同一个错误 —— 不泄露 id 是否存在
    if (!moment) throw new NotFoundError('Moment');
    assertValidBlock('moment_ref', { momentId });
    return r.works.appendBlock(actor, workId, { type: 'moment_ref', momentId });
  });
}

export async function removeBlock(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId,
  blockId: WorkBlockId
): Promise<void> {
  requireUser(actor);
  await uow.works.removeBlock(actor, workId, blockId);
}

/**
 * 重排。
 *
 * 传全量顺序而不是「把第 3 个移到第 1 个」—— 后者在并发下会算出不同结果，
 * 而且客户端和服务端对「第 3 个」的理解可能已经不一样了。
 */
export async function reorderBlocks(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId,
  orderedIds: readonly WorkBlockId[]
): Promise<WorkBlock[]> {
  requireUser(actor);
  return uow.transaction((r) => r.works.reorderBlocks(actor, workId, orderedIds));
}

/**
 * 删除 Work。
 *
 * 已发布的版本**不跟着删**（work_versions.work_id 置空）。
 * 作者整理草稿箱，不该让三个月前分享出去的链接变成 404。
 */
export async function deleteWork(uow: UnitOfWork, actor: Actor, workId: WorkId): Promise<void> {
  requireUser(actor);
  await uow.works.delete(actor, workId);
}

/**
 * 保存一种表现方式的配置。
 *
 * ## 这个用例**不碰任何内容**
 *
 * 它只写 work_presentations。看一眼函数体就能确认：没有 blocks，
 * 没有 moments，没有 observations。
 *
 * ADR-010 R3 禁止 Presentation 隐藏、重排或修改 Block。执行方式不是靠自觉：
 * `PresentationConfig` 是封闭的判别联合，`parsePresentationConfig` 会拒绝
 * 任何不在枚举里的值 —— 想加 `hiddenBlockIds` 得先改类型定义。
 */
export async function savePresentation(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId,
  renderer: RendererType,
  config: PresentationConfig
): Promise<WorkPresentation> {
  requireUser(actor);
  // 写入处校验（三处之一，另两处在发布和渲染）
  return uow.works.upsertPresentation(actor, workId, renderer, parsePresentationConfig(renderer, config));
}

/** 删除一种表现方式。已发布的 Publication 不受影响（ADR-010 R5）。 */
export async function deletePresentation(
  uow: UnitOfWork,
  actor: Actor,
  workId: WorkId,
  renderer: RendererType
): Promise<void> {
  requireUser(actor);
  await uow.works.deletePresentation(actor, workId, renderer);
}
