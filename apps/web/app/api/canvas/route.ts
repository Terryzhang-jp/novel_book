/**
 * Canvas API - 项目列表和创建（无限画布版本）
 *
 * GET /api/canvas - 获取用户的所有 Canvas 项目
 * POST /api/canvas - 创建新的 Canvas 项目
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { canvasStorage } from "@/lib/storage/canvas-storage";
import type { CanvasSaveRequest } from "@/types/storage";

/**
 * GET /api/canvas
 * 获取用户的所有 Canvas 项目列表
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;

    const projects = await canvasStorage.findByUserId(userId);

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Canvas list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get projects" },
      { status: error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500 }
    );
  }
}

/**
 * POST /api/canvas
 * 创建新的 Canvas 项目
 */
export async function POST(req: Request) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;

    const body: CanvasSaveRequest = await req.json();

    const project = await canvasStorage.create(userId, body);

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Canvas create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
