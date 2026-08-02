/**
 * Better Auth Configuration
 *
 * 服务端认证配置，包含：
 * - Email/Password 认证
 * - Google OAuth
 * - 自定义用户字段（requirePasswordChange, securityQuestion）
 * - bcrypt 密码兼容（与旧系统兼容）
 */

import { betterAuth } from "better-auth";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// 创建 PostgreSQL 连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * 暴露连接池，仅供集成测试在结束时关闭它。
 *
 * 不导出的话，测试删除临时数据库时触发的 pg_terminate_backend 会让这个池
 * 抛出未捕获的 "terminating connection due to administrator command"，
 * 污染测试输出并可能造成误报。
 *
 * 应用代码不应该使用它 —— Better Auth 自己管理生命周期。
 */
export const authDbPool = pool;

export const auth = betterAuth({
  // 数据库配置
  database: pool,

  // 基础 URL
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

  // 密钥
  secret: process.env.BETTER_AUTH_SECRET,

  // Email/Password 认证
  emailAndPassword: {
    enabled: true,
    // 使用 bcrypt 保持与旧系统兼容
    password: {
      hash: async (password: string) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ password, hash }: { password: string; hash: string }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },

  // Google OAuth
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },

  // Session 配置 - 包含时效和字段映射
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
    modelName: "session",
    fields: {
      userId: "user_id",
      token: "token",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // User 表配置 - 使用 snake_case 字段映射
  user: {
    modelName: "user",
    fields: {
      name: "name",
      email: "email",
      emailVerified: "email_verified",
      image: "image",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      requirePasswordChange: {
        type: "boolean",
        defaultValue: false,
        input: false,
        fieldName: "require_password_change",
      },
      securityQuestion: {
        type: "string",
        required: false,
        input: false,
        fieldName: "security_question",
      },
      securityAnswerHash: {
        type: "string",
        required: false,
        input: false,
        fieldName: "security_answer_hash",
      },
    },
  },

  // Account 表配置 - 使用 snake_case 字段映射
  account: {
    modelName: "account",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      scope: "scope",
      idToken: "id_token",
      password: "password",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // Verification 表配置 - 使用 snake_case 字段映射
  verification: {
    modelName: "verification",
    fields: {
      identifier: "identifier",
      value: "value",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // 高级配置
  advanced: {
    // 使用 camelCase 字段名
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  // 信任的来源
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "https://novel-rouge-xi.vercel.app",
    "https://novel-terryzhang-jps-projects.vercel.app",
    "http://localhost:3002",
    "http://localhost:3001",
    "http://localhost:3000",
  ],
});

// 导出类型
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
