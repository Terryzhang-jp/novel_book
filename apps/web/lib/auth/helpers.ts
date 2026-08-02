/**
 * Better Auth Helper Functions
 *
 * 提供服务端获取 session 的辅助函数
 * 用于替代旧的 requireAuth 和 getSession
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * 未认证。
 *
 * 用类型化错误而不是靠比对 message 字符串 —— 后者在这个项目里已经出过事：
 * 13 个 API 路由的 catch 块判断的是 "Please login to continue"，而
 * requireAuth 实际抛的是 "Unauthorized"，于是**所有需要登录的接口在未登录
 * 时都返回 500 而不是 401**。E2E 测试第一次跑就抓到了它。
 *
 * 字符串匹配的问题在于：改一处消息不会有任何编译错误或警告，
 * 但会静默地让一整类错误处理失效。
 */
export class AuthRequiredError extends Error {
  readonly code = "UNAUTHORIZED" as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** 判断一个未知错误是否是「未认证」。API 路由的 catch 块用它。 */
export function isAuthRequiredError(error: unknown): boolean {
  if (error instanceof AuthRequiredError) return true;
  // 兼容历史抛法：旧代码里散落着裸 Error("Unauthorized")
  return (
    error instanceof Error &&
    (error.message === "Unauthorized" || error.message === "Please login to continue")
  );
}

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
    throw new AuthRequiredError();
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
    throw new AuthRequiredError();
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    requirePasswordChange: (session.user as any).requirePasswordChange,
  };
}
