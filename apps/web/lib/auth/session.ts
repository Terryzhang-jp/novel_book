import { signToken, verifyToken, getTokenFromRequest } from "./jwt";
import { UnauthorizedError } from "../storage/errors";
import type { JWTPayload } from "@/types/storage";

/**
 * 创建用户 session（生成 JWT token）
 */
export async function createSession(
  userId: string,
  email: string
): Promise<string> {
  const token = await signToken({ userId, email });
  return token;
}

/**
 * 从请求中获取当前用户 session
 */
export async function getSession(
  request: Request
): Promise<JWTPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    const payload = await verifyToken(token);
    return payload;
  } catch {
    return null;
  }
}

/**
 * 要求用户必须登录（middleware 用）
 * 如果未登录，抛出 UnauthorizedError
 */
export async function requireAuth(request: Request): Promise<JWTPayload> {
  const session = await getSession(request);
  if (!session) {
    throw new UnauthorizedError("Please login to continue");
  }
  return session;
}
