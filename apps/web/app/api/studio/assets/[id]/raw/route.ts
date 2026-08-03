/**
 * 原始素材的读取 —— **唯一**入口
 *
 * ADR-002 的硬性约束：LocalFileObjectStorage 的目录不能被静态服务，
 * 读取只能通过一个走鉴权的 route handler。
 *
 * ## 授权发生在哪
 *
 * 在 `readAssetBytes` 里的 `assets.findById(actor, id)` —— 那条 SQL 带
 * `user_id = $2`。**不是**在 storage 层。
 *
 * 这里刻意用 **asset id** 而不是 objectKey 做参数：接受 objectKey 就意味着
 * 「拿到 key 的人就能取件」，而 key 是可以从别处泄露的。
 * 用 id 则每次都必须过一遍所有权检查。
 *
 * 别人的素材和不存在的素材一律 404，不区分（ADR-001）。
 */

import { NextResponse } from 'next/server';
import { readAssetBytes } from '@tc/application';
import { NotFoundError, UnauthenticatedError } from '@tc/domain';
import { getActor, getCore } from '@/lib/core/context';
import { getStorageKit } from '@/lib/core/storage';

export const dynamic = 'force-dynamic';

/** private：原图绝不能进任何共享缓存或 CDN。no-cache：每次都要重新鉴权。 */
function privateHeaders(etag: string): Record<string, string> {
  return {
    'Cache-Control': 'private, no-cache, must-revalidate',
    ETag: etag,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const actor = await getActor();
    const asset = await getCore().assets.findById(actor, id);
    if (!asset) return new NextResponse('Not found', { status: 404 });

    // 和发布资源同一个道理：Asset 的**字节**不可变，但它的**可访问性**会变
    // （软删除、账号状态）。所以是 no-cache + ETag，不是 max-age。
    // 之前写的 `private, max-age=3600` 意味着删掉一份素材之后，
    // 作者自己的浏览器还能再看它一小时。
    const etag = `"${asset.sha256}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: privateHeaders(etag) });
    }

    const { bytes, mimeType } = await readAssetBytes(
      { core: getCore(), storage: getStorageKit() },
      actor,
      id
    );

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...privateHeaders(etag),
        'Content-Type': mimeType,
        // 即使 MIME 判断出错也不让浏览器去猜
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof UnauthenticatedError) {
      return new NextResponse('Not found', { status: 404 });
    }
    console.error('[studio] 读取素材失败：', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
