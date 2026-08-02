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

/**
 * 不传 baseURL —— Better Auth 会用当前页面的 origin。
 *
 * 原来写的是 `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"`，
 * 有两个问题：
 *
 * 1. NEXT_PUBLIC_* 是**构建期内联**的，不是运行时读取。所以同一个构建
 *    产物只能服务于构建时指定的那一个域名 —— 换域名、Vercel preview
 *    部署、E2E 用别的端口，客户端都会去调错误的 origin。
 *    E2E 第一次跑就撞上了：浏览器报 ERR_CONNECTION_REFUSED，
 *    因为它在调 build 时烘进去的地址。
 *
 * 2. 回退值 "http://localhost:3000" 在生产环境是个静默的错误来源 ——
 *    变量忘了配时不会报错，只会让所有认证请求打到本地。
 *
 * 用当前 origin 是对的：认证接口和页面本来就同源。
 * 服务端的 baseURL 仍在 lib/auth.ts 里配置（那边是运行时读取，没问题）。
 */
export const authClient = createAuthClient();

// 导出常用方法
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
