# Better Auth 迁移计划

> **状态: ✅ 迁移完成** - 2024年12月19日
>
> 已完成：
> - [x] 配置环境变量 (DATABASE_URL, BETTER_AUTH_SECRET)
> - [x] 在 Supabase 执行 SQL 迁移
> - [x] 运行用户数据迁移脚本 (12 用户已迁移)
>
> 待配置（可选）：
> - [ ] Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)

## 概述

将现有自定义认证系统迁移到 Better Auth，并添加 Google OAuth 登录支持。

**迁移目标：**
- 替换自定义 JWT 认证为 Better Auth
- 保留现有用户数据（无缝迁移）
- 添加 Google 登录
- 保留安全问题找回密码功能
- 保留 requirePasswordChange 强制修改密码功能

---

## 第一步：安装和基础配置

### 1.1 安装依赖

```bash
pnpm add better-auth
```

### 1.2 环境变量配置

在 `.env.local` 添加：

```env
# Better Auth
BETTER_AUTH_SECRET=<生成的32+字符密钥>
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=<Google Cloud Console 获取>
GOOGLE_CLIENT_SECRET=<Google Cloud Console 获取>
```

### 1.3 创建 Better Auth 配置

创建 `lib/auth.ts`：
- 配置数据库连接（使用现有 Supabase）
- 启用 Email/Password 认证
- 配置 Google OAuth
- 使用 bcrypt 保持密码兼容
- 扩展 user 表字段（requirePasswordChange, securityQuestion 等）

### 1.4 创建客户端实例

创建 `lib/auth-client.ts`：
- 导出 signIn, signUp, signOut, useSession 等

### 1.5 创建 API 路由

创建 `app/api/auth/[...all]/route.ts`：
- 使用 toNextJsHandler 处理所有认证请求

---

## 第二步：数据库准备

### 2.1 创建 Better Auth 表

运行 CLI 生成表结构：

```bash
npx @better-auth/cli generate
npx @better-auth/cli migrate
```

或手动在 Supabase 创建：
- `user` 表
- `session` 表
- `account` 表
- `verification` 表

### 2.2 表结构

```sql
-- user 表
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- 自定义扩展字段
  require_password_change BOOLEAN DEFAULT FALSE,
  security_question TEXT,
  security_answer_hash TEXT
);

-- session 表
CREATE TABLE "session" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- account 表
CREATE TABLE "account" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope TEXT,
  id_token TEXT,
  password TEXT,  -- bcrypt hash 存这里
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- verification 表
CREATE TABLE "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 第三步：用户数据迁移

### 3.1 迁移脚本

创建 `scripts/migrate-users-to-better-auth.ts`：

```typescript
// 伪代码
for (const oldUser of existingUsers) {
  // 1. 插入 user 表
  await insertUser({
    id: oldUser.id,
    email: oldUser.email,
    name: oldUser.name,
    emailVerified: true,
    requirePasswordChange: oldUser.require_password_change,
    securityQuestion: oldUser.security_question,
    securityAnswerHash: oldUser.security_answer_hash,
  });

  // 2. 插入 account 表（密码凭证）
  await insertAccount({
    userId: oldUser.id,
    providerId: 'credential',
    accountId: oldUser.email,
    password: oldUser.password_hash, // bcrypt 直接迁移
  });
}
```

### 3.2 运行迁移

```bash
npx tsx scripts/migrate-users-to-better-auth.ts
```

---

## 第四步：更新认证核心

### 4.1 删除旧文件

```
lib/auth/jwt.ts       → 删除
lib/auth/session.ts   → 删除
```

### 4.2 更新/删除 API 路由

| 路由 | 操作 |
|------|------|
| `api/auth/login/route.ts` | 删除（Better Auth 处理） |
| `api/auth/register/route.ts` | 删除（Better Auth 处理） |
| `api/auth/logout/route.ts` | 删除（Better Auth 处理） |
| `api/auth/change-password/route.ts` | 保留，更新 session 获取方式 |
| `api/auth/forgot-password/route.ts` | 保留（安全问题自定义功能） |

### 4.3 创建 session 辅助函数

创建 `lib/auth/helpers.ts`：

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function getServerSession() {
  return await auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireAuth() {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
```

---

## 第五步：更新受保护 API 路由

### 5.1 更新模式

所有使用 `requireAuth` 的路由需更新：

```typescript
// 旧代码
import { requireAuth } from "@/lib/auth/session";
const session = await requireAuth(req);
const userId = session.userId;

// 新代码
import { auth } from "@/lib/auth";
const session = await auth.api.getSession({ headers: req.headers });
if (!session) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const userId = session.user.id;
```

### 5.2 需更新的文件列表

**Documents 模块：**
- [ ] `app/api/documents/route.ts`
- [ ] `app/api/documents/[id]/route.ts`
- [ ] `app/api/documents/generate/route.ts`

**Photos 模块：**
- [ ] `app/api/photos/route.ts`
- [ ] `app/api/photos/[id]/route.ts`
- [ ] `app/api/photos/stats/route.ts`
- [ ] `app/api/photos/batch-location/route.ts`
- [ ] `app/api/photos/embeddings/route.ts`
- [ ] `app/api/photos/[id]/edit/route.ts`
- [ ] `app/api/photos/[id]/location/route.ts`
- [ ] `app/api/photos/[id]/optimized/route.ts`

