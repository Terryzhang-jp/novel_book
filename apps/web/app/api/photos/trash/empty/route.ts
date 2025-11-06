import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";

export const runtime = "nodejs";

/**
 * DELETE /api/photos/trash/empty - 清空回收站（永久删除所有回收站照片）
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireAuth(req);

    await photoStorage.emptyTrash(session.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Empty trash error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to empty trash" },
      { status: 500 }
    );
  }
}
