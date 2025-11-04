import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { userStorage } from "@/lib/storage/user-storage";
import { photoStorage } from "@/lib/storage/photo-storage";
import { locationStorage } from "@/lib/storage/location-storage";
import { documentStorage } from "@/lib/storage/document-storage";

export const runtime = "nodejs";

/**
 * GET /api/profile - 获取当前用户的完整个人资料
 */
export async function GET(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    // 获取用户信息
    const user = await userStorage.findById(session.userId);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 获取照片统计
    const photoStats = await photoStorage.getStats(session.userId);

    // 获取所有地点（用于统计）
    const locations = await locationStorage.findByUserId(session.userId);

    // 获取所有文档（用于统计）
    const documents = await documentStorage.findByUserId(session.userId);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      stats: {
        photos: photoStats,
        locations: locations.length,
        documents: documents.length,
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);

    // 处理认证错误
    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
