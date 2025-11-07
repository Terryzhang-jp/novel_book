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
      url: photo.fileUrl,
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
 *   - limit?: number (可选：每页数量，默认50)
 *   - offset?: number (可选：偏移量，默认0)
 */
export async function GET(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);
    console.log("[GET /api/photos] User authenticated:", session.userId);

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") as PhotoCategory | null;
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const offset = Number.parseInt(searchParams.get("offset") || "0", 10);
    const sortOrder = searchParams.get("sortOrder") as 'newest' | 'oldest' | null;

    console.log("[GET /api/photos] Query params:", { category, limit, offset, sortOrder });

    // 分页选项（包含排序方式）
    const paginationOptions = {
      limit,
      offset,
      sortOrder: sortOrder || 'newest'
    };

    // 获取照片列表（现在返回完整Photo[]，包含fileUrl）
    let photos;
    if (category) {
      photos = await photoStorage.findByCategory(session.userId, category, paginationOptions);
    } else {
      photos = await photoStorage.findByUserId(session.userId, paginationOptions);
    }
    console.log("[GET /api/photos] Found photos:", photos.length);

    // Debug: Log photos with location data
    const photosWithLocation = photos.filter(p => p.metadata?.location);
    console.log("[GET /api/photos] Photos with location field:", photosWithLocation.length);
    if (photosWithLocation.length > 0) {
      console.log("[GET /api/photos] Sample photo with location:", JSON.stringify(photosWithLocation[0]));
    }

    // 获取统计信息
    const stats = await photoStorage.getStats(session.userId);
    console.log("[GET /api/photos] Stats:", JSON.stringify(stats));

    return NextResponse.json({
      photos,
      stats,
      userId: session.userId,
    });
  } catch (error) {
    console.error("[GET /api/photos] Error occurred:", error);
    console.error("[GET /api/photos] Error stack:", error instanceof Error ? error.stack : "No stack");

    // 处理认证错误
    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get photos", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
