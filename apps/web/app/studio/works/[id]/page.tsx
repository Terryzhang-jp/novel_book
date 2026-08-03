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
import {
  currentInterpretation,
  NotFoundError,
  parsePresentationConfig,
  PRESENTATION_FIELDS,
  RENDERER_TYPES,
  RENDERER_VERSIONS,
} from '@tc/domain';
import { getCore, requirePageActor } from '@/lib/core/context';
import {
  Banner,
  buttonClass,
  Field,
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
  savePresentationAction,
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
  const actor = await requirePageActor();
  const core = getCore();

  let detail: Awaited<ReturnType<typeof getWorkDetail>>;
  try {
    detail = await getWorkDetail(core, actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  // 每种表现各自一条版本线、各自一个 Publication（ADR-010 R5）
  const renderers = [...RENDERER_TYPES];
  const perRenderer = await Promise.all(
    renderers.map(async (renderer) => ({
      renderer,
      config: parsePresentationConfig(
        renderer,
        detail.presentations.find((p) => p.rendererType === renderer)?.config
      ),
      saved: detail.presentations.some((p) => p.rendererType === renderer),
      published: await core.publications.findByWork(actor, id, renderer),
      versions: await listWorkVersions(core, actor, id, renderer),
    }))
  );

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

      {/* ── 表现方式与发布 ───────────────────────────────────────────────── */}
      <H2>表现方式</H2>
      <Muted>
        同一份内容，不同的看法。表现只决定「看起来怎么样」——
        它不能隐藏、重排或改写上面任何一段内容。
      </Muted>

      {perRenderer.map(({ renderer, config, saved, published, versions }) => (
        <div
          key={renderer}
          className="mb-4 mt-3 rounded border border-neutral-200 p-4"
          data-testid={`presentation-${renderer}`}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-medium">
              {renderer === 'narrative' ? 'Narrative —— 文字与理解主导' : 'Gallery —— 图片主导'}
            </h3>
            <span className="text-xs text-neutral-400">
              {renderer}@{RENDERER_VERSIONS[renderer]}
              {saved ? '' : ' · 未保存过，用的是默认值'}
            </span>
          </div>

          <form action={savePresentationAction} className="mb-3">
            <input type="hidden" name="workId" value={detail.work.id} />
            <input type="hidden" name="renderer" value={renderer} />
            <div className="grid gap-3 sm:grid-cols-2">
              {PRESENTATION_FIELDS[renderer].map((field) => (
                <Field key={field.key} label={field.label}>
                  <select
                    name={field.key}
                    className={inputClass}
                    defaultValue={String((config as unknown as Record<string, unknown>)[field.key])}
                    data-testid={`${renderer}-${field.key}`}
                  >
                    {field.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <button type="submit" className={linkButtonClass} data-testid={`save-${renderer}`}>
              保存表现方式
            </button>
          </form>

          {published ? (
            <div className="rounded bg-neutral-50 p-3 text-sm" data-testid={`publication-${renderer}`}>
              <Link href={`/p/${published.publication.slug}`} className="font-medium underline">
                /p/{published.publication.slug}
              </Link>
              <span className="ml-2 text-xs text-neutral-500">
                第 {published.version.versionNumber} 版 ·{' '}
                {published.version.snapshot.presentation.rendererType}@
                {published.version.snapshot.presentation.rendererVersion}
                {published.publication.withdrawnAt ? ' · 已下架' : ''}
              </span>
              <p className="mt-1 text-xs text-neutral-500">
                改了上面的配置之后，这个链接不会变 —— 要让读者看到，得再发布一次。
              </p>
              <form action={withdrawPublicationAction} className="mt-2">
                <input type="hidden" name="workId" value={detail.work.id} />
                <input type="hidden" name="publicationId" value={published.publication.id} />
                <button type="submit" className={linkButtonClass} data-testid={`withdraw-${renderer}`}>
                  下架
                </button>
              </form>
            </div>
          ) : (
            <Muted>这种表现还没有发布过。</Muted>
          )}

          <form action={publishWorkAction} className="mt-3 flex items-end gap-3">
            <input type="hidden" name="workId" value={detail.work.id} />
            <input type="hidden" name="renderer" value={renderer} />
            <label className="text-sm">
              <span className="mr-2 text-neutral-600">谁能看到</span>
              <select name="visibility" className="rounded border border-neutral-300 px-2 py-1 text-sm" defaultValue="unlisted">
                <option value="unlisted">unlisted</option>
                <option value="public">public</option>
              </select>
            </label>
            <button type="submit" className={buttonClass} data-testid={`publish-${renderer}`}>
              {published ? '重新发布这一种' : '发布这一种'}
            </button>
            {versions.length > 0 ? (
              <span className="text-xs text-neutral-400" data-testid={`versions-${renderer}`}>
                已有 {versions.length} 个版本
              </span>
            ) : null}
          </form>
        </div>
      ))}

      <Muted>
        发布 Narrative 不会更新 Gallery 的链接 —— 它们是两次独立的
        「我决定把这一版给别人看」。
      </Muted>

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
