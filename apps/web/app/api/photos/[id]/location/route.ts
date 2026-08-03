/**
 * 给素材关联地点 —— **暂时关闭**（Phase 3A / 16D，等 Phase 3B）
 *
 * 旧实现写的是 `photos.location_id`，而 photos 表已经冻结为只读（16D），
 * 而且旧 Gallery 现在显示的是 Asset —— 这里收到的 id 根本不在 photos 表里。
 *
 * ## 为什么不顺手接到 Asset 上
 *
 * 因为「地点」在新模型里还不存在，而它**不是**一个可以顺手补的字段：
 *
 *   原始 GPS 不可覆盖        相机记的坐标是原始元数据的一部分（T-4 不可变）
 *   用户修正单独存           走 asset_metadata_corrections 的 gps 字段，
 *                            append-only，能说清「这个值是谁定的」
 *   地点库是另一个概念       「东京站」是一个有名字、可复用的实体，
 *                            和「35.68, 139.76」不是一回事
 *
 * 现在给 Asset 加一个 `locationId` 外键，等于在 Place 的语义定下来之前
 * 先把它的形状钉死 —— 那正是 ADR-000 要避免的「让旧产品结构反向决定
 * 新核心设计」。这件事是 Phase 3B。
 *
 * ## 已经能用的那一半
 *
 * 单纯改坐标不用等 Place：`PUT /api/photos/[id]` 走的是元数据修正链，
 * 用户改过的值不会被后续推断覆盖（C-5）。缺的是「地点库」，不是「坐标」。
 *
 * 410 而不是 404：这个端点曾经存在过，客户端有权知道它是被撤销的。
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GONE = {
  error:
    '地点库还没有迁到新核心（Phase 3B）。' +
    '原始 GPS 是素材的不可变元数据，用户修正走单独的修正链——' +
    '在这两件事的语义定下来之前，不给素材接一个临时的 locationId。',
  code: 'CAPABILITY_PENDING',
} as const;

export function PUT() {
  return NextResponse.json(GONE, { status: 410 });
}

export function DELETE() {
  return NextResponse.json(GONE, { status: 410 });
}
