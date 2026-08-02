-- Better Auth Tables Migration
-- 运行方式: 在 Supabase SQL Editor 中执行此脚本
--
-- 注意: 此脚本会创建 Better Auth 所需的核心表
-- 在运行用户迁移脚本之前，请先执行此 SQL

-- =============================================
-- 1. User 表 (用户信息)
-- =============================================
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 自定义扩展字段 (从旧系统迁移)
  require_password_change BOOLEAN DEFAULT FALSE,
  security_question TEXT,
  security_answer_hash TEXT
);

-- 为 email 创建索引
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);

-- =============================================
-- 2. Session 表 (用户会话)
-- =============================================
CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为 token 和 user_id 创建索引
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"(user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON "session"(expires_at);

-- =============================================
-- 3. Account 表 (认证凭据 - 密码/OAuth)
-- =============================================
CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMP WITH TIME ZONE,
  refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  id_token TEXT,
  password TEXT,  -- bcrypt hash 存储在这里
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 唯一约束: 同一个 provider 下的 account_id 必须唯一
  UNIQUE(provider_id, account_id)
);

-- 为 user_id 和 provider 创建索引
CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account"(user_id);
CREATE INDEX IF NOT EXISTS idx_account_provider ON "account"(provider_id, account_id);

-- =============================================
-- 4. Verification 表 (验证请求 - 邮箱验证/密码重置)
-- =============================================
CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为 identifier 创建索引
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_expires_at ON "verification"(expires_at);

-- =============================================
-- 5. 更新时间触发器
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 为每个表创建更新触发器
DROP TRIGGER IF EXISTS update_user_updated_at ON "user";
CREATE TRIGGER update_user_updated_at
  BEFORE UPDATE ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_session_updated_at ON "session";
CREATE TRIGGER update_session_updated_at
  BEFORE UPDATE ON "session"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_account_updated_at ON "account";
CREATE TRIGGER update_account_updated_at
  BEFORE UPDATE ON "account"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_verification_updated_at ON "verification";
CREATE TRIGGER update_verification_updated_at
  BEFORE UPDATE ON "verification"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 6. RLS (Row Level Security) - 可选
-- =============================================
-- Better Auth 使用 service_role key 操作，可以绕过 RLS
-- 如果需要启用 RLS，请取消以下注释

-- ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 完成提示
-- =============================================
-- 执行完成后，请运行用户迁移脚本:
-- npx tsx scripts/migrate-users-to-better-auth.ts
