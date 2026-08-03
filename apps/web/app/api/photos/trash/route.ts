/**
 * 回收站 —— 已经完全走新路径（Phase 3A / 16B）
 *
 * 「回收站」在新模型里不是一个状态字段，就是 `assets.deleted_at IS NOT NULL`。
 * 软删除（ADR-008 A7）本来就是可逆的：字节还在，引用它的 Moment 也还留着
 * 关系行，界面显示「这里原本有一份素材」。
 *
 * 所以这里没有新概念，只是把同一件事用旧 UI 的词讲一遍。
 */

import { NextResponse } from 'next/server';
import { deleteAsset, listTrashedAssets } from '@tc/application';
import { apiError, requireApiActor } from '@/lib/core/api';
import { getCore } from '@/lib/core/context';
import { projectAsset } from '@/lib/legacy/photo-compat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/photos/trash —— 回收站列表 */
export async function GET() {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  try {
    const trashed = await listTrashedAssets(getCore(), guard.actor, { limit: 500 });
    const photos = trashed.map((asset) => projectAsset(asset));
    return NextResponse.json({ photos, count: photos.length });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * POST /api/photos/trash —— 批量移入回收站
 *
 * 逐个删而不是一条 SQL：软删除本来就是幂等的（deleted_at 保持首次的时间），
 * 而逐个删让每一次都过一遍 `user_id` 条件。批量语句写错一个 WHERE
 * 就是「删掉了别人的素材」，这个风险不值得省那几次往返。
 */
export async function POST(req: Request) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  try {
    const body = (await req.json()) as { photoIds?: unknown };
    const ids = Array.isArray(body.photoIds)
      ? body.photoIds.filter((v): v is string => typeof v === 'string')
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'photoIds must be a non-empty array', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const core = getCore();
    for (const id of ids) {
      await deleteAsset(core, guard.actor, id);
    }
    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    return apiError(error);
  }
}
