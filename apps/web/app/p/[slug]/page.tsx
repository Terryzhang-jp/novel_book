/**
 * /p/[slug] —— 公开的发布页
 *
 * ## 这个文件里没有任何一次实时表查询
 *
 * 它只调 `viewPublication`，那个用例只调 `findBySlug`，而那条 SQL 只 JOIN
 * publications 和 work_versions 两张表。渲染用的 `SnapshotView` 的唯一入参
 * 是 `WorkSnapshot` —— 它拿不到 repository，也拿不到 actor。
 *
 * 这就是 ADR-006 判定标准落在代码里的样子。
 * test/integration/publication-snapshot.test.ts 会把五张实时表全部改名，
 * 然后要求这条路径照样返回内容。
 *
 * ## 匿名可访问
 *
 * middleware.ts 把 /p 列进公开路由。actor 是 anonymous 时依然能读到
 * public / unlisted 的发布 —— 「未登录」在这个系统里是一种合法身份。
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { viewPublication } from '@tc/application';
import { getActor, getCore } from '@/lib/core/context';
import { SnapshotView } from '@/components/studio/renderers';

export const dynamic = 'force-dynamic';

/**
 * 路由参数里的 slug 是**百分号编码**的。
 *
 * slugify 保留中日文（`秩父三日` 就是一个合法 slug），浏览器把它编码成
 * `%E7%A7%A9%E7%88%B6%E4%B8%89%E6%97%A5` 发出去，而 Next 交给页面的
 * params.slug 就是这串编码后的文字。不解码直接拿去查库，
 * **所有中文标题的作品发布出去都是 404** —— E2E 第一次跑就抓到了它。
 *
 * decodeURIComponent 在这里是幂等的：slugify 会把 `%` 转成连字符，
 * 所以 slug 里不可能出现百分号。哪天 Next 改成传解码后的值，这行也仍然正确。
 */
function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // 非法的百分号序列 —— 那就不是我们发出去的链接，原样传下去让它 404
    return raw;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const view = await viewPublication(getCore(), await getActor(), decodeSlug(slug));
  if (view.status !== 'ok') return { title: '未找到' };
  return { title: view.page.version.snapshot.work.title };
}

export default async function PublicationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getActor();
  const view = await viewPublication(getCore(), actor, decodeSlug(slug));

  // 不存在、以及别人的私有页面 —— 同一个 404。
  // 区分两者会泄露「这个 slug 存在」。
  if (view.status === 'not_found') notFound();

  if (view.status === 'withdrawn') {
    // 撤回不删记录，所以这里能明确说「作者下架了」，
    // 而不是让访客对着 404 猜是自己记错了链接。
    return (
      <main className="mx-auto max-w-2xl px-4 py-24 text-center" data-testid="pub-withdrawn">
        <h1 className="mb-3 text-xl font-medium text-neutral-800">作者已下架这篇作品</h1>
        <p className="text-sm text-neutral-500">链接没有失效，只是内容不再公开。</p>
      </main>
    );
  }

  return (
    <main>
      <SnapshotView snapshot={view.page.version.snapshot} slug={decodeSlug(slug)} />
      <footer className="mx-auto max-w-2xl border-t border-neutral-200 px-4 py-6 text-xs text-neutral-400">
        发布于 {view.page.publication.publishedAt.slice(0, 10)} · 第{' '}
        {view.page.version.versionNumber} 版
        <br />
        这个页面显示的是作者发布那一刻的内容。作者后来的修改不会改变它。
      </footer>
    </main>
  );
}
