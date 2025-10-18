import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";
import type { PhotoCategory } from "@/types/storage";

export const runtime = "nodejs";

/**
 * POST /api/photos - 上传照片
 */
export async function POST(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
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

    // 创建照片记录（包括 EXIF 提取和文件保存）
    const photo = await photoStorage.create(session.userId, file);

    // 返回照片信息
    return NextResponse.json({
      id: photo.id,
      fileName: photo.fileName,
      category: photo.category,
      metadata: photo.metadata,
      url: `/images/${session.userId}/gallery/${photo.fileName}`,
      createdAt: photo.createdAt,
    });
  } catch (error) {
    console.error("Photo upload error:", error);

    // 处理认证错误
    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/photos - 获取照片列表
 * Query params:
 *   - category?: PhotoCategory (可选：按分类过滤)
 */
export async function GET(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") as PhotoCategory | null;

    // 获取照片列表
    let photos;
    if (category) {
      photos = await photoStorage.findByCategory(session.userId, category);
    } else {
      photos = await photoStorage.findByUserId(session.userId);
    }

    // 获取统计信息
    const stats = await photoStorage.getStats(session.userId);

    return NextResponse.json({
      photos,
      stats,
      userId: session.userId,
    });
  } catch (error) {
    console.error("Get photos error:", error);

    // 处理认证错误
    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get photos" },
      { status: 500 }
    );
  }
}
