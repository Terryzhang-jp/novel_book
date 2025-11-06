import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";
import { NotFoundError, UnauthorizedError } from "@/lib/storage/errors";

export const runtime = "nodejs";

/**
 * POST /api/photos/trash/[id] - 从回收站恢复照片
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req);
    const { id: photoId } = await params;

    await photoStorage.restore(photoId, session.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Restore photo error:", error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "You don't have permission to restore this photo" },
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
      { error: "Failed to restore photo" },
      { status: 500 }
    );
  }
}
