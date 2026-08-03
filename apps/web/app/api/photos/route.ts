/**
 * 旧 Gallery 的上传与列表 —— **已经完全走新路径**（Phase 3A / 16B + 16C）
 *
 * URL 没变，请求和响应的形状没变，旧页面一行没改。
 * 变的是底下：
 *
 *   以前   photoStorage.create()  →  Supabase Storage + photos 表
 *   现在   uploadAsset()          →  ObjectStorage + assets 表
 *
 * ## 为什么是硬切，不是双写
 *
 * 「上传一次 → 写 Photo → 再写 Asset」会制造：一边成功一边失败、两份 id、
 * 两套删除语义、逐渐分叉的 metadata、重复的用户隔离规则，以及一张永远
 * 不敢删的旧表。旧生产数据已经不存在，没有需要保护的兼容性 ——
 * 所以新 Asset 是**唯一**的写入事实，旧形状由只读投影提供。
 * 见 docs/LEGACY-WRITE-INVENTORY.md 第四节。
 *
 * ## 校验去哪了
 *
 * 原来这里有一段「允许的图片 MIME 白名单 + 10MB 上限」。现在只留下
 * 一个便宜的前置尺寸检查，真正的判定在 `uploadAsset` 里：
 *
 *   类型   由**魔术字节**判定，不信任浏览器声明的 Content-Type
 *   大小   MAX_UPLOAD_BYTES，与 Studio 上传同一个常量
 *   账号   requireActiveOwner —— 在写任何字节之前
 *
 * 两处各写一套白名单的结果是它们会分叉，然后同一个文件在两个入口
 * 得到不同的结论。
 */

import { NextResponse } from 'next/server';
import { uploadAsset } from '@tc/application';
import type { PhotoCategory } from '@tc/legacy-adapters';
import { rateLimit } from '@/lib/api/guard';
import { apiError, requireApiActor } from '@/lib/core/api';
import { getCore } from '@/lib/core/context';
import { getMediaProbe, getStorageKit } from '@/lib/core/storage';
import { listLegacyPhotos, projectAsset } from '@/lib/legacy/photo-compat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATEGORIES: readonly string[] = [
  'time-location',
  'time-only',
  'location-only',
  'neither',
];

/**
 * POST /api/photos —— 上传一份素材
 *
 * 响应保持旧形状（id / fileName / category / metadata / url / createdAt），
 * 因为 app/gallery/upload/page.tsx 就是这么读的。
 */
export async function POST(req: Request) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  const userId = guard.actor.type === 'user' ? guard.actor.userId : 'anonymous';
  const limited = rateLimit(`photo-upload:${userId}`, { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: 'No file uploaded', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { asset, deduplicated } = await uploadAsset(
      { core: getCore(), storage: getStorageKit(), probe: getMediaProbe() },
      guard.actor,
      {
        bytes,
        // 浏览器声明的类型只作参考 —— 真实类型由魔术字节判定
        declaredMimeType: file.type || 'application/octet-stream',
      }
    );

    const photo = projectAsset(asset);

    return NextResponse.json({
      id: photo.id,
      fileName: photo.fileName,
      category: photo.category,
      metadata: photo.metadata,
      url: photo.fileUrl,
      createdAt: photo.createdAt,
      /**
       * 旧接口没有这个字段。加上是因为去重是**用户看得见的行为差异**：
       * 传了三次同一张图只会得到一个 id。不说的话，用户会以为传丢了。
       */
      deduplicated,
    });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * GET /api/photos —— 旧 Gallery 的列表
 *
 * 返回的是新 Asset 投影出来的 Photo 形状（16C）。**不读 photos 表。**
 */
export async function GET(req: Request) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  try {
    const { searchParams } = new URL(req.url);
    const rawCategory = searchParams.get('category');
    const rawSort = searchParams.get('sortOrder');

    const page = await listLegacyPhotos(guard.actor, {
      ...(rawCategory && CATEGORIES.includes(rawCategory)
        ? { category: rawCategory as PhotoCategory }
        : {}),
      ...(rawSort === 'oldest' ? { sortOrder: 'oldest' as const } : {}),
      limit: Number.parseInt(searchParams.get('limit') ?? '50', 10) || 50,
      offset: Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0,
    });

    return NextResponse.json(
      {
        photos: page.photos,
        stats: page.stats,
        userId: guard.actor.type === 'user' ? guard.actor.userId : null,
        /**
         * 素材超过投影上限时为 true。
         *
         * 静默截断在这个代码库里是明确禁止的：一个只返回前 N 条的接口，
         * 在调用方看来和「这个人只有 N 张照片」完全一样。
         */
        ...(page.truncated ? { truncated: true } : {}),
      },
      {
        // 这是某个人的私人素材列表。中间代理不许存，客户端每次用前必须来问。
        headers: {
          'Cache-Control': 'private, no-cache, must-revalidate',
          Vary: 'Cookie, Authorization',
        },
      }
    );
  } catch (error) {
    return apiError(error);
  }
}
