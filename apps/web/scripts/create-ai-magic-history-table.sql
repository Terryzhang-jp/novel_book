-- AI Magic History Table
-- 用于存储 AI Magic 生成的历史记录
--
-- 运行方式：在 Supabase SQL Editor 中执行此脚本

-- 创建 ai_magic_history 表
CREATE TABLE IF NOT EXISTS ai_magic_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 用户输入
    user_prompt TEXT NOT NULL,
    input_image_count INTEGER NOT NULL DEFAULT 0,
    style_image_count INTEGER NOT NULL DEFAULT 0,

    -- 优化结果
    optimized_prompt TEXT NOT NULL,
    reasoning TEXT,

    -- 输出（存储 base64 data URL）
    result_image TEXT NOT NULL,

    -- 元数据
    model TEXT NOT NULL,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_magic_history_user_id ON ai_magic_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_magic_history_created_at ON ai_magic_history(created_at DESC);

-- 启用 RLS
ALTER TABLE ai_magic_history ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能访问自己的历史记录
CREATE POLICY "Users can view own ai magic history"
    ON ai_magic_history FOR SELECT
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own ai magic history"
    ON ai_magic_history FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own ai magic history"
    ON ai_magic_history FOR DELETE
    USING (auth.uid()::text = user_id::text);

-- Service role 全权限（API 使用 Admin 客户端）
CREATE POLICY "Service role full access on ai_magic_history"
    ON ai_magic_history
    USING (true)
    WITH CHECK (true);

-- 授予权限
GRANT ALL ON ai_magic_history TO anon, authenticated;

-- 完成
COMMENT ON TABLE ai_magic_history IS 'AI Magic generation history for users';
COMMENT ON COLUMN ai_magic_history.result_image IS 'Generated image as base64 data URL';
