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
import { APIError } from "better-auth/api";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { accountStatusExplanation, canAuthenticate, isPersistedAccountStatus } from "@tc/domain";

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

/**
 * 建立 session 前的账号状态检查 —— ADR-007 实现要求 2
 *
 * ## 为什么必须在这一层
 *
 * 「停用账号」的动作会删掉该用户的全部 session 行。但那只是把**已经发出去的**
 * 钥匙收回来，挡不住他再走一次登录流程重新拿一把 —— 邮箱密码还是对的，
 * Better Auth 也没有理由拒绝。
 *
 * 所以拦截点必须在「即将写入 session 行」的那一刻。这个钩子对
 * 邮箱密码登录、Google OAuth、以及将来任何新增的登录方式**一视同仁**，
 * 因为它们最后都要落到同一张表上。写在各个登录端点里就会漏掉新的那个。
 *
 * ## 为什么直接查库而不是读 session.user
 *
 * 这个钩子拿到的是即将写入的 session 记录，只有 userId。
 * 而且状态必须现读 —— 用任何缓存过的值都会重新打开那个五分钟的窗口。
 */
async function assertAccountCanAuthenticate(userId: string): Promise<void> {
  const { rows } = await pool.query<{ status: string }>(
    'SELECT status FROM "user" WHERE id = $1',
    [userId]
  );
  const status = rows[0]?.status;

  // 行不见了（已被永久删除），或状态是代码不认识的值 —— 两种都不放行。
  // 「读不懂就放行」在认证代码里是最贵的默认值。
  if (!status || !isPersistedAccountStatus(status)) {
    throw new APIError("UNAUTHORIZED", { message: "账号不可用。" });
  }
  if (!canAuthenticate(status)) {
    throw new APIError("FORBIDDEN", { message: accountStatusExplanation(status) });
  }
}

export const auth = betterAuth({
  // 数据库配置
  database: pool,

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          await assertAccountCanAuthenticate(session.userId);
        },
      },
    },
  },

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
    // ⚠️ status / deletion_* 这几列**故意不声明**为 additionalFields。
    //
    // 声明了，Better Auth 就会在 updateUser 之类的路径上把它读进来再写回去 ——
    // 一次普通的「改个昵称」就可能用请求发起时的旧值覆盖掉刚刚写入的
    // 'disabled'。账号状态只有 AccountRepository 一个写入方（ADR-007），
    // 认证框架只负责读（上面那个 databaseHooks 直接查库）。
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
