# 数据库基线 — 从零重建的唯一可信顺序

> 2026-08-02 · 由 `scripts/verify-schema-rebuild.sh` 实测验证

## 背景

审计（PERFORMANCE-AUDIT.md Q14 / 第八组 #14）指出：真实 schema 只存在于
生产 Supabase 实例里，仓库无法从零重建数据库。

后来确认更糟：**那个 Supabase 项目已被删除**（`nncrmixivirswjmkprpf`
DNS NXDOMAIN）。所以已经没有「参照物」可以对比，仓库里这 15 个 `.sql`
就是 schema 仅存的全部记录。

## 实测结论

**按文件名顺序执行会失败。** 在一个空的 Postgres 17 上实测：

| 执行方式 | 结果 |
|---|---|
| 只跑 `supabase/migrations/00*.sql`（按文件名排序） | **3 个失败** |
| 按下方推导出的顺序跑全部 15 个（含平台垫片） | **15 个全部成功** |

### 三个失败原因

1. **`001` / `002` — `schema "auth" does not exist`**
   RLS 策略用了 Supabase 的 `auth.uid()`。这是平台特有的，在原生 Postgres
   上不存在。**不是缺陷**，但意味着 schema 不可在原生 Postgres 上直接测试。

2. **`007_add_canvas_magazine_columns.sql` — `relation "canvas_projects" does not exist`**
   **这是真正的缺陷。** `canvas_projects` 表由 `scripts/create-canvas-table.sql`
   创建，而那个文件不在 `supabase/migrations/` 里、也没有编号。所以编号
   migration 依赖了一个未编号的临时脚本，光看 `migrations/` 目录永远推不出
   正确顺序。

3. **`create-canvas-table.sql` / `create-ai-magic-history-table.sql` — `role "anon" does not exist`**
   末尾的 `GRANT ... TO anon` 用了 Supabase 平台角色。同 #1，不是缺陷。

## 唯一正确的执行顺序

```
# 0. 平台垫片（仅在原生 Postgres 上需要；Supabase 上跳过）
   CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid ...;
   CREATE ROLE anon / authenticated / service_role;

# 1. 核心 schema
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_add_location_sharing.sql
   supabase/migrations/003_add_require_password_change.sql
   supabase/migrations/004_add_trash_fields.sql
   supabase/migrations/005_add_photo_edit_fields.sql
   supabase/migrations/006_add_photo_embeddings.sql

# 2. ⚠️ 必须插在 007 之前 —— 它创建 007 要 ALTER 的表
   scripts/create-canvas-table.sql

   supabase/migrations/007_add_canvas_magazine_columns.sql
   supabase/migrations/008_add_photo_thumbnail.sql

# 3. 散落在 scripts/ 里的后续变更
   scripts/create-ai-magic-history-table.sql
   scripts/add-ai-partner-memory.sql
   scripts/add-canvas-version-column.sql
   scripts/add-security-question.sql
   scripts/remove-decorations-column.sql

# 4. Better Auth 四件套
   scripts/migrations/001_better_auth_tables.sql
```

## 重建结果

```
11 张表   50 个索引   26 条 RLS 策略

account  ai_magic_history  canvas_projects  documents  locations
photo_embeddings  photos  session  user  users  verification
```

注意 `user`（Better Auth，TEXT 主键）和 `users`（业务，UUID 主键）
两张用户表并存 —— 这是已知的架构隐患，见 ARCHITECTURE.md 第四组 #23。

## 怎么复现这次验证

```bash
cd apps/web
./scripts/verify-schema-rebuild.sh          # 需要本地 Postgres
```

脚本会建一个一次性数据库、按上述顺序执行、打印表/索引/策略数、然后删库。

## ⚠️ 这份基线的局限

**它只能证明「这 15 个文件能建出一个自洽的 schema」，不能证明「它和已删除
的生产库结构相同」。** 那个参照物已经没了。

因此：这里重建出来的 schema 应当被视为 **旧系统的最后已知状态**，用于让
`apps/web` 重新跑起来、以及作为 Phase 2 新领域模型的迁移起点 —— 而不是
「已验证与生产一致」的权威副本。
