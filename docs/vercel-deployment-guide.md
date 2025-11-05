# Vercel 部署指南

本文档记录了 Novel 项目部署到 Vercel 的完整过程，包括遇到的问题、解决方案以及后续重新部署的注意事项。

## 目录

- [项目概况](#项目概况)
- [部署过程中遇到的问题](#部署过程中遇到的问题)
- [最终成功的配置](#最终成功的配置)
- [首次部署步骤](#首次部署步骤)
- [后续 Redeploy 步骤](#后续-redeploy-步骤)
- [重要注意事项](#重要注意事项)
- [故障排查](#故障排查)

---

## 项目概况

**项目类型**: Turborepo Monorepo
**框架**: Next.js 15.1.4
**包管理器**: pnpm 10.20.0
**数据库**: Supabase (PostgreSQL)
**部署平台**: Vercel

**项目结构**:
```
novel/
├── apps/
│   └── web/              # Next.js 应用
├── packages/
│   └── headless/         # Novel 编辑器核心
├── vercel.json           # Vercel 配置文件
└── pnpm-lock.yaml        # 锁文件
```

---

## 部署过程中遇到的问题

### 问题 1: pnpm Workspace Protocol 不支持

**错误信息**:
```
npm error Unsupported URL Type "workspace:": workspace:^
```

**原因**:
Vercel 的 npm 安装器无法处理 pnpm workspace 协议语法 (`workspace:^`)。

**解决方案**:
从项目根目录部署，而不是从 `apps/web` 子目录部署，让 pnpm 处理 workspace 依赖。

---

### 问题 2: pnpm 版本不匹配导致锁文件过期

**错误信息**:
```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with package.json
Note: 62 dependencies were added to package.json but not to pnpm-lock.yaml
```

**原因**:
本地使用 pnpm 9.5.0 生成的锁文件，但 Vercel 尝试使用 pnpm 9.x（基于项目创建日期自动判断），导致版本不匹配。

**解决方案**:
1. 升级本地 pnpm 到 10.20.0
2. 更新 `package.json` 中的 `packageManager` 字段
3. 重新生成锁文件

```bash
# 使用 corepack 激活 pnpm 10
corepack prepare pnpm@10.20.0 --activate

# 更新 package.json
"packageManager": "pnpm@10.20.0"

# 重新安装依赖
pnpm install
```

---

### 问题 3: Supabase 客户端在构建时初始化失败

**错误信息**:
```
Error: supabaseUrl is required.
    at <unknown> (.next/server/chunks/8139.js:34:41982)
    ...
[Error: Failed to collect page data for /api/auth/login]
```

**原因**:
Supabase admin 客户端在模块加载时立即初始化：

```typescript
// ❌ 错误的方式
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {...});
```

Next.js 在构建阶段收集页面数据时会加载 API 路由模块，但此时环境变量还不可用，导致初始化失败。

**解决方案**:
改用懒加载模式（Lazy Initialization），使用 Proxy 延迟客户端创建：

```typescript
// ✅ 正确的方式
let supabaseAdminInstance: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) {
    return supabaseAdminInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase admin environment variables');
  }

  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseAdminInstance;
}

// 使用 Proxy 保持 API 兼容性
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getSupabaseAdmin();
    const value = client[prop as keyof SupabaseClient];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
```

**关键点**:
- 只在实际访问 `supabaseAdmin` 时才初始化客户端
- 构建阶段不会触发初始化
- 运行时首次访问时才创建实例

---

### 问题 4: @biomejs/biome 版本冲突

**问题**:
根目录 `package.json` 使用 `@biomejs/biome@^1.9.4`，但 `apps/web/package.json` 使用 `@biomejs/biome@^1.7.2`，导致依赖冲突。

**解决方案**:
统一所有工作区的 biome 版本：

```json
// apps/web/package.json
"devDependencies": {
  "@biomejs/biome": "^1.9.4"  // 与根目录版本一致
}
```

---

## 最终成功的配置

### 1. vercel.json（根目录）

```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "apps/web/$1"
    }
  ]
}
```

**说明**:
- 从根目录部署，但指定构建 `apps/web`
- 所有请求路由到 `apps/web` 应用

### 2. package.json（根目录）

```json
{
  "packageManager": "pnpm@10.20.0"
}
```

**说明**:
- 明确指定 pnpm 版本为 10.20.0
- Vercel 会根据此字段使用正确的 pnpm 版本

### 3. 环境变量配置

在 Vercel 项目设置中添加以下环境变量（Production 环境）：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `JWT_SECRET` | JWT 签名密钥（至少 32 字符） | `openssl rand -base64 48` 生成 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 密钥 | `eyJhbGc...` |

**重要**: 环境变量必须在部署前设置好，构建时会检查这些变量是否可用。

---

## 首次部署步骤

### 前置条件

1. 安装 Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. 登录 Vercel:
   ```bash
   vercel login
   ```

3. 确保本地使用 pnpm 10.20.0:
   ```bash
   corepack prepare pnpm@10.20.0 --activate
   pnpm --version  # 应该显示 10.20.0
   ```

### 部署流程

1. **生成 JWT_SECRET**:
   ```bash
   openssl rand -base64 48
   ```
   保存输出的密钥，后续需要添加到 Vercel。

2. **链接 Vercel 项目**（如果还未链接）:
   ```bash
   cd /path/to/novel
   vercel link --yes
   ```

3. **添加环境变量**:
   ```bash
   # 添加 JWT_SECRET
   vercel env add JWT_SECRET production
   # 粘贴步骤 1 生成的密钥

   # 添加 Supabase URL
   vercel env add NEXT_PUBLIC_SUPABASE_URL production
   # 输入你的 Supabase URL

   # 添加 Service Role Key
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   # 输入你的 Service Role Key
   ```

4. **确认 package.json 版本正确**:
   ```bash
   cat package.json | grep packageManager
   # 应该显示: "packageManager": "pnpm@10.20.0"
   ```

5. **提交所有更改**:
   ```bash
   git add -A
   git commit -m "chore: prepare for Vercel deployment"
   ```

6. **部署到生产环境**:
   ```bash
   vercel --prod --yes
   ```

7. **等待构建完成**，部署成功后会显示生产 URL。

---

## 后续 Redeploy 步骤

### 场景 1: 代码更新后重新部署

这是最常见的场景，只需要以下步骤：

```bash
# 1. 确保所有更改已提交
git add -A
git commit -m "feat: your changes"

# 2. 直接部署
vercel --prod --yes
```

**就这么简单！** 环境变量已经配置好，不需要重新设置。

---

### 场景 2: 环境变量需要更新

如果需要修改环境变量（比如更换 Supabase 项目或更新 JWT_SECRET）：

```bash
# 1. 更新环境变量
vercel env rm JWT_SECRET production
vercel env add JWT_SECRET production
# 输入新的密钥

# 2. 重新部署
vercel --prod --yes
```

---

### 场景 3: 依赖包更新后重新部署

如果更新了 `package.json` 中的依赖：

```bash
# 1. 更新依赖
pnpm install

# 2. 提交 lockfile 变化
git add pnpm-lock.yaml
git commit -m "chore: update dependencies"

# 3. 部署
vercel --prod --yes
```

---

### 场景 4: Rollback 到之前的版本

如果新部署有问题，需要回滚：

```bash
# 1. 查看部署历史
vercel ls

# 2. 获取要回滚的部署 URL（比如 novel-abc123.vercel.app）
vercel redeploy <deployment-url> --prod
```

---

## 重要注意事项

### ✅ DO（应该做的事）

1. **始终从项目根目录运行 `vercel` 命令**
   ```bash
   cd /path/to/novel
   vercel --prod
   ```

2. **保持 pnpm 版本一致**
   - 本地开发、CI/CD、Vercel 部署都应使用 pnpm 10.20.0
   - 提交 `package.json` 中的 `packageManager` 字段

3. **提交前确保本地构建成功**
   ```bash
   pnpm build
   ```

4. **懒加载所有需要环境变量的外部服务客户端**
   - Supabase
   - OpenAI
   - 其他第三方 API 客户端

5. **环境变量使用 Vercel CLI 或 Web UI 管理**
   - 不要在代码中硬编码
   - 不要提交 `.env` 文件到 git

6. **验证部署后的功能**
   - 测试登录/注册
   - 测试 API 路由
   - 检查环境变量是否正确加载

---

### ❌ DON'T（不应该做的事）

1. **不要从 `apps/web` 子目录部署**
   ```bash
   cd apps/web
   vercel  # ❌ 会导致 workspace protocol 错误
   ```

2. **不要在模块顶层初始化需要环境变量的客户端**
   ```typescript
   // ❌ 错误
   const client = createClient(process.env.API_KEY!);
   export { client };

   // ✅ 正确
   let client = null;
   export function getClient() {
     if (!client) client = createClient(process.env.API_KEY!);
     return client;
   }
   ```

3. **不要混用 pnpm 版本**
   - 不要在本地用 pnpm 9.x，部署时用 pnpm 10.x

4. **不要忽略 pnpm-lock.yaml 的变化**
   - lockfile 变化应该提交到 git
   - 确保团队成员使用相同的依赖版本

5. **不要跳过构建错误**
   - 如果本地构建失败，部署也会失败
   - 先修复错误再部署

6. **不要在生产环境测试未经验证的更改**
   - 使用 `vercel` (preview) 先测试
   - 确认无误后再用 `vercel --prod`

---

## 故障排查

### 构建失败：Lockfile 过期

**症状**:
```
ERR_PNPM_OUTDATED_LOCKFILE
```

**解决**:
```bash
# 删除旧的 lockfile
rm pnpm-lock.yaml

# 重新生成
pnpm install

# 提交
git add pnpm-lock.yaml
git commit -m "chore: regenerate lockfile"
vercel --prod
```

---

### 构建失败：环境变量未定义

**症状**:
```
Error: supabaseUrl is required.
```

**检查清单**:
1. 确认环境变量已添加到 Vercel:
   ```bash
   vercel env ls production
   ```

2. 检查客户端是否使用懒加载模式

3. 验证环境变量名称拼写正确：
   - `NEXT_PUBLIC_SUPABASE_URL` (注意 `NEXT_PUBLIC_` 前缀)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`

---

### 运行时错误：API 路由 500 错误

**排查步骤**:

1. **查看部署日志**:
   ```bash
   vercel logs <deployment-url> --follow
   ```

2. **检查 Supabase 连接**:
   - 确认 URL 和 Key 正确
   - 测试 Supabase 项目是否可访问

3. **检查数据库表结构**:
   - 确认所有必要的表已创建
   - 检查 RLS (Row Level Security) 策略

---

### 依赖安装失败

**症状**:
```
ERR_PNPM_PEER_DEP_ISSUES
```

**解决**:
```bash
# 检查 peer dependency 警告
pnpm install

# 如果有冲突，更新相关包版本
pnpm update <package-name>

# 提交更改
git add package.json pnpm-lock.yaml
git commit -m "fix: resolve peer dependency conflicts"
```

---

### Monorepo Workspace 依赖问题

**症状**:
```
Cannot find module 'novel'
```

**解决**:
1. 确保 `vercel.json` 配置正确（从根目录部署）
2. 检查 workspace 引用：
   ```json
   "dependencies": {
     "novel": "workspace:^"  // 正确
   }
   ```

---

## 快速参考命令

```bash
# 查看当前部署状态
vercel ls

# 查看环境变量
vercel env ls production

# 查看部署日志
vercel logs <deployment-url>

# 部署 preview 版本（用于测试）
vercel

# 部署到生产环境
vercel --prod --yes

# 回滚到之前的部署
vercel redeploy <deployment-url> --prod

# 查看项目信息
vercel inspect <deployment-url>
```

---

## 成功部署检查清单

部署完成后，验证以下功能：

- [ ] 访问生产 URL，页面正常加载
- [ ] 注册新用户功能正常
- [ ] 登录功能正常
- [ ] JWT token 正确设置在 cookie 中
- [ ] 创建文档功能正常
- [ ] 上传图片功能正常
- [ ] API 路由响应正确（检查 Network 面板）
- [ ] Supabase 数据正确写入
- [ ] 修改密码功能正常（新功能）
- [ ] 查看部署日志，无错误信息

---

## 总结

通过这次部署，我们学到了：

1. **Monorepo 部署策略**: 从根目录部署，使用 `vercel.json` 配置路由
2. **pnpm 版本管理**: 明确指定 `packageManager` 字段，避免版本不匹配
3. **环境变量处理**: 使用懒加载避免构建时访问环境变量
4. **依赖版本管理**: 保持工作区内依赖版本一致

**核心原则**:
- 构建时不应访问运行时环境变量
- 所有服务客户端使用懒加载
- lockfile 必须与 package.json 保持同步
- 本地构建成功是部署成功的前提

---

## 相关资源

- [Vercel CLI 文档](https://vercel.com/docs/cli)
- [Vercel Monorepo 部署](https://vercel.com/docs/deployments/configure-a-build#monorepo)
- [pnpm Workspace](https://pnpm.io/workspaces)
- [Next.js 环境变量](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)

---

**最后更新**: 2025-11-05
**维护者**: Novel Team
