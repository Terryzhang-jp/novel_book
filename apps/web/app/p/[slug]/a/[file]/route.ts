/**
 * 发布页里的图片 —— `/p/{slug}/a/{derivedHash}.webp`
 *
 * ADR-008 A8 / 契约 R-1..R-5。
 *
 * ## 为什么不用公开桶
 *
 * 公开桶只有两种选择，两种都不对：
 *   删文件  → 撤回变成不可逆
 *   留文件  → 撤回是假的，链接还能打开
 *
 * 走一条只看 Publication 状态的路由，撤回当下就 404，字节还在。
 *
 * ## URL 里为什么是 hash 而不是 objectKey
 *
 * objectKey 长这样：`users/{userId}/sha256/ab/....webp`。
 * 直接放进公开 URL 会泄露作者的内部 id。所以对外只出现派生内容的 hash，
 * 由这个路由在**该篇的快照里**把它换成 objectKey。
 *
 * ## 只读两张表
 *
 * publications + work_versions。不查 published_assets，
 * 也不查任何实时表 —— 派生副本的信息就在快照里。
 *
 * ## ⚠️ 「内容不可变」不等于「响应可以永久缓存」
 *
 * 这两件事以前被混为一谈，响应头写的是
 * `public, max-age=31536000, immutable`。那是错的：
 *
 *   对象内容不可变   同一个 hash 永远对应同一份字节 —— 这是真的
 *   响应永久有效     浏览器 / CDN 拿到之后可以长期不再询问服务器 —— 这是假的
 *
 * 因为**可访问性是会变的**。作者撤回之后 origin 确实返回 404，
 * 但已经缓存过的客户端**根本不会来问**，于是撤回在那些客户端上没有发生。
 * E2E 只覆盖了 origin 的访问控制，覆盖不到这一层。
 *
 * 所以改成 `no-cache, must-revalidate` + `ETag`：
 * 字节仍然可以被缓存（省流量），但每次使用前必须回来验证一次。
 * Publication 还有效就回 304，撤回了就回 404。
 *
 * 等将来有了能主动 purge 的 CDN，才谈得上长期缓存。
 */

import { NextResponse } from 'next/server';
import { viewPublication } from '@tc/application';
import type { SnapshotAsset, Visibility } from '@tc/domain';
import { getActor, getCore } from '@/lib/core/context';
import { getObjectStorage } from '@/lib/core/storage';

export const dynamic = 'force-dynamic';

const notFound = () => new NextResponse('Not found', { status: 404 });

/**
 * 可缓存但必须重新验证。
 *
 * `no-cache` 的实际含义是「可以存，但用之前必须回来问」——
 * 不是「不要缓存」（那是 `no-store`）。这正是我们要的：
 * 省下重复传输，同时让撤回在下一次访问就生效。
 */
function revalidatableHeaders(etag: string, visibility: Visibility): Record<string, string> {
  // ⚠️ 缓存的可共享性必须跟着**可见性**走。
  //
  // private 的发布页只有作者本人能看。如果响应头写 `public`，任何共享缓存
  // （CDN、公司代理、浏览器扩展）都可以把它存下来发给别人 ——
  // 应用层的授权做得再对也拦不住。
  //
  // 第一版只有 private / unlisted / public 三种；将来加 `shared` 时
  // 它必须归到 private 这一档。
  const shareable = visibility === 'public' || visibility === 'unlisted';
  return {
    'Cache-Control': shareable
      ? 'public, no-cache, must-revalidate'
      : 'private, no-cache, must-revalidate',
    ETag: etag,
    // 响应内容取决于调用者是不是作者本人，缓存必须按凭据区分
    ...(shareable ? {} : { Vary: 'Cookie, Authorization' }),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; file: string }> }
) {
  const { slug, file } = await params;

  // `abc123….webp` → `abc123…`
  const hash = file.replace(/\.[a-z0-9]+$/i, '');
  if (!/^[a-f0-9]{64}$/.test(hash)) return notFound();

  try {
    // slug 同样是百分号编码的（中文标题）。理由见 app/p/[slug]/page.tsx。
    const decoded = decodeURIComponent(slug);
    const view = await viewPublication(getCore(), await getActor(), decoded);

    // R-1：不存在 / 别人的私有页 / 已撤回 —— 一律 404。
    // 撤回后立刻失效，这正是不用公开桶的原因。
    if (view.status !== 'ok') return notFound();

    // R-2：必须确认这个 hash 真的属于这一篇。
    // 少了这一步，拿任意一篇的 slug 就能取到别篇的图。
    let found: SnapshotAsset | undefined;
    for (const block of view.page.version.snapshot.blocks) {
      if (block.type !== 'moment_ref') continue;
      found = block.moment?.assets?.find((a) => a.derivedHash === hash);
      if (found) break;
    }
    if (!found) return notFound();

    // 内容寻址 ⇒ hash 就是最强的 ETag：字节变了 hash 必然变。
    const etag = `"${found.derivedHash}"`;
    const visibility = view.page.publication.visibility;

    // 走到这里说明 Publication **此刻**可访问。客户端手上的副本仍然有效，
    // 不用重传字节 —— 但它必须每次都来问一次，这正是撤回能立刻生效的原因。
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: revalidatableHeaders(etag, visibility),
      });
    }

    const bytes = await getObjectStorage().get(found.objectKey);

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...revalidatableHeaders(etag, visibility),
        'Content-Type': found.mimeType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[p] 读取发布素材失败：', error);
    return notFound();
  }
}
