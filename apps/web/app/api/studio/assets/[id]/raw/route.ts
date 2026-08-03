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

/**
 * 原图：`private, no-store`。
 *
 * 比派生副本更严一档，因为原图**带着 GPS 和相机序列号** ——
 * GPS 精确到用户家门口。
 *
 * `no-cache` 允许客户端把字节存在磁盘上（只是每次用前来问一次）；
 * `no-store` 连存都不许。对这类内容，少一次落盘比省一次传输重要。
 *
 * 代价：作者每次打开 Moment 页面都会重新下载缩略图。
 * 这在当前规模下可以接受，真成为问题时的解法是**服务端生成受控尺寸的
 * 预览副本**（和发布派生同一套机制），而不是放松这里的缓存策略。
 */
const PRIVATE_NO_STORE = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization',
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const actor = await getActor();
    const { bytes, mimeType } = await readAssetBytes(
      { core: getCore(), storage: getStorageKit() },
      actor,
      id
    );

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...PRIVATE_NO_STORE,
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