**Photos Trash 模块：**
- [ ] `app/api/photos/trash/route.ts`
- [ ] `app/api/photos/trash/[id]/route.ts`
- [ ] `app/api/photos/trash/empty/route.ts`

**Canvas 模块：**
- [ ] `app/api/canvas/route.ts`
- [ ] `app/api/canvas/[id]/route.ts`
- [ ] `app/api/canvas/default/route.ts`

**Locations 模块：**
- [ ] `app/api/locations/route.ts`
- [ ] `app/api/locations/[id]/route.ts`

**AI Magic 模块：**
- [ ] `app/api/ai-magic/optimize/route.ts`
- [ ] `app/api/ai-magic/generate/route.ts`
- [ ] `app/api/ai-magic/history/route.ts`

**其他：**
- [ ] `app/api/upload-local/route.ts`
- [ ] `app/api/profile/route.ts`
- [ ] `app/api/writing-partner/route.ts`

---

## 第六步：更新中间件

### 6.1 新 middleware.ts

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  // ... 保护路由逻辑
  // ... requirePasswordChange 重定向逻辑
}
```

---

## 第七步：更新前端页面

### 7.1 登录页面 `app/login/page.tsx`

```typescript
// 旧代码
const response = await fetch("/api/auth/login", { ... });

// 新代码
import { authClient } from "@/lib/auth-client";

// Email/Password 登录
await authClient.signIn.email({ email, password });

// Google 登录
await authClient.signIn.social({ provider: "google" });
```

### 7.2 注册页面 `app/register/page.tsx`

```typescript
// 旧代码
const response = await fetch("/api/auth/register", { ... });

// 新代码
await authClient.signUp.email({
  email,
  password,
  name,
  // 自定义字段通过单独 API 处理
});
```

### 7.3 登出按钮

```typescript
// 旧代码
await fetch("/api/auth/logout", { method: "POST" });

// 新代码
await authClient.signOut();
```

### 7.4 需更新的页面列表

- [ ] `app/login/page.tsx` - 添加 Google 登录按钮
- [ ] `app/register/page.tsx` - 使用 authClient.signUp
- [ ] `app/change-password/page.tsx` - 更新 API 调用
- [ ] `app/forgot-password/page.tsx` - 保留（安全问题）
- [ ] `app/profile/page.tsx` - 更新密码修改调用
- [ ] `components/logout-button.tsx` - 使用 authClient.signOut
- [ ] `components/layout/sidebar.tsx` - 使用 authClient.signOut

---

## 第八步：保留自定义功能

### 8.1 安全问题找回密码

保留现有实现：
- `app/api/auth/forgot-password/route.ts` - 不变
- `lib/storage/user-storage.ts` 中相关方法 - 更新为操作新表

### 8.2 requirePasswordChange 强制修改密码

在中间件中检查 user 表的 `require_password_change` 字段：

```typescript
if (session.user.requirePasswordChange && pathname !== "/change-password") {
  return NextResponse.redirect(new URL("/change-password", request.url));
}
```

### 8.3 修改密码 API

更新 `app/api/auth/change-password/route.ts`：
- 使用 Better Auth session
- 更新 account 表中的 password 字段

---

## 第九步：测试清单

### 9.1 认证功能

- [ ] Email/Password 注册
- [ ] Email/Password 登录
- [ ] Google OAuth 登录
- [ ] 登出
- [ ] Session 持久化
- [ ] Session 过期处理

### 9.2 密码功能

- [ ] 修改密码（常规）
- [ ] 强制修改密码（首次登录）
- [ ] 安全问题找回密码

### 9.3 受保护路由

- [ ] 未登录访问受保护页面 → 重定向登录
- [ ] 登录后访问登录页 → 重定向首页
- [ ] API 路由认证正常

### 9.4 数据迁移

- [ ] 现有用户可正常登录（密码兼容）
- [ ] 用户数据完整迁移

---

## 第十步：清理和上线

### 10.1 删除旧代码

```
lib/auth/jwt.ts
lib/auth/session.ts
app/api/auth/login/route.ts
app/api/auth/register/route.ts
app/api/auth/logout/route.ts
```

### 10.2 更新类型定义

更新 `types/storage.ts`：
- 移除 `JWTPayload` 类型
- 更新 `User` 类型以匹配新表结构

### 10.3 备份旧 users 表

```sql
CREATE TABLE users_backup AS SELECT * FROM users;
```

### 10.4 上线检查

- [ ] 环境变量已配置
- [ ] Google OAuth 已在 Google Cloud Console 配置
- [ ] 数据库表已创建
- [ ] 用户数据已迁移
- [ ] 所有测试通过

---

## 回滚计划

如果迁移失败，可以：

1. 恢复旧的 `lib/auth/` 文件
2. 恢复旧的 API 路由
3. 恢复旧的 middleware.ts
4. 从 `users_backup` 恢复数据

---

## 时间线

| 阶段 | 内容 |
|------|------|
| Step 1-2 | 安装配置 + 数据库准备 |
| Step 3 | 用户数据迁移 |
| Step 4-5 | 更新认证核心 + API 路由 |
| Step 6-7 | 更新中间件 + 前端 |
| Step 8 | 自定义功能适配 |
| Step 9-10 | 测试 + 清理上线 |
