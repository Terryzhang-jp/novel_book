/**
 * Canvas API - 单个项目操作
 *
 * GET /api/canvas/[id] - 获取项目详情
 * PUT /api/canvas/[id] - 更新项目
 * DELETE /api/canvas/[id] - 删除项目
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { canvasStorage, DataValidationError } from "@/lib/storage/canvas-storage";
import type { CanvasSaveRequest } from "@/types/storage";
import { VersionConflictError } from "@/types/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/canvas/[id]
 * 获取项目详情
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;
    const { id } = await params;

    const project = await canvasStorage.findById(id);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // 验证权限
    if (project.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Canvas get error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get project" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/canvas/[id]
 * 更新项目
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;
    const { id } = await params;

    const body: Partial<CanvasSaveRequest> = await req.json();

    const project = await canvasStorage.update(id, userId, body);

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Canvas update error:", error);

    // 版本冲突错误 - 返回 409 和服务器最新数据
    if (error instanceof VersionConflictError) {
      const latestProject = await canvasStorage.findById((await params).id);
      return NextResponse.json(
        {
          error: "Version conflict",
          code: "VERSION_CONFLICT",
          serverVersion: error.serverVersion,
          clientVersion: error.clientVersion,
          latestProject,
        },
        { status: 409 }
      );
    }

    // 数据验证错误 - 返回 400
    if (error instanceof DataValidationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      if (error.message.includes("permission") || error.message.includes("Unauthorized")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/canvas/[id]
 * 删除项目
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;
    const { id } = await params;

    await canvasStorage.delete(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Canvas delete error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      if (error.message.includes("permission") || error.message.includes("Unauthorized")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete project" },
      { status: 500 }
    );
  }
}
