# Supabase Setup Guide

## ✅ 已完成

1. ✅ 安装 `@supabase/supabase-js`
2. ✅ 配置 `.env.local`
3. ✅ 创建 Supabase client 工具
4. ✅ 设计数据库表结构

## 📋 下一步操作

### Step 1: 创建数据库表

打开 Supabase Dashboard：
1. 进入你的项目：https://supabase.com/dashboard/project/nncrmixivirswjmkprpf
2. 点击左侧菜单 **SQL Editor**
3. 点击 **New query**
4. 复制 `supabase/migrations/001_initial_schema.sql` 的内容
5. 粘贴到 SQL Editor
6. 点击 **Run** 执行

### Step 2: 创建 Storage Bucket

在 Supabase Dashboard：
1. 点击左侧菜单 **Storage**
2. 点击 **Create a new bucket**
3. 配置：
   - Name: `photos`
   - Public: ✅ (勾选)
   - File size limit: `10 MB`
   - Allowed MIME types: `image/jpeg, image/png, image/gif, image/webp`
4. 点击 **Create bucket**

### Step 3: 设置 Storage Policies

创建 bucket 后，点击 bucket → Policies → New Policy：

**Policy 1: 用户可以上传自己的照片**
```sql
CREATE POLICY "Users can upload own photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

**Policy 2: 所有人可以查看公开照片**
```sql
CREATE POLICY "Public photos are viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'photos');
```

**Policy 3: 用户可以删除自己的照片**
```sql
CREATE POLICY "Users can delete own photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Step 4: 测试连接

运行测试脚本：
```bash
node scripts/test-supabase-connection.js
```

## 📁 文件结构

```
apps/web/
├── lib/
│   └── supabase/
│       ├── client.ts      # 浏览器端 client
│       ├── server.ts      # 服务端 client
│       ├── admin.ts       # Admin client (service role)
│       └── storage.ts     # Storage 辅助函数
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── README.md (本文件)
└── .env.local             # 环境变量配置
```

## 🔑 环境变量说明

```bash
# 公开变量（前端可访问）
NEXT_PUBLIC_SUPABASE_URL=https://nncrmixivirswjmkprpf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...

# 私密变量（仅服务端）
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # ⚠️ 绕过 RLS
SUPABASE_DB_PASSWORD=...              # ⚠️ 直接访问数据库
```

## 🚀 使用示例

### 浏览器端（Client Component）

```typescript
import { supabase } from '@/lib/supabase/client';

// 查询数据
const { data, error } = await supabase
  .from('photos')
  .select('*')
  .eq('user_id', userId);
```

### API Route（Server）

```typescript
import { supabase } from '@/lib/supabase/server';

// 插入数据
const { data, error } = await supabase
  .from('documents')
  .insert({
    user_id: userId,
    title: 'My Document',
    content: {}
  });
```

### Admin 操作（绕过 RLS）

```typescript
import { supabaseAdmin } from '@/lib/supabase/admin';

// 管理员操作（绕过权限检查）
const { data, error } = await supabaseAdmin
  .from('users')
  .select('*');
```

### 文件上传

```typescript
import { uploadFile, getPublicUrl } from '@/lib/supabase/storage';

// 上传照片
const uploadData = await uploadFile(
  'photos',
  `${userId}/gallery/${fileName}`,
  fileBuffer,
  { contentType: 'image/jpeg' }
);

// 获取公开 URL
const publicUrl = getPublicUrl('photos', `${userId}/gallery/${fileName}`);
```

## 📊 数据库表结构

### users
- id, email, password_hash, name, profile (JSONB)
- 用户基本信息

### documents
- id, user_id, title, content (JSONB), tags, is_public
- 用户文档（Novel 编辑器内容）

### photos
- id, user_id, file_url, metadata (JSONB), category, is_public
- 照片元数据和 EXIF 信息

### locations
- id, user_id, name, coordinates (JSONB), usage_count
- 地点库

## 🔒 安全说明

### Row Level Security (RLS)

所有表都启用了 RLS，规则：
- ✅ 用户只能访问自己的数据
- ✅ 公开内容（is_public=true）所有人可见
- ✅ anon key 受 RLS 保护
- ⚠️ service_role key 绕过 RLS（仅在必要时使用）

### Storage 安全

- ✅ 用户只能上传到自己的文件夹：`photos/{userId}/`
- ✅ 所有人可以读取公开照片
- ✅ 用户只能删除自己的文件

## 🛠️ 下一步开发任务

1. [ ] 执行数据库迁移（Step 1-3）
2. [ ] 测试 Supabase 连接
3. [ ] 迁移现有照片到 Supabase Storage
4. [ ] 修改 photo-storage.ts 使用 Supabase
5. [ ] 修改 document-storage.ts 使用 Supabase
6. [ ] 修改认证系统使用 Supabase Auth（可选）
7. [ ] 部署到 Vercel

## 📚 参考文档

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Storage](https://supabase.com/docs/guides/storage)
- [Next.js Integration](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
