import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";

export const runtime = "nodejs";

/**
 * GET /api/photos/trash - 获取回收站照片列表
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth(req);

    const trashedPhotos = await photoStorage.getTrashedPhotos(session.userId);

    return NextResponse.json({
      photos: trashedPhotos,
      count: trashedPhotos.length,
    });
  } catch (error) {
    console.error("Get trashed photos error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get trashed photos" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/photos/trash - 批量移入回收站
 * Body: { photoIds: string[] }
 */
export async function POST(req: Request) {
  try {
    const session = await requireAuth(req);
    const body = await req.json();

    const { photoIds } = body;

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json(
        { error: "photoIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // 批量移入回收站
    for (const photoId of photoIds) {
      await photoStorage.trash(photoId, session.userId);
    }

    return NextResponse.json({
      success: true,
      count: photoIds.length,
    });
  } catch (error) {
    console.error("Trash photos error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to trash photos" },
      { status: 500 }
    );
  }
}
