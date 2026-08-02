'use server';

/**
 * Studio 的全部写操作
 *
 * ## 为什么是 Server Action + 原生 form，而不是 fetch + 客户端状态
 *
 * Phase 2A 要证明的是**领域模型对不对**，不是交互做得多顺。
 * 原生表单没有 JavaScript 也能提交，这让「链路是否成立」这件事
 * 不会被前端框架的问题掩盖 —— 页面上看到的每一个字，
 * 都确实是从数据库经过用例层出来的。
 *
 * Tiptap / Konva / 拖拽排序都不在这一阶段（用户明确要求暂不接）。
 *
 * ## 错误怎么显示
 *
 * 不 throw。抛出去会撞上 Next 的错误边界，用户看到一个白屏加
 * "An error occurred in the Server Components render"。
 * 这里统一 catch，翻译成人话，用 ?error= 带回原页面。
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addMomentToWork,
  addObservation,
  addTextBlock,
  createJourney,
  createMoment,
  createWork,
  deleteJourney,
  deleteMoment,
  deleteWork,
  publishWork,
  removeBlock,
  reviseInterpretation,
  withdrawPublication,
} from '@tc/application';
import type { JourneyType } from '@tc/domain';
import { getCore, requireActor } from '@/lib/core/context';
import { toUserMessage } from '@/lib/core/errors';

/**
 * 所有 action 的公共外壳。
 *
 * redirect() 是靠抛异常实现的，所以**不能放在 try 里**——
 * 那样正常的跳转会被自己的 catch 当成错误吞掉。
 * 先算出目标地址，再在 try 外面跳。
 */
