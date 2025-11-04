import { NextResponse } from "next/server";
import { userStorage } from "@/lib/storage/user-storage";
import { createSession } from "@/lib/auth/session";
import { initializeStorage } from "@/lib/storage/init";

export async function POST(request: Request) {
  try {
    // 确保存储已初始化
    await initializeStorage();

    const { email, password } = await request.json();

    // 验证用户密码
    const user = await userStorage.verifyPassword(email, password);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // 生成 JWT token (包含 requirePasswordChange 状态)
    const token = await createSession(user.id, user.email, user.requirePasswordChange);

    // 返回响应并设置 cookie
    const response = NextResponse.json({
      success: true,
      requirePasswordChange: user.requirePasswordChange,
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
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
