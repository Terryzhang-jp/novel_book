-- Migration: Add Security Question to Users Table
-- 用于密码找回功能
--
-- 运行方式：在 Supabase SQL Editor 中执行此脚本

-- 添加安全问题和答案字段
ALTER TABLE users
ADD COLUMN IF NOT EXISTS security_question TEXT,
ADD COLUMN IF NOT EXISTS security_answer_hash TEXT;

-- 创建索引（可选，用于快速查询有安全问题的用户）
CREATE INDEX IF NOT EXISTS idx_users_has_security_question
ON users ((security_question IS NOT NULL));

-- 添加注释
COMMENT ON COLUMN users.security_question IS 'Security question for password recovery';
COMMENT ON COLUMN users.security_answer_hash IS 'Hashed answer to security question (bcrypt)';

-- 完成
SELECT 'Security question columns added successfully!' as result;
