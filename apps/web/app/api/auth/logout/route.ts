import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });

  // 删除 auth-token cookie
  response.cookies.delete("auth-token");

  return response;
}
