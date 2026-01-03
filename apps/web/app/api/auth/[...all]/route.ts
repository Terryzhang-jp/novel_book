/**
 * Better Auth API Handler
 *
 * 处理所有 /api/auth/* 请求：
 * - /api/auth/sign-in/email
 * - /api/auth/sign-up/email
 * - /api/auth/sign-out
 * - /api/auth/sign-in/social (Google)
 * - /api/auth/callback/google
 * - /api/auth/get-session
 * - etc.
 */

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
