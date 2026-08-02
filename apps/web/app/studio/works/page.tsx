/**
 * /studio/works —— 作品列表
 *
 * Work 上刻意没有 isPublic 字段。公开与否由 Publication 决定 ——
 * 「作品」和「这份作品的某一次公开」是两件事，混在一起就没法解释
 * 「我改了草稿，为什么发出去的链接没变」。
 */

import Link from 'next/link';
import { listPublications, listWorks } from '@tc/application';
import { getCore, requireActor } from '@/lib/core/context';
import {
  Banner,
  buttonClass,
  Card,
  Field,
  fmtDateTime,
  H1,
  H2,
  inputClass,
  Muted,
  Shell,
} from '@/components/studio/chrome';
import { createWorkAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const actor = await requireActor();
  const core = getCore();
  const [works, published] = await Promise.all([
    listWorks(core, actor),
    listPublications(core, actor),
  ]);

  return (
    <Shell>
      <H1>作品</H1>
      <Muted>把 Moment 组织成可以给别人看的东西。作品可以跨越多段旅程。</Muted>
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      <H2>新建作品</H2>
      <form action={createWorkAction} className="rounded border border-neutral-200 p-4">
        <Field label="标题">
          <input name="title" className={inputClass} required data-testid="work-title" />
        </Field>
        <button type="submit" className={buttonClass} data-testid="work-submit">
          创建
        </button>
      </form>

      <H2>我的作品（{works.length}）</H2>
      <ul data-testid="work-list">
        {works.map((w) => (
          <li key={w.id}>
            <Card>
              <Link href={`/studio/works/${w.id}`} className="font-medium hover:underline">
                {w.title}
              </Link>
              <p className="mt-1 text-xs text-neutral-500">更新于 {fmtDateTime(w.updatedAt)}</p>
            </Card>
          </li>
        ))}
        {works.length === 0 ? <Muted>还没有作品。</Muted> : null}
      </ul>

      <H2>已发布（{published.length}）</H2>
      <Muted>
        即使原作品被删除，这些链接依然有效 —— 它们渲染的是发布那一刻的快照。
      </Muted>
      <ul className="mt-3" data-testid="publication-list">
        {published.map(({ publication, version }) => (
          <li key={publication.id}>
            <Card>
              <Link href={`/p/${publication.slug}`} className="font-medium hover:underline">
                /p/{publication.slug}
              </Link>
              <p className="mt-1 text-xs text-neutral-500">
                {version.snapshot.work.title} · 第 {version.versionNumber} 版 ·{' '}
                {publication.visibility}
                {publication.withdrawnAt ? ' · 已下架' : ''}
                {version.workId ? '' : ' · 原作品已删除'}
              </p>
            </Card>
          </li>
        ))}
        {published.length === 0 ? <Muted>还没有发布过。</Muted> : null}
      </ul>
    </Shell>
  );
}
