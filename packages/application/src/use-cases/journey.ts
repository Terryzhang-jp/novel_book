/**
 * Journey 用例
 *
 * 用例层的职责边界：
 *   · 校验输入（调 domain 的纯函数，不自己写 if）
 *   · 编排 repository
 *   · 决定事务边界
 *
 * 不做的事：写 SQL、认 HTTP、格式化给人看的文案。
 */

import {
  assertValidJourneyInput,
  NotFoundError,
  requireUser,
  type Actor,
  type CreateJourneyInput,
  type Journey,
  type JourneyId,
} from '@tc/domain';
import type { Page } from '../ports/repositories';
import type { UnitOfWork } from '../ports/unit-of-work';

export async function createJourney(
  uow: UnitOfWork,
  actor: Actor,
  input: CreateJourneyInput
): Promise<Journey> {
  requireUser(actor);
  // 校验在写库之前 —— 让用户拿到「endedAt 不能早于 startedAt」，
  // 而不是 Postgres 的 chk_journey_period。
  assertValidJourneyInput(input);
  return uow.journeys.create(actor, input);
}

export function listJourneys(uow: UnitOfWork, actor: Actor, page?: Page): Promise<Journey[]> {
  requireUser(actor);
  return uow.journeys.listByUser(actor, page);
}

/** 找不到（或不属于 actor）时抛 NotFoundError —— 对外一律 404 */
export async function getJourney(
  uow: UnitOfWork,
  actor: Actor,
  id: JourneyId
): Promise<Journey> {
  const journey = await uow.journeys.findById(actor, id);
  if (!journey) throw new NotFoundError('Journey');
  return journey;
}

/**
 * 删除 Journey。
 *
 * J-2：Moment **不跟着删**，只变成未归类。
 * 「整理容器」和「销毁内容」在产品语义上是两件事，用户点删除时想的是前者。
 */
export async function deleteJourney(
  uow: UnitOfWork,
  actor: Actor,
  id: JourneyId
): Promise<void> {
  requireUser(actor);
  await uow.journeys.delete(actor, id);
}
