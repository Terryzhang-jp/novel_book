/**
 * Forgot Password API (Better Auth 版本)
 *
 * GET /api/auth/forgot-password?email=xxx - 获取用户的安全问题
 * POST /api/auth/forgot-password - 验证安全问题并重置密码
 *
 * 注意: 这是自定义功能，不使用 Better Auth 内置的密码重置
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import bcrypt from "bcryptjs";

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

    // 从 Better Auth user 表获取安全问题
    const { data: user, error } = await supabaseAdmin
      .from("user")
      .select("security_question")
      .eq("email", email)
      .single();

    if (error || !user || !user.security_question) {
      // 为了安全，不透露用户是否存在或是否设置了安全问题
      return NextResponse.json(
        { error: "Unable to verify this email address" },
        { status: 404 }
      );
    }

    return NextResponse.json({ question: user.security_question });
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

    // 获取用户及其安全问题答案
    const { data: user, error: userError } = await supabaseAdmin
      .from("user")
      .select("id, security_answer_hash")
      .eq("email", email)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (!user.security_answer_hash) {
      return NextResponse.json(
        { error: "No security question set for this account" },
        { status: 400 }
      );
    }

    // 验证安全问题答案（转小写并去除空格）
    const isValid = await bcrypt.compare(
      securityAnswer.toLowerCase().trim(),
      user.security_answer_hash
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Security answer is incorrect" },
        { status: 400 }
      );
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 更新 account 表中的密码
    const { error: updateError } = await supabaseAdmin
      .from("account")
      .update({ password: newPasswordHash })
      .eq("user_id", user.id)
      .eq("provider_id", "credential");

    if (updateError) {
      throw new Error(`Failed to update password: ${updateError.message}`);
    }

    // 确保 require_password_change 为 false
    await supabaseAdmin
      .from("user")
      .update({ require_password_change: false })
      .eq("id", user.id);

    return NextResponse.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
