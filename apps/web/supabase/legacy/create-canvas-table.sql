-- Canvas Projects Table
-- 用于存储用户的画布/手账项目数据
--
-- 运行方式：在 Supabase SQL Editor 中执行此脚本

-- 创建 canvas_projects 表
CREATE TABLE IF NOT EXISTS canvas_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Canvas',

    -- 画布数据
    current_page INTEGER NOT NULL DEFAULT 1,
    pages JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- 缩略图
    thumbnail_url TEXT,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_canvas_projects_user_id ON canvas_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_projects_updated_at ON canvas_projects(updated_at DESC);

-- 启用 RLS
ALTER TABLE canvas_projects ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能访问自己的项目
-- 注意：这些策略使用 auth.uid()::text = user_id::text 与现有表保持一致
CREATE POLICY "Users can view own canvas projects"
    ON canvas_projects FOR SELECT
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own canvas projects"
    ON canvas_projects FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own canvas projects"
    ON canvas_projects FOR UPDATE
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own canvas projects"
    ON canvas_projects FOR DELETE
    USING (auth.uid()::text = user_id::text);

-- 如果使用 service_role key（Admin 客户端），需要添加策略
-- 这允许 API 使用 Admin 客户端操作数据
CREATE POLICY "Service role full access"
    ON canvas_projects
    USING (true)
    WITH CHECK (true);

-- 创建 Storage bucket（如果不存在）
-- 注意：这需要在 Supabase Dashboard 中手动创建，或使用 Supabase CLI
-- Bucket 名称: canvas-images
-- 设置为公开读取，私有写入

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_canvas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER canvas_projects_updated_at
    BEFORE UPDATE ON canvas_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_canvas_updated_at();

-- 授予权限（针对 anon 和 authenticated 角色）
GRANT ALL ON canvas_projects TO anon, authenticated;

-- 完成
COMMENT ON TABLE canvas_projects IS 'Canvas/Journal projects for users';
