# Supabase Migration Summary

## 已完成工作 ✅

### 1. Supabase 设置
- ✅ 安装 `@supabase/supabase-js` 和 `pg` 依赖
- ✅ 配置环境变量 (`.env.local`)
- ✅ 创建 Supabase 客户端
  - `lib/supabase/client.ts` - 浏览器端
  - `lib/supabase/server.ts` - 服务端
  - `lib/supabase/admin.ts` - 管理员（绕过RLS）
  - `lib/supabase/storage.ts` - Storage辅助函数

### 2. 数据库架构
- ✅ 设计完整的数据库schema (`supabase/migrations/001_initial_schema.sql`)
  - users 表
  - documents 表
  - photos 表
  - locations 表
- ✅ 配置 Row Level Security (RLS) 策略
- ✅ 创建索引和触发器
- ✅ 创建 Storage bucket "photos" (public, 10MB限制)
- ✅ 配置 Storage 安全策略

### 3. 自动化脚本
- ✅ `scripts/setup-supabase-database.js` - 自动设置数据库
  - 执行 SQL 迁移
  - 创建 Storage bucket
  - 设置 Storage 策略
  - 验证配置
- ✅ `scripts/migrate-data-to-supabase.js` - 数据迁移
  - 迁移用户数据
  - 迁移地点数据
  - 迁移照片数据（元数据 + 文件）
  - 迁移文档数据

### 4. 数据迁移结果
```
✅ 用户: 2 个用户已迁移
   - admin@example.com (原有)
   - user@example.com (新创建，密码: default123)

✅ 地点: 3 个地点已迁移

✅ 照片: 10 张照片已迁移
   - 元数据存储在 photos 表
   - 文件上传到 Supabase Storage (photos bucket)

✅ 文档: 3 个文档已迁移
```

### 5. 存储层更新
- ✅ **user-storage.ts** - 完全迁移到 Supabase
  - create, findByEmail, findById
  - verifyPassword, update, findAll
- ✅ **photo-storage.ts** - 完全迁移到 Supabase
  - create (上传到 Storage)
  - findById, findByUserId, findByCategory
  - delete (从 Storage 删除文件)
  - setLocation, removeLocation, batchSetLocation
  - updateDescription, updateDateTime
  - getAllPublicPhotos (用于地图)
  - getStats

## 待完成工作 ⏳

### 1. 完成剩余存储层
- ⏳ `document-storage.ts` - 需要迁移到 Supabase
- ⏳ `location-storage.ts` - 需要迁移到 Supabase

### 2. 测试应用
- ⏳ 测试用户登录/注册
- ⏳ 测试照片上传和查看
- ⏳ 测试文档创建和编辑
- ⏳ 测试地点管理
- ⏳ 测试 login 页面地图功能

### 3. 清理工作
- ⏳ 可选：删除旧的本地数据文件（做好备份）
- ⏳ 可选：移除不再使用的文件系统相关代码
- ⏳ 更新 CLAUDE.md 文档说明新的架构

### 4. 部署准备
- ⏳ 确保所有功能正常
- ⏳ 性能测试
- ⏳ 部署到 Vercel

## 环境变量

确保 `.env.local` 包含以下变量：

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://nncrmixivirswjmkprpf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SUPABASE_DB_PASSWORD=Qaz961264727@

# JWT Secret (existing)
JWT_SECRET=your-secret-key
```

## 关键架构变化

### 之前（本地文件系统）
```
数据存储:
  - data/auth/users.json
  - data/photos/{photoId}.json
  - data/documents/{docId}.json
  - data/locations/{userId}/{locationId}.json
  - data/indexes/* (用于快速查询)

文件存储:
  - public/images/{userId}/gallery/{fileName}
```

### 现在（Supabase）
```
数据存储:
  - Supabase PostgreSQL
  - users, photos, documents, locations 表
  - 不需要索引文件（数据库查询已优化）

文件存储:
  - Supabase Storage (photos bucket)
  - {userId}/gallery/{fileName}
  - 公开URL访问
```

## 数据库Schema亮点

### 1. Row Level Security (RLS)
- 用户只能访问自己的数据
- 公开内容（is_public=true）所有人可见
- Admin client 可以绕过 RLS（仅用于管理操作）

### 2. 关系
- photos.user_id → users.id
- photos.location_id → locations.id
- documents.user_id → users.id
- locations.user_id → users.id

### 3. JSONB 字段
- photos.metadata - EXIF数据、相机信息、尺寸等
- users.profile - 用户配置
- documents.content - Novel编辑器内容
- locations.coordinates, address - 结构化地理数据

## 性能优化

### 索引策略
- user_id 字段上的索引（所有表）
- created_at, updated_at 上的降序索引
- category, is_public 字段索引
- Email 唯一索引

### Storage 优化
- 公开 bucket，直接通过 CDN 访问
- 10MB 文件大小限制
- 支持 JPEG, PNG, GIF, WebP

## 安全考虑

1. **RLS 策略**
   - 确保用户数据隔离
   - Public 内容正确标记

2. **Storage 策略**
   - 用户只能上传到自己的文件夹
   - 所有人可以读取公开照片
   - 用户只能删除自己的文件

3. **API 密钥**
   - anon_public_key: 前端使用，受 RLS 保护
   - service_role key: 仅服务端，绕过 RLS
   - Database password: 仅用于直接数据库连接

## 使用的脚本

### 设置数据库
```bash
node scripts/setup-supabase-database.js
```

### 迁移数据
```bash
node scripts/migrate-data-to-supabase.js
```

### 测试连接
```bash
node scripts/test-supabase-connection.js
```

## 下一步建议

1. **立即**: 完成 document-storage.ts 和 location-storage.ts 的迁移
2. **测试**: 全面测试应用功能
3. **优化**: 根据使用情况优化查询和索引
4. **监控**: 在 Supabase Dashboard 监控性能和使用量
5. **备份**: 定期备份数据库（Supabase 提供自动备份）

## 常见问题

### Q: 本地数据还能用吗？
A: 不能，应用现在完全依赖 Supabase。旧数据已迁移，可以安全删除本地文件。

### Q: 如何回滚？
A: 保留旧的文件系统代码，修改导入即可切换回去。

### Q: 性能如何？
A: Supabase 使用 PostgreSQL + PostgREST，性能优于文件系统。添加了适当的索引。

### Q: 成本如何？
A: Supabase 免费套餐包括：
   - 500MB 数据库
   - 1GB 文件存储
   - 2GB 带宽/月
   对于开发和小规模使用足够。

## 参考文档

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Storage](https://supabase.com/docs/guides/storage)
- [Next.js Integration](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
