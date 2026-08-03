/**
 * 图片编辑器的保存 —— 已经完全走新路径（Phase 3A / 16B）
 *
 * ## 从「替换」变成「派生」
 *
 * 旧实现叫 `replacePhoto()`，做的事是：把编辑后的字节覆盖上去，把旧 URL
 * 挪进 `original_file_url`。**编辑第二次，第一版就永久消失了** ——
 * 那一列只有一个格子。
 *
 * 新模型里加工产生**新的 Asset**，用 `derivedFromAssetId` 指回来源
 * （ADR-008 A1）。原件的字节、sha256、原始元数据一律不动，触发器 T-4
 * 强制这一点。于是「编辑三次之后想找回第一版」在模型层面就是成立的，
 * 不依赖任何备份策略。
 *
 * 代价是每次编辑多占一份空间。这是刻意的取舍：素材是证据，
 * 而一份会被后续操作悄悄改写的证据不算证据。
 */

import { NextResponse } from 'next/server';
import { uploadAsset } from '@tc/application';
import { rateLimit } from '@/lib/api/guard';
import { apiError, requireApiActor } from '@/lib/core/api';
import { getCore } from '@/lib/core/context';
import { getMediaProbe, getStorageKit } from '@/lib/core/storage';
import { projectAsset } from '@/lib/legacy/photo-compat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  const userId = guard.actor.type === 'user' ? guard.actor.userId : 'anonymous';
  const limited = rateLimit(`photo-edit:${userId}`, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { id: sourceId } = await params;

    // 先确认来源素材真的属于调用者。
    //
    // 不做这一步的话，任何人都能拿别人的 assetId 当 derivedFromAssetId，
    // 于是自己的素材上会挂着一条指向别人素材的血缘边 —— 数据库的外键
    // 挡不住，因为那个 id 确实存在。
    const source = await getCore().assets.findById(guard.actor, sourceId);
    if (!source) {
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: 'No file provided', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const { asset, deduplicated } = await uploadAsset(
      { core: getCore(), storage: getStorageKit(), probe: getMediaProbe() },
      guard.actor,
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        declaredMimeType: file.type || 'application/octet-stream',
        derivedFromAssetId: source.id,
      }
    );

    const photo = projectAsset(asset);
    return NextResponse.json({
      // ⚠️ 这是**新素材的 id**，不是请求路径里那个。
      // 旧编辑页保存后直接跳回 /gallery，不使用这个值；将来要在编辑页
      // 原地刷新的话，必须用这个 id，用 URL 里那个会一直显示编辑前的版本。
      id: photo.id,
      sourceId: source.id,
      fileName: photo.fileName,
      fileUrl: photo.fileUrl,
      originalFileUrl: photo.originalFileUrl,
      edited: photo.edited,
      metadata: photo.metadata,
      updatedAt: photo.updatedAt,
      /** true = 编辑没有改变任何像素，得到的还是原来那一份 */
      deduplicated,
    });
  } catch (error) {
    return apiError(error);
  }
}
