import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "@/types/storage";

// JWT 密钥（从环境变量获取）
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);

/**
 * 生成 JWT token
 */
export async function signToken(payload: JWTPayload): Promise<string> {
  const token = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // 7天过期
    .sign(secret);

  return token;
}

/**
 * 验证并解析 JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as JWTPayload;
  } catch (error) {
    throw new Error("Invalid token");
  }
}

/**
 * 从请求中获取 token
 */
export function getTokenFromRequest(request: Request): string | null {
  // 从 Cookie 中获取
  const cookie = request.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(/auth-token=([^;]+)/);
    if (match) {
      return match[1];
    }
  }

  // 从 Authorization header 获取
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}
