/**
 * 从回收站取回 —— 已经完全走新路径（Phase 3A / 16B）
 *
 * 和「重传一份已删除的素材」是同一个 `restore`：清 `deleted_at`，不新建行。
 * 两个入口一个语义 —— 各写一份实现的话，其中一条路迟早会忘记清某个字段。
 */

import { NextResponse } from 'next/server';
import { restoreAsset } from '@tc/application';
import { apiError, requireApiActor } from '@/lib/core/api';
import { getCore } from '@/lib/core/context';
import { projectAsset } from '@/lib/legacy/photo-compat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  try {
    const { id } = await params;
    const asset = await restoreAsset(getCore(), guard.actor, id);
    return NextResponse.json({ success: true, photo: projectAsset(asset) });
  } catch (error) {
    return apiError(error);
  }
}
