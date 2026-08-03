/**
 * 旧 Gallery 的单张照片 —— 已经完全走新路径（Phase 3A / 16B + 16C）
 *
 * `[id]` 现在是 **Asset 的 id**，不是 photos 表的主键。旧页面拿到的 id
 * 来自 `/api/photos` 的列表，而那个列表已经是 Asset 的投影，所以两边
 * 自洽 —— 没有任何一处需要在两种 id 之间翻译。
 *
 * ## 四个动作分别落到哪
 *
 *   GET     getAssetDetail  → 投影成旧 Photo 形状
 *   DELETE  deleteAsset     → **软删除**（引用它的 Moment 留占位，A7）
 *   PUT dateTime   applyMetadataCorrection('captured_local_at')
 *   PUT description  410 —— 这个能力不在素材上，见下面
 */

import { NextResponse } from 'next/server';
import {
  applyMetadataCorrection,
  deleteAsset,
  getAssetDetail,
} from '@tc/application';
import { apiError, requireApiActor } from '@/lib/core/api';
import { getCore } from '@/lib/core/context';
import { projectOne, projectAsset } from '@/lib/legacy/photo-compat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  try {
    const { id } = await params;
    const detail = await getAssetDetail(getCore(), guard.actor, id);
    // 别人的素材在 getAssetDetail 里就变成 NotFoundError 了 ——
    // 授权在那条带 user_id 的 SQL 上，不在这里再判一次。
    return NextResponse.json({ photo: projectOne(detail) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * PUT /api/photos/[id]
 *
 * ## dateTime → 一次元数据修正，不是就地覆盖
 *
 * 旧实现是 `UPDATE photos SET metadata = ...`：原始 EXIF 时间被改掉之后
 * 再也找不回来，而且下一次自动推断会把用户改的值再覆盖回去 ——
 * 系统分不清「这个值是用户定的」和「这个值是上次推断的」。
 *
 * 新模型里原值不可变（触发器 T-4 强制），修正是一条 append-only 的链，
 * 每一版都带着 source。所以「用户改过的时间不会被推断覆盖」（C-5）
 * 是模型层面成立的，不依赖调用顺序。
 *
 * 收到的是**墙上时间**（`2026-08-03T14:35:00`）。不给它补时区 ——
 * 用户在这个界面上只说了「几点」，没说「哪个时区的几点」（ADR-009）。
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  try {
    const { id } = await params;
    const body = (await req.json()) as { dateTime?: unknown; description?: unknown };

    if (body.description !== undefined) {
      // Asset 上没有 description，而且**不打算加**（ADR-008）：
      // 一旦素材能带说明文字，产品中心就从「体验」滑回「照片墙 + 配文」。
      // 那段文字属于 Moment 的观察或理解。
      return NextResponse.json(
        {
          error:
            '素材本身不再保存说明文字。把它写进对应的 Moment —— ' +
            '照片是证据，说明属于那段体验。',
          code: 'CAPABILITY_MOVED',
        },
        { status: 410 }
      );
    }

    if (typeof body.dateTime === 'string' && body.dateTime.trim() !== '') {
      const detail = await applyMetadataCorrection(getCore(), guard.actor, id, {
        field: 'captured_local_at',
        // 去掉可能带来的 Z / ±HH:MM 后缀：这个界面收集的是墙上时间。
        // 保留后缀等于让 UI 顺手替用户声明了时区。
        value: body.dateTime.trim().replace(/(Z|[+-]\d{2}:?\d{2})$/, ''),
        source: 'user',
      });
      return NextResponse.json({ photo: projectOne(detail) });
    }

    return NextResponse.json(
      { error: 'No valid fields to update', code: 'INVALID_INPUT' },
      { status: 400 }
    );
  } catch (error) {
    return apiError(error);
  }
}

/**
 * DELETE /api/photos/[id]
 *
 * **软删除。** 引用这份素材的 Moment 保留关系行，界面显示「这里原本有
 * 一份素材」—— 和 Work 的墓碑同一个道理：记录里不出现无法解释的空洞。
 *
 * 字节不在这里删。已发布的 Publication 引用的是派生副本，完全不受影响。
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiActor();
  if (guard.response) return guard.response;

  try {
    const { id } = await params;
    const asset = await deleteAsset(getCore(), guard.actor, id);
    return NextResponse.json({ success: true, photo: projectAsset(asset) });
  } catch (error) {
    return apiError(error);
  }
}
