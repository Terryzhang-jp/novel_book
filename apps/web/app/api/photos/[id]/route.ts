import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";
import { NotFoundError, UnauthorizedError } from "@/lib/storage/errors";

export const runtime = "nodejs";

/**
 * GET /api/photos/[id] - 获取单个照片详情
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const { id: photoId } = await params;

    // 获取照片
    const photo = await photoStorage.findById(photoId);

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // 权限检查：只能访问自己的照片
    if (photo.userId !== session.userId) {
      return NextResponse.json(
        { error: "You don't have permission to access this photo" },
        { status: 403 }
      );
    }

    return NextResponse.json({ photo });
  } catch (error) {
    console.error("Get photo error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get photo" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/photos/[id] - 删除照片
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const { id: photoId } = await params;

    // 删除照片（包括文件和元数据）
    await photoStorage.delete(photoId, session.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete photo error:", error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "You don't have permission to delete this photo" },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete photo" },
      { status: 500 }
    );
  }
}
