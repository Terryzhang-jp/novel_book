import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";

export const runtime = "nodejs";

/**
 * GET /api/photos/stats - 获取照片统计信息
 */
export async function GET(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    // 获取统计信息
    const stats = await photoStorage.getStats(session.userId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Get photo stats error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get photo statistics" },
      { status: 500 }
    );
  }
}
