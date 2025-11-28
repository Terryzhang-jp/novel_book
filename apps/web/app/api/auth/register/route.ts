import { NextResponse } from "next/server";
import { userStorage } from "@/lib/storage/user-storage";
import { createSession } from "@/lib/auth/session";
import { StorageError } from "@/lib/storage/errors";
import { initializeStorage } from "@/lib/storage/init";

export async function POST(request: Request) {
  try {
    // 确保存储已初始化
    await initializeStorage();

    const { email, password, name, securityQuestion, securityAnswer } = await request.json();

    // 验证安全问题（必填）
    if (!securityQuestion || !securityAnswer) {
      return NextResponse.json(
        { error: "Security question and answer are required" },
        { status: 400 }
      );
    }

    // 创建用户（包含安全问题）
    const user = await userStorage.create(email, password, name, securityQuestion, securityAnswer);

    // 生成 JWT token
    const token = await createSession(user.id, user.email);

    // 返回响应并设置 cookie
    const response = NextResponse.json({
      success: true,
      user,
    });

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
