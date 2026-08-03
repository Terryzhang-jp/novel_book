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
 */

import { NextResponse } from 'next/server';
import { viewPublication } from '@tc/application';
import type { SnapshotAsset } from '@tc/domain';
import { getActor, getCore } from '@/lib/core/context';
import { getObjectStorage } from '@/lib/core/storage';

export const dynamic = 'force-dynamic';

const notFound = () => new NextResponse('Not found', { status: 404 });

export async function GET(
  _request: Request,
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

    const bytes = await getObjectStorage().get(found.objectKey);

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': found.mimeType,
        // 内容寻址 ⇒ 这个 URL 的字节永不改变，可以放心 immutable。
        // public 是安全的：这是剥离了元数据的派生副本，不是原图。
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[p] 读取发布素材失败：', error);
    return notFound();
  }
}
