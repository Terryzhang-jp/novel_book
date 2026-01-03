/**
 * Better Auth Helper Functions
 *
 * 提供服务端获取 session 的辅助函数
 * 用于替代旧的 requireAuth 和 getSession
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// 兼容旧代码的 session 类型
export interface SessionPayload {
  userId: string;
  email: string;
  name?: string | null;
  requirePasswordChange?: boolean;
}

/**
 * 在 Server Component 中获取当前 session
 */
export async function getServerSession() {
  const headersList = await headers();
  return await auth.api.getSession({
    headers: headersList,
  });
}

/**
 * 在 Server Component 中要求用户必须登录
 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    requirePasswordChange: (session.user as any).requirePasswordChange,
  };
}

/**
 * 从 Request 对象获取 session（用于 API Route）
 */
export async function getSessionFromRequest(request: Request) {
  return await auth.api.getSession({
    headers: request.headers,
  });
}

/**
 * 在 API Route 中要求用户必须登录
 * 返回兼容旧代码的 session 格式
 */
export async function requireAuthFromRequest(request: Request): Promise<SessionPayload> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new Error("Unauthorized");
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    requirePasswordChange: (session.user as any).requirePasswordChange,
  };
}