async function run(
  fallbackPath: string,
  fn: () => Promise<string | void>
): Promise<never> {
  let target: string;
  try {
    target = (await fn()) || fallbackPath;
  } catch (error) {
    const sep = fallbackPath.includes('?') ? '&' : '?';
    target = `${fallbackPath}${sep}error=${encodeURIComponent(toUserMessage(error))}`;
  }
  revalidatePath('/studio', 'layout');
  redirect(target);
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function optStr(form: FormData, key: string): string | undefined {
  const v = str(form, key);
  return v === '' ? undefined : v;
}

/** `<input type="datetime-local">` 给的是没有时区的 'YYYY-MM-DDTHH:mm' */
function optTime(form: FormData, key: string): string | undefined {
  const v = optStr(form, key);
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

// ── Journey ──────────────────────────────────────────────────────────────────

export async function createJourneyAction(form: FormData) {
  return run('/studio', async () => {
    const actor = await requireActor();
    // 非法 type 不在这里挡 —— 原样传下去，让 assertValidJourneyInput 说话。
    // 在两个地方各写一套措辞，迟早会不一致。
    const type = str(form, 'type') as JourneyType;
    const journey = await createJourney(getCore(), actor, {
      title: str(form, 'title'),
      type,
      intent: optStr(form, 'intent'),
      startedAt: optTime(form, 'startedAt') ?? new Date().toISOString(),
      endedAt: optTime(form, 'endedAt'),
    });
    return `/studio/journeys/${journey.id}`;
  });
}

export async function deleteJourneyAction(form: FormData) {
  return run('/studio', async () => {
    const actor = await requireActor();
    await deleteJourney(getCore(), actor, str(form, 'journeyId'));
    return '/studio?notice=' + encodeURIComponent('Journey 已删除，里面的 Moment 变成未归类，没有被删掉。');
  });
}

// ── Moment ───────────────────────────────────────────────────────────────────

export async function createMomentAction(form: FormData) {
  const journeyId = optStr(form, 'journeyId');
  const back = journeyId ? `/studio/journeys/${journeyId}` : '/studio';
  return run(back, async () => {
    const actor = await requireActor();
    // 没有 title、没有地点、**没有照片**也能建 —— ADR-004 M1
    const { moment } = await createMoment(getCore(), actor, {
      journeyId,
      title: optStr(form, 'title'),
      occurredAt: optTime(form, 'occurredAt'),
      placeLabel: optStr(form, 'placeLabel'),
      firstObservation: optStr(form, 'firstObservation'),
      now: new Date().toISOString(),
    });
    return `/studio/moments/${moment.id}`;
  });
}

export async function addObservationAction(form: FormData) {
  const momentId = str(form, 'momentId');
  return run(`/studio/moments/${momentId}`, async () => {
    const actor = await requireActor();
    await addObservation(getCore(), actor, momentId, {
      content: str(form, 'content'),
      recordedAt: optTime(form, 'recordedAt'),
    });
  });
}

export async function reviseInterpretationAction(form: FormData) {
  const momentId = str(form, 'momentId');
  return run(`/studio/moments/${momentId}`, async () => {
    const actor = await requireActor();
    await reviseInterpretation(getCore(), actor, momentId, {
      content: str(form, 'content'),
      // 表单里带着「我打开页面时看到的当前版本」。
      // 期间在别处改过，这里会明确报错，而不是让理解链分叉。
      expectedCurrentId: optStr(form, 'expectedCurrentId'),
    });
  });
}

export async function deleteMomentAction(form: FormData) {
  return run('/studio', async () => {
    const actor = await requireActor();
    const { tombstonedBlocks } = await deleteMoment(
      getCore(),
      actor,
      str(form, 'momentId'),
      new Date().toISOString()
    );
    const notice =
      tombstonedBlocks > 0
        ? `Moment 已删除。引用它的 ${tombstonedBlocks} 处作品段落保留了当时的内容。`
        : 'Moment 已删除。';
    return `/studio?notice=${encodeURIComponent(notice)}`;
  });
}

// ── Work ─────────────────────────────────────────────────────────────────────

export async function createWorkAction(form: FormData) {
  return run('/studio/works', async () => {
    const actor = await requireActor();
    const work = await createWork(getCore(), actor, { title: str(form, 'title') });
    return `/studio/works/${work.id}`;
  });
}

export async function addTextBlockAction(form: FormData) {
  const workId = str(form, 'workId');
  return run(`/studio/works/${workId}`, async () => {
    const actor = await requireActor();
    await addTextBlock(getCore(), actor, workId, str(form, 'text'));
  });
}

export async function addMomentToWorkAction(form: FormData) {
  const workId = str(form, 'workId');
  return run(`/studio/works/${workId}`, async () => {
    const actor = await requireActor();
    // 引用别人的 Moment 会在这里变成 NotFoundError → 「找不到，或者不属于你」
    await addMomentToWork(getCore(), actor, workId, str(form, 'momentId'));
  });
}

export async function removeBlockAction(form: FormData) {
  const workId = str(form, 'workId');
  return run(`/studio/works/${workId}`, async () => {
    const actor = await requireActor();
    await removeBlock(getCore(), actor, workId, str(form, 'blockId'));
  });
}

export async function deleteWorkAction(form: FormData) {
  return run('/studio/works', async () => {
    const actor = await requireActor();
    await deleteWork(getCore(), actor, str(form, 'workId'));
    return `/studio/works?notice=${encodeURIComponent('作品已删除。已经发布出去的链接不受影响，仍然可以打开。')}`;
  });
}

// ── 发布 ─────────────────────────────────────────────────────────────────────

export async function publishWorkAction(form: FormData) {
  const workId = str(form, 'workId');
  return run(`/studio/works/${workId}`, async () => {
    const actor = await requireActor();
    const result = await publishWork(getCore(), actor, {
      workId,
      visibility: str(form, 'visibility') === 'public' ? 'public' : 'unlisted',
      now: new Date().toISOString(),
    });
    const what = result.firstPublish ? '已发布' : `已更新到第 ${result.version.versionNumber} 版`;
    return `/studio/works/${workId}?notice=${encodeURIComponent(`${what}：/p/${result.publication.slug}`)}`;
  });
}

export async function withdrawPublicationAction(form: FormData) {
  const workId = str(form, 'workId');
  return run(`/studio/works/${workId}`, async () => {
    const actor = await requireActor();
    await withdrawPublication(getCore(), actor, str(form, 'publicationId'));
    return `/studio/works/${workId}?notice=${encodeURIComponent('已下架。链接还在，访客会看到「作者已下架」而不是 404。')}`;
  });
}
