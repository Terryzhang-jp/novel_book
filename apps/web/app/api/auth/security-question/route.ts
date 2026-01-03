/**
 * Security Question API
 *
 * POST /api/auth/security-question - 设置/更新安全问题
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    // 获取当前用户 session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { securityQuestion, securityAnswerHash } = await request.json();

    if (!securityQuestion || !securityAnswerHash) {
      return NextResponse.json(
        { error: "Security question and answer are required" },
        { status: 400 }
      );
    }

    // 更新用户的安全问题
    const { error } = await supabaseAdmin
      .from("user")
      .update({
        security_question: securityQuestion,
        security_answer_hash: securityAnswerHash,
      })
      .eq("id", session.user.id);

    if (error) {
      throw new Error(`Failed to update security question: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: "Security question updated successfully",
    });
  } catch (error) {
    console.error("Security question update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
