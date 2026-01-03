/**
 * Session Management (Better Auth 兼容层)
 *
 * 这个文件提供向后兼容的接口
 * 内部使用 Better Auth 实现
 *
 * @deprecated 请直接使用 @/lib/auth/helpers
 */

import { requireAuthFromRequest, type SessionPayload } from "./helpers";

// 重新导出类型以保持兼容
export type { SessionPayload as JWTPayload };

/**
 * 要求用户必须登录（兼容旧 API）
 * @deprecated 请使用 requireAuthFromRequest from "@/lib/auth/helpers"
 */
export async function requireAuth(request: Request): Promise<SessionPayload> {
  return requireAuthFromRequest(request);
}

/**
 * 创建 session（已废弃，Better Auth 自动处理）
 * @deprecated Better Auth 自动管理 session
 */
export async function createSession(
  _userId: string,
  _email: string,
  _requirePasswordChange?: boolean
): Promise<string> {
  console.warn("createSession is deprecated. Better Auth manages sessions automatically.");
  return "";
}

/**
 * 获取 session（已废弃）
 * @deprecated 请使用 getSessionFromRequest from "@/lib/auth/helpers"
 */
export async function getSession(_request: Request) {
  console.warn("getSession is deprecated. Use getSessionFromRequest from @/lib/auth/helpers");
  return null;
}
