/**
 * /studio/journeys/[id] —— 旅程详情 + 在其中记录 Moment
 *
 * 建 Moment 的表单里**没有上传控件**。这不是还没做，
 * 是 ADR-004 M1：Moment 不必须有素材，一句观察就足以构成一个 Moment。
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJourney, listMoments } from '@tc/application';
import { NotFoundError } from '@tc/domain';
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
import { createMomentAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function JourneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const actor = await requireActor();
  const core = getCore();

  // 别人的 Journey 和不存在的 Journey 都走到这里 —— 统一 404，
  // 不让访问者通过响应差异判断某个 id 是否存在（ADR-001）。
  let journey: Awaited<ReturnType<typeof getJourney>>;
  try {
    journey = await getJourney(core, actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const moments = await listMoments(core, actor, { journeyId: id });

  return (
    <Shell>
      <H1>{journey.title}</H1>
      <Muted>
        {journey.type} · {fmtDate(journey.startedAt)} →{' '}
        {journey.endedAt ? fmtDate(journey.endedAt) : '进行中'}
      </Muted>
      {journey.intent ? <p className="mt-3 text-neutral-700">{journey.intent}</p> : null}
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      <H2>记一个 Moment</H2>
      <form action={createMomentAction} className="rounded border border-neutral-200 p-4">
        <input type="hidden" name="journeyId" value={journey.id} />
        <Field label="标题（可以留空）">
          <input name="title" className={inputClass} data-testid="moment-title" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="什么时候发生的（可以留空）">
            <input type="datetime-local" name="occurredAt" className={inputClass} />
          </Field>
          <Field label="在哪（可以留空）">
            <input name="placeLabel" className={inputClass} data-testid="moment-place" />
          </Field>
        </div>
        <Field label="当时注意到什么">
          <textarea
            name="firstObservation"
            rows={3}
            className={inputClass}
            data-testid="moment-observation"
          />
        </Field>
        <p className="mb-3 text-xs text-neutral-400">
          没有照片也可以。这一版刻意不接素材上传 —— 先证明「记录经历」本身成立。
        </p>
        <button type="submit" className={buttonClass} data-testid="moment-submit">
          记下来
        </button>
      </form>

      <H2>这段旅程里的 Moment（{moments.length}）</H2>
      {moments.length === 0 ? (
        <Muted>还没有记录。</Muted>
      ) : (
        <ul data-testid="moment-list">
          {moments.map((m) => (
            <li key={m.id}>
              <Card>
                <Link href={`/studio/moments/${m.id}`} className="font-medium hover:underline">
                  {m.title || <span className="text-neutral-400">（无标题）</span>}
                </Link>
                <p className="mt-1 text-xs text-neutral-500">
                  {[fmtDate(m.occurredAt), m.placeLabel].filter(Boolean).join(' · ') || '—'}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8">
        <Link href="/studio" className="text-sm text-neutral-500 hover:underline">
          ← 全部旅程
        </Link>
      </p>
    </Shell>
  );
}
