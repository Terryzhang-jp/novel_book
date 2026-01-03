import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import bcrypt from "bcryptjs";

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
    // 使用 Better Auth 获取 session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword, force } = await request.json();

    // 验证新密码
    if (!newPassword) {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // 获取用户的 credential account
    const { data: account, error: accountError } = await supabaseAdmin
      .from("account")
      .select("id, password")
      .eq("user_id", userId)
      .eq("provider_id", "credential")
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    if (force) {
      // 强制修改密码模式（首次登录）- 不验证旧密码
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // 更新 account 表中的密码
      await supabaseAdmin
        .from("account")
        .update({ password: newPasswordHash })
        .eq("id", account.id);

      // 更新 user 表中的 require_password_change 为 false
      await supabaseAdmin
        .from("user")
        .update({ require_password_change: false })
        .eq("id", userId);
    } else {
      // 常规修改密码模式 - 需要验证旧密码
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      // 验证当前密码
      if (!account.password) {
        return NextResponse.json(
          { error: "No password set for this account" },
          { status: 400 }
        );
      }

      const isValid = await bcrypt.compare(currentPassword, account.password);
      if (!isValid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      // 更新密码
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await supabaseAdmin
        .from("account")
        .update({ password: newPasswordHash })
        .eq("id", account.id);

      // 确保 require_password_change 为 false
      await supabaseAdmin
        .from("user")
        .update({ require_password_change: false })
        .eq("id", userId);
    }

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
