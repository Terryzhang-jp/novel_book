/**
 * /studio —— 旅程列表 + 未归类的 Moment
 *
 * 这是新核心的首页。它不是「照片库」，第一屏出现的是**旅程**和**尚未归类的
 * 速记**，因为产品的中心是经历，不是素材。
 */

import Link from 'next/link';
import { listJourneys, listMoments } from '@tc/application';
import { getCore, requireActor } from '@/lib/core/context';
import {
  Banner,
  buttonClass,
  Card,
  Field,
  fmtDate,
  H1,
  H2,
  inputClass,
  Muted,
  Shell,
} from '@/components/studio/chrome';
import { createJourneyAction, deleteJourneyAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function StudioHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const actor = await requireActor();
  const core = getCore();

  const [journeys, unfiled] = await Promise.all([
    listJourneys(core, actor),
    listMoments(core, actor, { journeyId: null }),
  ]);

  return (
    <Shell>
      <H1>旅程</H1>
      <Muted>一段有边界的外出经历。私人容器 —— 旅程本身不可公开，公开必须经过作品。</Muted>
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      <H2>新建旅程</H2>
      <form action={createJourneyAction} className="rounded border border-neutral-200 p-4">
        <Field label="标题">
          <input name="title" className={inputClass} required data-testid="journey-title" />
        </Field>
        <Field label="类型">
          <select name="type" className={inputClass} defaultValue="trip" data-testid="journey-type">
            <option value="trip">trip —— 有明确出发和返回的旅行</option>
            <option value="outing">outing —— 当天来回的外出</option>
          </select>
        </Field>
        <Field label="为什么出发（可以留空）">
          <input name="intent" className={inputClass} data-testid="journey-intent" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始">
            <input type="datetime-local" name="startedAt" className={inputClass} data-testid="journey-started" />
          </Field>
          <Field label="结束（留空表示进行中）">
            <input type="datetime-local" name="endedAt" className={inputClass} />
          </Field>
        </div>
        <button type="submit" className={buttonClass} data-testid="journey-submit">
          创建
        </button>
      </form>

      <H2>我的旅程（{journeys.length}）</H2>
      {journeys.length === 0 ? (
        <Muted>还没有旅程。也可以先记 Moment，之后再归类。</Muted>
      ) : (
        <ul data-testid="journey-list">
          {journeys.map((j) => (
            <li key={j.id}>
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/studio/journeys/${j.id}`} className="font-medium hover:underline">
                      {j.title}
                    </Link>
                    <p className="mt-1 text-xs text-neutral-500">
                      {j.type} · {fmtDate(j.startedAt)} →{' '}
                      {j.endedAt ? fmtDate(j.endedAt) : '进行中'}
                    </p>
                    {j.intent ? <p className="mt-2 text-sm text-neutral-700">{j.intent}</p> : null}
                  </div>
                  <form action={deleteJourneyAction}>
                    <input type="hidden" name="journeyId" value={j.id} />
                    <button
                      type="submit"
                      className="text-xs text-neutral-400 hover:text-red-600"
                      title="删除旅程。里面的 Moment 不会被删，只会变成未归类。"
                    >
                      删除
                    </button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <H2>未归类的 Moment（{unfiled.length}）</H2>
      <Muted>现场先速记，之后再决定它属于哪段旅程。</Muted>
      <ul className="mt-3" data-testid="unfiled-list">
        {unfiled.map((m) => (
          <li key={m.id}>
            <Card>
              <Link href={`/studio/moments/${m.id}`} className="hover:underline">
                {m.title || <span className="text-neutral-400">（无标题）</span>}
              </Link>
              <p className="mt-1 text-xs text-neutral-500">{fmtDate(m.occurredAt)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
