/**
 * Forgot Password API
 *
 * GET /api/auth/forgot-password?email=xxx - 获取用户的安全问题
 * POST /api/auth/forgot-password - 验证安全问题并重置密码
 */

import { NextResponse } from "next/server";
import { userStorage } from "@/lib/storage/user-storage";
import { StorageError } from "@/lib/storage/errors";

/**
 * GET - 获取用户的安全问题
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const result = await userStorage.getSecurityQuestion(email);

    if (!result) {
      // 为了安全，不透露用户是否存在或是否设置了安全问题
      return NextResponse.json(
        { error: "No security question found for this email" },
        { status: 404 }
      );
    }

    return NextResponse.json({ question: result.question });
  } catch (error) {
    console.error("Get security question error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST - 验证安全问题答案并重置密码
 */
export async function POST(request: Request) {
  try {
    const { email, securityAnswer, newPassword } = await request.json();

    // 验证输入
    if (!email || !securityAnswer || !newPassword) {
      return NextResponse.json(
        { error: "Email, security answer, and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // 验证并重置密码
    await userStorage.resetPasswordWithSecurityAnswer(
      email,
      securityAnswer,
      newPassword
    );

    return NextResponse.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
