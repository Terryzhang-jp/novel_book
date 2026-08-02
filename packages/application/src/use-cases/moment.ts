/**
 * Moment / Observation / Interpretation 用例
 *
 * 这是 Phase 2A 最有产品分量的一块 —— 这四句话能不能被用户看见，
 * 取决于这个文件：
 *
 *   「我当时这么观察」        Observation（可多条，不是编辑同一条）
 *   「我后来这样理解」        Interpretation v1
 *   「我的理解之后又改变了」  Interpretation v2，v1 仍在
 *   「旧作品保留了我当时的表达」 见 use-cases/publication.ts
 */

import {
  assertValidInterpretationContent,
  assertValidMomentInput,
  assertValidObservationContent,
  assertValidSupersede,
  buildInterpretationChain,
  buildMomentTombstone,
  currentInterpretation,
  InvariantViolation,
  NotFoundError,
  requireUser,
  userProvenance,
  type Actor,
  type CreateMomentInput,
  type InterpretationRevision,
  type InterpretationRevisionId,
  type JourneyId,
  type Moment,
  type MomentId,
  type Observation,
  type ObservationId,
} from '@tc/domain';
import type { AddObservationInput, MomentFilter } from '../ports/repositories';
import type { CoreRepositories, UnitOfWork } from '../ports/unit-of-work';

// ── 读模型 ───────────────────────────────────────────────────────────────────

/**
 * 一个 Moment 的完整视图。
 *
 * `interpretationChain` 是从最早到最新的完整演化链 —— 页面直接渲染它，
 * 不需要自己排序或推断。链的形状是领域知识，不该散落在 UI 里。
 */
export interface MomentDetail {
  readonly moment: Moment;
  readonly observations: readonly Observation[];
  readonly interpretationChain: readonly InterpretationRevision[];
  readonly current: InterpretationRevision | null;
}

// ── Moment ───────────────────────────────────────────────────────────────────

export interface CreateMomentCommand extends CreateMomentInput {
  /** 建 Moment 的同时记下第一条观察。可空 —— 空 Moment 也是合法的。 */
  readonly firstObservation?: string;
  /** provenance 的时间戳。由调用方给，用例层不做 IO。 */
  readonly now: string;
}

/**
 * 建一个 Moment。
 *
 * **不要求照片，不要求标题，不要求地点。**
 * 这条是 ADR-004 M1，也是产品定位的分水岭：一旦要求必须有素材，
 * 中心就还是 Photo，只是改名叫 Moment。
 */
export async function createMoment(
  uow: UnitOfWork,
  actor: Actor,
  command: CreateMomentCommand
): Promise<MomentDetail> {
  requireUser(actor);
  assertValidMomentInput(command);
  if (command.firstObservation !== undefined) {
    assertValidObservationContent(command.firstObservation);
  }

  return uow.transaction(async (r) => {
    if (command.journeyId) {
      // 归类到别人的 Journey 必须失败。数据库层没有「moment 和 journey 同属
      // 一人」的约束，所以这里是唯一的关口 —— 有一条专门的越权测试盯着它。
      const journey = await r.journeys.findById(actor, command.journeyId);
      if (!journey) throw new NotFoundError('Journey');
    }

    const moment = await r.moments.create(actor, command);
    const observations: Observation[] = [];
    if (command.firstObservation) {
      observations.push(
        await r.observations.add(actor, moment.id, {
          content: command.firstObservation,
          recordedAt: command.now,
        })
      );
    }
    return { moment, observations, interpretationChain: [], current: null };
  });
}

export function listMoments(
  uow: UnitOfWork,
  actor: Actor,
  filter?: MomentFilter
): Promise<Moment[]> {
  requireUser(actor);
  return uow.moments.listByUser(actor, filter);
}

export async function getMomentDetail(
  uow: UnitOfWork,
  actor: Actor,
  id: MomentId
): Promise<MomentDetail> {
  return loadMomentDetail(uow, actor, id);
}

async function loadMomentDetail(
  r: CoreRepositories,
  actor: Actor,
  id: MomentId
): Promise<MomentDetail> {
  const moment = await r.moments.findById(actor, id);
  if (!moment) throw new NotFoundError('Moment');
  const [observations, revisions] = await Promise.all([
    r.observations.listByMoment(actor, id),
    r.interpretations.listByMoment(actor, id),
  ]);
  // buildInterpretationChain 会在分叉或成环时抛 InvariantViolation。
  // 刻意不吞掉：显示半条链比报错更糟 —— 用户会以为自己没写过那一版。
  return {
    moment,
    observations,
    interpretationChain: buildInterpretationChain(revisions),
    current: currentInterpretation(revisions),
  };
}

