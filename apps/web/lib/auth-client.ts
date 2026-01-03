/**
 * Better Auth Client
 *
 * 客户端认证工具，用于：
 * - 登录/注册
 * - Google OAuth
 * - 登出
 * - 获取当前 session
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

// 导出常用方法
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
