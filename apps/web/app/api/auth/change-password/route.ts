import { NextResponse } from "next/server";
import { requireAuth, createSession } from "@/lib/auth/session";
import { userStorage } from "@/lib/storage/user-storage";
import { ValidationError } from "@/lib/storage/errors";

/**
 * POST /api/auth/change-password
 * 修改用户密码
 *
 * 支持两种模式:
 * 1. 强制修改密码（首次登录）: { newPassword, force: true }
 * 2. 常规修改密码: { currentPassword, newPassword }
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth(request);
    const { currentPassword, newPassword, force } = await request.json();

    // 验证新密码
    if (!newPassword) {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 }
      );
    }

    if (force) {
      // 强制修改密码模式（首次登录）
      await userStorage.forceChangePassword(session.userId, newPassword);
    } else {
      // 常规修改密码模式
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      await userStorage.changePassword(
        session.userId,
        currentPassword,
        newPassword
      );
    }

    // 重新生成token（更新requirePasswordChange状态为false）
    const newToken = await createSession(session.userId, session.email, false);

    const response = NextResponse.json({
      success: true,
      message: "Password changed successfully"
    });

    // 更新cookie
    response.cookies.set("auth-token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
