/**
 * /studio/works/[id] —— 编辑与发布
 *
 * ## 页面上要同时看得见的两件事
 *
 *   草稿区   显示 Moment 的**实时**内容 —— 改了理解，这里立刻变
 *   已发布区 显示**快照**版本号 —— 不点「重新发布」就一个字都不会变
 *
 * 这两块并排放在一屏里，是刻意的：产品最难解释的一件事就是
 * 「我改了，为什么发出去的没变」。让它自己说明自己。
 *
 * 不接 Tiptap、不接拖拽 —— 明确在「暂不接」清单里。
 * block 顺序目前由追加顺序决定；重排的 API 已经在
 * WorkRepository.reorderBlocks 里实现并测试，只是没接 UI。
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWorkDetail, listWorkVersions } from '@tc/application';
import { currentInterpretation, NotFoundError } from '@tc/domain';
import { getCore, requireActor } from '@/lib/core/context';
import {
  Banner,
  buttonClass,
  Field,
  fmtDateTime,
  H1,
  H2,
  inputClass,
  linkButtonClass,
  Muted,
  Shell,
} from '@/components/studio/chrome';
import {
  addMomentToWorkAction,
  addTextBlockAction,
  deleteWorkAction,
  publishWorkAction,
  removeBlockAction,
  withdrawPublicationAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

export default async function WorkPage({
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

  let detail: Awaited<ReturnType<typeof getWorkDetail>>;
  try {
    detail = await getWorkDetail(core, actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [versions, published] = await Promise.all([
    listWorkVersions(core, actor, id),
    core.publications.findByWork(actor, id),
  ]);

  return (
    <Shell>
      <H1>{detail.work.title}</H1>
      <Muted>草稿。这里显示的是 Moment 的当前内容 —— 改一次理解，这里跟着变。</Muted>
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      {/* ── 草稿内容 ─────────────────────────────────────────────────────── */}
      <H2>内容（{detail.blocks.length} 段）</H2>
      <ol data-testid="block-list">
        {detail.blocks.map((b) => {
          const moment = b.momentId ? detail.moments.get(b.momentId) : undefined;
          const current = moment
            ? currentInterpretation(detail.interpretations.get(moment.id) ?? [])
            : null;

          return (
            <li key={b.id} className="mb-3 rounded border border-neutral-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-neutral-400">
                  {b.position} · {b.type === 'text' ? '文字' : '引用 Moment'}
                </span>
                <form action={removeBlockAction}>
                  <input type="hidden" name="workId" value={detail.work.id} />
                  <input type="hidden" name="blockId" value={b.id} />
                  <button type="submit" className="text-xs text-neutral-400 hover:text-red-600">
                    移除
                  </button>
                </form>
              </div>

              {b.type === 'text' ? (
                <p className="whitespace-pre-wrap">{b.textContent}</p>
              ) : moment ? (
                <div>
                  <Link
                    href={`/studio/moments/${moment.id}`}
                    className="font-medium hover:underline"
                  >
                    {moment.title || '（无标题的 Moment）'}
                  </Link>
                  {(detail.observations.get(moment.id) ?? []).map((o) => (
                    <p key={o.id} className="mt-2 text-sm text-neutral-700">
                      {o.content}
                    </p>
                  ))}
                  {current ? (
                    <p className="mt-2 border-l-2 border-neutral-300 pl-3 text-sm italic text-neutral-600">
                      {current.content}
                    </p>
                  ) : null}
                </div>
              ) : (
                // Moment 被删除后留下的墓碑。作品里不出现无法解释的空洞。
                <div className="text-sm text-neutral-500" data-testid="draft-tombstone">
                  <p>原始 Moment 已被删除，保留了当时的内容：</p>
                  {b.tombstone?.observations.map((o, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 墓碑不可变，索引稳定
                    <p key={i} className="mt-1">
                      {o}
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {detail.blocks.length === 0 ? <Muted>还是空的。</Muted> : null}
      </ol>

      <div className="grid gap-3 md:grid-cols-2">
        <form action={addTextBlockAction} className="rounded border border-neutral-200 p-4">
          <input type="hidden" name="workId" value={detail.work.id} />
          <Field label="加一段文字">
            <textarea name="text" rows={3} className={inputClass} required data-testid="text-block-input" />
          </Field>
          <button type="submit" className={buttonClass} data-testid="text-block-submit">
            追加
          </button>
        </form>

        <form action={addMomentToWorkAction} className="rounded border border-neutral-200 p-4">
          <input type="hidden" name="workId" value={detail.work.id} />
          <Field label="引用一个 Moment（贴它的 id）">
            <input name="momentId" className={inputClass} required data-testid="moment-ref-input" />
          </Field>
          <button type="submit" className={buttonClass} data-testid="moment-ref-submit">
            引用
          </button>
          <p className="mt-2 text-xs text-neutral-400">
            引用不是复制：Moment 改了，这里跟着变。
            <Link href="/studio/moments" className="ml-1 underline">
              去找 id
            </Link>
          </p>
        </form>
      </div>

      {/* ── 发布 ─────────────────────────────────────────────────────────── */}
      <H2>发布</H2>
      {published ? (
        <div className="mb-3 rounded border border-neutral-300 bg-neutral-50 p-4" data-testid="publication-box">
          <p className="text-sm">
            当前公开的是{' '}
            <Link href={`/p/${published.publication.slug}`} className="font-medium underline">
              /p/{published.publication.slug}
            </Link>{' '}
            的<strong>第 {published.version.versionNumber} 版</strong>
            {published.publication.withdrawnAt ? '（已下架）' : ''}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            发布于 {fmtDateTime(published.publication.publishedAt)} ·{' '}
            {published.publication.visibility}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            上面的草稿改了多少次，这个链接都不会变。要让访客看到新内容，得再点一次发布。
          </p>
          <form action={withdrawPublicationAction} className="mt-3">
            <input type="hidden" name="workId" value={detail.work.id} />
            <input type="hidden" name="publicationId" value={published.publication.id} />
            <button type="submit" className={linkButtonClass} data-testid="withdraw-submit">
              下架
            </button>
          </form>
        </div>
      ) : (
        <Muted>还没有发布过。</Muted>
      )}

      <form action={publishWorkAction} className="rounded border border-neutral-200 p-4">
        <input type="hidden" name="workId" value={detail.work.id} />
        <Field label="谁能看到">
          <select name="visibility" className={inputClass} defaultValue="unlisted">
            <option value="unlisted">unlisted —— 知道链接的人才能看</option>
            <option value="public">public —— 公开</option>
          </select>
        </Field>
        <button type="submit" className={buttonClass} data-testid="publish-submit">
          {published ? '重新发布（生成新版本）' : '发布'}
        </button>
        <p className="mt-2 text-xs text-neutral-400">
          发布会把此刻的内容整份冻结存下来。默认是 unlisted 而不是 public ——
          「点了发布 = 全网可搜」不该是默认值。
        </p>
      </form>

      {versions.length > 0 ? (
        <>
          <H2>版本历史（{versions.length}）</H2>
          <ul className="text-sm" data-testid="version-list">
            {versions.map((v) => (
              <li key={v.id} className="mb-1 flex gap-3 text-neutral-600">
                <span className="w-16 shrink-0">第 {v.versionNumber} 版</span>
                <span className="text-xs text-neutral-400">{fmtDateTime(v.createdAt)}</span>
                <span className="text-xs text-neutral-400">
                  {v.snapshot.blocks.length} 段已冻结
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-10 flex items-center justify-between border-t border-neutral-200 pt-4">
        <Link href="/studio/works" className="text-sm text-neutral-500 hover:underline">
          ← 全部作品
        </Link>
        <form action={deleteWorkAction}>
          <input type="hidden" name="workId" value={detail.work.id} />
          <button
            type="submit"
            className="text-xs text-neutral-400 hover:text-red-600"
            title="删除草稿。已经发布出去的链接不受影响。"
          >
            删除这个作品
          </button>
        </form>
      </div>
    </Shell>
  );
}