export async function assignMomentToJourney(
  uow: UnitOfWork,
  actor: Actor,
  momentId: MomentId,
  journeyId: JourneyId | null
): Promise<Moment> {
  requireUser(actor);
  return uow.transaction(async (r) => {
    if (journeyId) {
      const journey = await r.journeys.findById(actor, journeyId);
      if (!journey) throw new NotFoundError('Journey');
    }
    return r.moments.assignToJourney(actor, momentId, journeyId);
  });
}

/**
 * 删除 Moment。
 *
 * 引用它的 Work block 先收到墓碑，再删。顺序反了数据库会直接拒绝
 * （chk_block_shape 要求 moment_ref 至少有 moment_id 或 tombstone 之一）——
 * 那个「不方便」是刻意的：它逼着删除路径正面回答
 * 「Work 里那个位置将来显示什么」。
 */
export async function deleteMoment(
  uow: UnitOfWork,
  actor: Actor,
  id: MomentId,
  now: string
): Promise<{ tombstonedBlocks: number }> {
  requireUser(actor);
  return uow.transaction(async (r) => {
    const detail = await loadMomentDetail(r, actor, id);
    const tombstone = buildMomentTombstone(
      detail.moment,
      detail.observations,
      detail.current,
      now
    );
    const tombstonedBlocks = await r.works.tombstoneBlocksReferencing(actor, id, tombstone);
    await r.moments.delete(actor, id);
    return { tombstonedBlocks };
  });
}

// ── Observation ──────────────────────────────────────────────────────────────

/**
 * 追加一条观察。
 *
 * 注意是**追加**不是编辑：现场记一条、回家再记一条，是两次不同的观察。
 * 做成编辑就等于承认「当时的记录可以被后来的自己覆盖」，
 * 而那正是这个产品要保护的东西。
 */
export async function addObservation(
  uow: UnitOfWork,
  actor: Actor,
  momentId: MomentId,
  input: AddObservationInput
): Promise<Observation> {
  requireUser(actor);
  assertValidObservationContent(input.content);
  return uow.observations.add(actor, momentId, input);
}

// ── Interpretation ───────────────────────────────────────────────────────────

export interface ReviseInterpretationCommand {
  readonly content: string;
  /**
   * 客户端认为的当前版本 id。
   *
   * 传了就做乐观并发检查：表单是三分钟前打开的、期间在另一个标签页改过，
   * 这里会直接报错，而不是让两条 revision 都去 supersede v1 造成分叉。
   * 不传则以服务端读到的 current 为准（脚本、迁移场景）。
   */
  readonly expectedCurrentId?: InterpretationRevisionId;
  readonly basedOnObservationIds?: readonly ObservationId[];
}

/**
 * 追加一版理解。
 *
 * v1 不会消失 —— 它变成 superseded 留在链上。
 * 「我的理解之后又改变了」这句话能被看见，靠的就是这一点。
 */
export async function reviseInterpretation(
  uow: UnitOfWork,
  actor: Actor,
  momentId: MomentId,
  command: ReviseInterpretationCommand
): Promise<MomentDetail> {
  requireUser(actor);
  assertValidInterpretationContent(command.content);

  return uow.transaction(async (r) => {
    const moment = await r.moments.findById(actor, momentId);
    if (!moment) throw new NotFoundError('Moment');

    const current = await r.interpretations.findCurrent(actor, momentId);

    if (command.expectedCurrentId !== undefined && command.expectedCurrentId !== current?.id) {
      throw new InvariantViolation(
        'I-5',
        `当前理解已经变了（客户端以为是 ${command.expectedCurrentId ?? '无'}，` +
          `服务端是 ${current?.id ?? '无'}）—— 请刷新后重试，否则会产生分叉`
      );
    }

    // 领域层先判一次，给出可读的错误；数据库的唯一索引和触发器兜底。
    // 两道都要有：应用层的判断可能被绕过（脚本、并发），
    // 数据库的错误信息又不该直接给用户看。
    assertValidSupersede(momentId, current, current?.id);

    await r.interpretations.append(actor, momentId, {
      content: command.content,
      supersedesId: current?.id,
      basedOnObservationIds:
        command.basedOnObservationIds ??
        (await r.observations.listByMoment(actor, momentId)).map((o) => o.id),
    });

    return loadMomentDetail(r, actor, momentId);
  });
}
