/**
 * Canvas Default API
 *
 * GET /api/canvas/default - 获取或创建用户的默认 Canvas 项目
 *
 * 这个 API 用于 Canvas 页面首次加载时：
 * - 如果用户有项目，返回最近的一个
 * - 如果用户没有项目，自动创建一个默认项目
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { canvasStorage } from "@/lib/storage/canvas-storage";

/**
 * GET /api/canvas/default
 * 获取或创建默认项目
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;

    const project = await canvasStorage.getOrCreateDefault(userId);

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Canvas default error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get default project" },
      { status: error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500 }
    );
  }
}
