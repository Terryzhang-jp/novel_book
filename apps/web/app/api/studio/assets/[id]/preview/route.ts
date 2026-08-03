/**
 * 受控预览 —— 私人的、剥了元数据的缩小副本
 *
 * `/raw` 给的是原件：满分辨率、带 GPS、带相机序列号、`no-store`。
 * 相册网格里放 50 个 `/raw` 意味着每翻一页下载几百 MB，而且把每一张
 * 照片的拍摄地点带进浏览器的磁盘缓存边缘。
 *
 * 这个端点走的是**和发布派生完全同一个 ImageDeriver** —— 同一段剥离
 * 元数据的代码。共用一个实现，是为了不出现「发布时剥干净了、预览没剥」
 * 这种只在其中一条路径上成立的安全性。
 *
 * ## 缓存策略
 *
 * `private, no-cache, must-revalidate` + ETag。
 *
 *   private          这是某个人的素材，中间代理不许存
 *   no-cache         客户端可以存，但**每次用之前都要来问一次**
 *   ETag             问的那一次通常返回 304，不传字节
 *
 * 比 `/raw` 的 `no-store` 松一档，理由是这份副本已经不带 GPS 和设备
 * 序列号了。比 `max-age` 严一档，理由是素材被删除或账号被停用之后，
 * 缓存不能继续替我们送出内容 —— `no-cache` 保证下一次使用前一定回来问，
 * 那时候鉴权就会拦住它。
 *
 * ETag **只由数据库里的行算出来**（sha256 + 档位 + 算法版本），
 * 所以 304 那一路根本不会读字节、不会调 sharp。
 */

import { NextResponse } from 'next/server';
import { isPreviewPreset, readAssetPreview } from '@tc/application';
import { NotFoundError, UnauthenticatedError } from '@tc/domain';
import { getActor, getCore } from '@/lib/core/context';
import { getImageDeriver, getStorageKit } from '@/lib/core/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRIVATE_REVALIDATE = {
  'Cache-Control': 'private, no-cache, must-revalidate',
  Vary: 'Cookie, Authorization',
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const size = new URL(request.url).searchParams.get('size') ?? 'thumb';

  // 不认识的档位一律 404，不回退到默认档。
  // 静默回退会让 `?size=huge` 返回 200 加一张小图 —— 调用方以为自己拿到了
  // 请求的东西，问题要到用户看见糊图时才暴露。
  if (!isPreviewPreset(size)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const actor = await getActor();
    const ifNoneMatch = request.headers.get('if-none-match');
    const preview = await readAssetPreview(
      { core: getCore(), storage: getStorageKit(), imageDeriver: getImageDeriver() },
      actor,
      id,
      { preset: size, ...(ifNoneMatch ? { ifNoneMatch } : {}) }
    );

    if (preview.kind === 'not-modified') {
      // 304 也要带上缓存头 —— 少了它，客户端会用上一次响应的策略，
      // 而那个策略可能是几个版本之前的。
      return new NextResponse(null, {
        status: 304,
        headers: { ...PRIVATE_REVALIDATE, ETag: preview.etag },
      });
    }

    return new NextResponse(Buffer.from(preview.bytes), {
      headers: {
        ...PRIVATE_REVALIDATE,
        ETag: preview.etag,
        'Content-Type': preview.mimeType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    // 别人的素材、不存在的素材、没有预览的音频、未登录 ——
    // 一律 404，不区分（ADR-001）。
    // 未登录也返回 404 而不是 401：401 会告诉未登录者「登录之后这里有东西」。
    if (error instanceof NotFoundError || error instanceof UnauthenticatedError) {
      return new NextResponse('Not found', { status: 404 });
    }
    console.error('[studio] 生成预览失败：', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
