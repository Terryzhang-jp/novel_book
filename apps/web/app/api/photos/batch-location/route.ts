/**
 * 批量关联地点 —— **暂时关闭**（Phase 3A / 16D，等 Phase 3B）
 *
 * 和单张版本 `/api/photos/[id]/location` 同一个理由：地点在新模型里还不
 * 存在，而它不是一个可以顺手补的字段（原始 GPS 不可覆盖、用户修正走
 * append-only 的修正链、地点库是另一个概念）。完整说明在那个文件里。
 *
 * 批量版本单独说一句：它原来一次能改几百行 `photos.location_id`。
 * 在 photos 表被冻结之后，这正是最不该留一条侥幸路径的地方。
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function POST() {
  return NextResponse.json(
    {
      error:
        '地点库还没有迁到新核心（Phase 3B）。' +
        '在 Place 的语义定下来之前，不给素材接一个临时的 locationId。',
      code: 'CAPABILITY_PENDING',
    },
    { status: 410 }
  );
}
