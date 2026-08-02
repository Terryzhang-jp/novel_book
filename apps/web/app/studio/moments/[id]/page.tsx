/**
 * /studio/moments/[id] —— 三层结构在一个页面上同时可见
 *
 * 这是 Phase 2A 最关键的一屏。它必须让人**一眼看出**：
 *
 *   事实   什么时候、在哪              客观，原始值不被覆盖
 *   观察   当时注意到什么（可多条）    当场，追加不是编辑
 *   理解   后来如何解释（可演化）      事后，v1 不会消失
 *
 * 如果这三块在视觉上混成一团，那么模型分了三层也没有意义 ——
 * 用户感知不到的结构等于不存在。
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMomentDetail } from '@tc/application';
import { NotFoundError } from '@tc/domain';
import { getCore, requireActor } from '@/lib/core/context';
import {
  Banner,
  buttonClass,
  Field,
  fmtDate,
  fmtDateTime,
  H1,
  H2,
  inputClass,
  Muted,
  Shell,
} from '@/components/studio/chrome';
import {
  addObservationAction,
  deleteMomentAction,
  reviseInterpretationAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

export default async function MomentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const actor = await requireActor();

  let detail: Awaited<ReturnType<typeof getMomentDetail>>;
  try {
    detail = await getMomentDetail(getCore(), actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const { moment, observations, interpretationChain, current } = detail;
  // 从最新往下读更符合直觉：先看「我现在怎么想」，再往下看它是怎么变过来的
  const historyNewestFirst = [...interpretationChain].reverse();

  return (
    <Shell>
      <H1>{moment.title || '（无标题的 Moment）'}</H1>
      <Muted>
        {[fmtDate(moment.occurredAt), moment.placeLabel].filter(Boolean).join(' · ') ||
          '没有时间、没有地点、没有照片 —— 依然是一个完整的 Moment'}
      </Muted>
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      {/* ── 事实 ─────────────────────────────────────────────────────────── */}
      <H2>事实</H2>
      <dl className="rounded border border-neutral-200 p-4 text-sm">
        <div className="mb-2 flex gap-3">
          <dt className="w-24 shrink-0 text-neutral-500">发生时间</dt>
          <dd>{fmtDateTime(moment.occurredAt)}</dd>
        </div>
        <div className="mb-2 flex gap-3">
          <dt className="w-24 shrink-0 text-neutral-500">地点</dt>
          <dd>{moment.placeLabel || '—'}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 text-neutral-500">来源</dt>
          {/* provenance 从建 Moment 那一刻就写上了。等接入 EXIF 和 AI 之后，
              「这个字段是用户亲手改过的」才有据可查，不会被下一次推断覆盖回去。 */}
          <dd className="font-mono text-xs text-neutral-500">
            {Object.entries(moment.provenance)
              .filter(([k]) => k !== '_v')
              .map(([k, v]) => `${k}=${typeof v === 'object' ? v.source : v}`)
              .join('  ') || '—'}
          </dd>
        </div>
      </dl>

      {/* ── 观察 ─────────────────────────────────────────────────────────── */}
      <H2>观察 —— 我当时注意到什么</H2>
      <Muted>
        可以有很多条。现场记一条、回家再记一条，是两次不同的观察，不是对同一条的修改。
      </Muted>
      <ul className="my-3" data-testid="observation-list">
        {observations.map((o) => (
          <li key={o.id} className="mb-2 border-l-2 border-neutral-200 pl-3">
            <p className="whitespace-pre-wrap">{o.content}</p>
            <p className="mt-1 text-xs text-neutral-400">记于 {fmtDateTime(o.recordedAt)}</p>
          </li>
        ))}
        {observations.length === 0 ? <Muted>还没有观察。</Muted> : null}
      </ul>
      <form action={addObservationAction} className="rounded border border-neutral-200 p-4">
        <input type="hidden" name="momentId" value={moment.id} />
        <Field label="再记一条观察">
          <textarea
            name="content"
            rows={2}
            className={inputClass}
            required
            data-testid="observation-input"
          />
        </Field>
        <button type="submit" className={buttonClass} data-testid="observation-submit">
          追加
        </button>
      </form>

      {/* ── 理解 ─────────────────────────────────────────────────────────── */}
      <H2>理解 —— 我后来怎么看这件事</H2>
      {current ? (
        <div className="rounded border border-neutral-300 bg-neutral-50 p-4" data-testid="current-interpretation">
          <p className="whitespace-pre-wrap">{current.content}</p>
          <p className="mt-2 text-xs text-neutral-400">
            第 {interpretationChain.length} 版 · {fmtDateTime(current.createdAt)}
          </p>
        </div>
      ) : (
        <Muted>还没有写下理解。观察是当时的，理解可以晚一点，也可以之后再改。</Muted>
      )}

      <form action={reviseInterpretationAction} className="mt-3 rounded border border-neutral-200 p-4">
        <input type="hidden" name="momentId" value={moment.id} />
        {/* 带上「我打开页面时的当前版本」。期间在别处改过的话，
            提交会明确失败，而不是让两条 revision 都去取代同一版造成分叉。 */}
        <input type="hidden" name="expectedCurrentId" value={current?.id ?? ''} />
        <Field label={current ? '我的理解变了' : '写下我的理解'}>
          <textarea
            name="content"
            rows={3}
            className={inputClass}
            required
            data-testid="interpretation-input"
          />
        </Field>
        <button type="submit" className={buttonClass} data-testid="interpretation-submit">
          {current ? '保存为新一版' : '保存'}
        </button>
        {current ? (
          <p className="mt-2 text-xs text-neutral-400">
            旧的那版不会被覆盖，它会留在下面的历史里。
          </p>
        ) : null}
      </form>

      {interpretationChain.length > 1 ? (
        <>
          <H2>理解的变化过程（{interpretationChain.length} 版）</H2>
          <ol data-testid="interpretation-history">
            {historyNewestFirst.map((r, i) => (
              <li key={r.id} className="mb-3 border-l-2 border-neutral-200 pl-3">
                <p className="text-xs text-neutral-400">
                  第 {interpretationChain.length - i} 版 · {fmtDateTime(r.createdAt)}
                  {r.status === 'current' ? ' · 当前' : ''}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-neutral-700">{r.content}</p>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <div className="mt-10 flex items-center justify-between border-t border-neutral-200 pt-4">
        <Link
          href={moment.journeyId ? `/studio/journeys/${moment.journeyId}` : '/studio'}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← 返回
        </Link>
        <form action={deleteMomentAction}>
          <input type="hidden" name="momentId" value={moment.id} />
          <button
            type="submit"
            className="text-xs text-neutral-400 hover:text-red-600"
            title="删除后，引用了它的作品段落会保留发布当时的内容，不会出现空洞。"
          >
            删除这个 Moment
          </button>
        </form>
      </div>
    </Shell>
  );
}
