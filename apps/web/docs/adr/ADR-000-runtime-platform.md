# ADR-000 · 运行时平台：标准 PostgreSQL，供应商无关

- **状态**：已接受
- **日期**：2026-08-02
- **决策人**：产品负责人
- **影响范围**：Phase 2 起的全部新代码；不追溯修改 `apps/web` 遗留代码

---

## 背景

旧系统的架构依赖 Supabase 平台语义，而不只是把它当托管商：

| 依赖点 | 位置 | 后果 |
|---|---|---|
| `supabase-js` 客户端 | `lib/storage/*` 全部 6 个类 | 所有数据访问经 PostgREST，而非 SQL |
| `auth.uid()` | 26 条 RLS 策略 | 只在 Supabase 上有意义 |
| `service_role` key | `lib/supabase/admin.ts` | 绕过全部 RLS |
| Supabase Storage API | `lib/supabase/storage.ts` | 文件读写绑定平台 |
| 项目 ref 硬编码 | `next.config.js` `remotePatterns` | 换项目要改代码 |

2026 年 8 月，那个 Supabase 项目 `nncrmixivirswjmkprpf` 被删除（DNS NXDOMAIN），
全部数据丢失。应用因此完全无法启动——**连本地开发都不行**，因为
`lib/supabase/client.ts` 在模块顶层就 `createClient()` 并在缺变量时 `throw`。

这暴露了真正的问题：**一个平台实例的消失，让整个系统失去可运行性。**

## 决策

**新核心（Phase 2 起）依赖能力，不依赖供应商。**

```
事实数据库    标准 PostgreSQL（≥15），通过普通 driver 访问
身份          Better Auth（见 ADR-001）
文件          ObjectStorage 接口（见 ADR-002）
授权          应用层显式授权（见 ADR-001）
```

领域层（`packages/domain`）**不得** import 任何以下内容：

```
@supabase/*        任何 Supabase SDK
auth.uid()         或任何 Supabase 特有 SQL 函数
PostgREST 查询构造器
平台特有的 JWT 结构
```

### Supabase 的新定位

它从「架构前提」降级为「部署选项之一」：

| 可以用它做 | 不可以让它决定 |
|---|---|
| 托管 PostgreSQL | 领域模型的形状 |
| 对象存储（作为一个 adapter） | 数据访问方式 |
| 备份、Dashboard、运维 | 身份与授权模型 |
| 生产部署 | 本地开发能否进行 |

### 必须支持的四种运行组合

新核心在这四种组合下都要能跑，且**领域层代码零改动**：

```
① 本地 PostgreSQL + LocalFileStorage        ← 开发与 CI 的默认组合
② PostgreSQL + MinIO                        ← 接近生产的本地验证
③ Supabase Postgres + Supabase Storage      ← 一种生产部署
④ 任意托管 Postgres + S3/R2                 ← 另一种生产部署
```

**①必须无需 Docker。** 这是硬要求：新人 clone 之后应该只靠一个本地
Postgres 就能跑测试。Docker 是可选的（用于 ②），不是入门门槛。

## 后果

### 得到什么

- 平台实例消失不再等于系统消失
- CI 只需要一个 Postgres service container，不需要整套 Supabase 栈
- 数据访问走真实 SQL，可以用 `EXPLAIN` 调优、可以用事务、可以写复杂查询
  （PostgREST 在这三点上都受限）
- 迁移供应商是换一个 adapter，不是重写

### 付出什么

- 要自己写 repository 层，不能直接用 `supabase-js` 的查询构造器
- 要自己管理连接池
- 放弃 Supabase Realtime（当前未使用，无损失）
- 放弃 RLS 作为主要授权机制（见 ADR-001 —— 但它现在本来就是失效的）

### 遗留代码怎么办

**不追溯改造。** `apps/web` 继续用 `supabase-js`，作为「可运行的遗留标本」，
用途是验证哪些能力值得迁移（上传、EXIF、缩略图、Konva、Tiptap）。

新旧的边界是硬的：

```
packages/domain, packages/db     禁止出现 @supabase/*
apps/web                         允许保持现状
```

这条边界用依赖检查脚本强制，不靠自觉。

## 备选方案与否决理由

| 方案 | 否决理由 |
|---|---|
| 继续全面依赖 Supabase | 刚被一个平台实例的消失证明过风险；且 RLS 实际失效，只剩绑定没剩收益 |
| 迁到 Supabase Auth + 真 RLS | 需要重做认证与 OAuth；且把授权正确性押在一个刚证明会消失的平台上 |
| 完全自建（含存储服务） | 过度工程。对象存储是成熟商品，没必要自己写 |

## 验收

- [ ] `packages/domain` 的 `package.json` dependencies 为空对象
- [ ] `packages/db` 不 import 任何 `@supabase/*`
- [ ] 依赖方向检查脚本在 CI 中通过
- [ ] 集成测试只需要一个本地 PostgreSQL，不需要 Docker
- [ ] 同一套测试在组合 ① 和 ② 下都能通过

## 相关

- ADR-001 身份与授权
- ADR-002 对象存储
- `supabase/legacy/RECONSTRUCTION-NOTES.md` —— 遗留 schema 的考古记录
