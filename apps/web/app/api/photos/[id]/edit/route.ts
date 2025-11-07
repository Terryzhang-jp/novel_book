import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";

export const runtime = "nodejs";

/**
 * POST /api/photos/[id]/edit - 编辑照片（保存编辑后的版本）
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // 验证文件类型（仅允许图片）
    const validImageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
    ];

    if (!validImageTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    // 验证文件大小（最大 10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    // 替换照片文件
    const updatedPhoto = await photoStorage.replacePhoto(
      id,
      session.userId,
      file
    );

    // 返回更新后的照片信息
    return NextResponse.json({
      id: updatedPhoto.id,
      fileName: updatedPhoto.fileName,
      fileUrl: updatedPhoto.fileUrl,
      originalFileUrl: updatedPhoto.originalFileUrl,
      edited: updatedPhoto.edited,
      editedAt: updatedPhoto.editedAt,
      metadata: updatedPhoto.metadata,
      updatedAt: updatedPhoto.updatedAt,
    });
  } catch (error) {
    console.error("Photo edit error:", error);

    // 处理认证错误
    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // 处理权限错误
    if (error instanceof Error && error.message.includes("permission")) {
      return NextResponse.json(
        { error: "You don't have permission to edit this photo" },
        { status: 403 }
      );
    }

    // 处理照片不存在错误
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json(
        { error: "Photo not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to edit photo" },
      { status: 500 }
    );
  }
}
