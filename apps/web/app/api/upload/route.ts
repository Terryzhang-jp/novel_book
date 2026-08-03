/**
 * 编辑器内嵌图片上传 —— 已经完全走新路径（Phase 3A / 16B）
 *
 * 这是 L3：原来它把字节直接扔进 Supabase 的 `documents` bucket，
 * 然后把一个**公开 URL** 写进文档 JSON。两个问题：
 *
 *   1. 公开 bucket 意味着任何拿到 URL 的人都能取件 —— 文档本身是私有的，
 *      但插在里面的图片不是。这不是理论风险，`is_public` 只控制应用
 *      要不要显示，不控制对象能不能被直接访问。
 *   2. 那个 URL 里带着原图，也就是带着 EXIF 和 GPS。
 *
 * 现在两件事都变了：
 *
 *   落库   uploadAsset → ObjectStorage（内容寻址、按用户隔离）
 *   回给编辑器的 URL   指向**受控预览**，不是原件 ——
 *                     长边 1600、WebP、元数据已剥离、走鉴权
 *
 * 原件仍然完整保存在 assets 里（带 GPS），只是不会被写进文档 JSON。
 * 文档里存的是一个需要身份才能取的、干净的副本。
 */

import { NextResponse } from 'next/server';
import { uploadAsset } from '@tc/application';
import { rateLimit } from '@/lib/api/guard';
import { apiError, requireApiActor } from '@/lib/core/api';
import { getCore } from '@/lib/core/context';
import { getMediaProbe, getStorageKit } from '@/lib/core/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 先看声明长度，避免把超大请求整个读进内存。
 *
 * 这是一道**便宜的前置闸**，不是权威判定 —— content-length 是客户端说的。
 * 真正的上限在 uploadAsset 的 MAX_UPLOAD_BYTES 里，对着真实字节数判。
 */
const DECLARED_LENGTH_CEILING = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  const userId = guard.actor.type === 'user' ? guard.actor.userId : 'anonymous';
  const limited = rateLimit(`upload:${userId}`, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    if (!req.body) {
      return NextResponse.json(
        { error: 'No file provided', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const declaredLength = Number(req.headers.get('content-length') ?? '0');
    if (declaredLength > DECLARED_LENGTH_CEILING) {
      return NextResponse.json(
        { error: 'File too large', code: 'FILE_TOO_LARGE' },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(await req.arrayBuffer());
    const { asset } = await uploadAsset(
      { core: getCore(), storage: getStorageKit(), probe: getMediaProbe() },
      guard.actor,
      {
        bytes,
        declaredMimeType: req.headers.get('content-type') ?? 'application/octet-stream',
      }
    );

    // ⭐ 返回预览而不是 /raw。
    //
    // 这个 URL 会被写进文档 JSON 并长期保存下去，所以它指向什么，
    // 就等于「这篇文档里的图片永远是什么」。指向原件的话，每一次打开
    // 文档都会把满分辨率的、带 GPS 的字节发一遍。
    return NextResponse.json({
      url: `/api/studio/assets/${asset.id}/preview?size=large`,
      assetId: asset.id,
    });
  } catch (error) {
    return apiError(error);
  }
}
