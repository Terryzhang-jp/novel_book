# ADR-001 · 身份与授权：Better Auth 唯一身份源，应用层显式授权

- **状态**：已接受
- **日期**：2026-08-02
- **决策人**：产品负责人
- **对应评审项**：`DOMAIN-MODEL-REVIEW.md` I1（🔴 建表前必须锁定）

---

## 背景

旧系统同时存在**四套身份概念**，且它们互不一致：

```
"user"          Better Auth 的用户表     TEXT 主键
users           业务表，全部外键指向它    UUID 主键
auth.users      Supabase Auth            从未使用
auth.uid()      26 条 RLS 策略在用它      永远返回 NULL
```

### 三个具体后果

**① 两张用户表靠「约定」保持一致，没有任何数据库约束保证。**
`scripts/migrate-users-to-better-auth.ts` 把用户复制到 `"user"` 并保持 id
字符串相同。但**新用户通过 Better Auth 注册时只写 `"user"` 表，不会自动在
`users` 建行** —— 这意味着新注册用户可能无法创建任何内容（所有业务表的外键
指向 `users`）。这是一个尚未被验证的潜在断裂。

**② 全部 26 条 RLS 策略实际失效。**
策略写的是 `auth.uid()::text = user_id::text`，而 `auth.uid()` 来自
Supabase Auth 的 JWT。项目用的是 Better Auth，它签的 token Supabase 不认识，
所以 `auth.uid()` 永远是 NULL，RLS 会拒绝一切 —— 只能用 `service_role`
全部绕过（`lib/supabase/admin.ts`）。

**这是最危险的一点：架构上看起来有两道防线（RLS + 应用层），实际只有一道，
而且没有人在测试它。**

**③ 数据隔离完全依赖手写的 `.eq('user_id', userId)`。**
6 个 storage 类里散落着这个条件。**漏写一处就是跨用户数据泄露，而且零测试。**

## 决策

### 1. Better Auth 的 `user` 表是唯一身份源

```
user.id   ← 系统中唯一的用户标识
```

- 新领域表全部外键指向 `user.id`
- **不再新增第二张业务用户表**
- 旧的 `users` 表随遗留系统一起冻结，不进入新核心
- 不使用 Supabase Auth，不依赖 `auth.uid()`

### 2. 授权在应用层，显式且可测

每个请求进入应用后解析出 `ActorContext`，然后**显式向下传递**：

```ts
/**
 * 调用者身份。定义为联合类型而不是单一的 { userId } ——
 * 否则「公开 Publication 的匿名访问」和「后台清理任务」这两类合法场景
 * 只能靠绕过 Repository 约束来实现，等于给越权开了一道后门。
 */
export type Actor =
  | { readonly type: 'user';      readonly userId: string; readonly sessionId: string }
  | { readonly type: 'anonymous' }
  | { readonly type: 'system';    readonly reason: string };

/** 收窄到已登录用户。Repository 里需要 userId 的方法用它。 */
export function requireUser(actor: Actor): Extract<Actor, { type: 'user' }> {
  if (actor.type !== 'user') {
    throw new ForbiddenError(`此操作需要登录，当前 actor 是 ${actor.type}`);
  }
  return actor;
}
```

三种 actor 的授权语义：

| type | 能看到什么 | 典型场景 |
|---|---|---|
| `user` | 自己的全部数据 + 已发布的公开内容 | 正常应用请求 |
| `anonymous` | **只有** Publication 的公开快照 | `/p/[slug]` 公开页 |
| `system` | 按 `reason` 明确授权的范围 | 孤儿文件对账、定时清理 |

`system` 必须带 `reason` —— 它是审计线索，也是一道心理门槛：
写下「为什么这个操作需要越过用户边界」比默默传一个 admin flag 更难糊弄过去。

```
HTTP Request
  → 认证中间件：验证 session → 构造 ActorContext
  → Service：业务规则授权（「这个 Work 是不是他的」）
  → Repository：接收 actor，查询必须带 userId 约束
  → 数据库：外键 + CHECK 约束兜底
```

**Repository 层的硬性契约**：每个方法的第一个参数是 `actor: ActorContext`，
不允许有「不带 actor 的查询」。这条用类型系统强制：

```ts
// 正确
findById(actor: Actor, id: WorkId): Promise<Work | null>

// 禁止 —— 没有 actor 就没有隔离
findById(id: WorkId): Promise<Work | null>
```

### ⚠️ 静态检查的边界

`scripts/check-architecture.mjs` 只能保证**签名里有 actor**，无法保证
**方法体真的用了它**。下面这段代码能通过静态门禁，但仍然是越权漏洞：

```ts
async findById(actor: Actor, id: string) {
  return db.query('SELECT * FROM photos WHERE id = $1', [id]);  // actor 没用上
}
```

因此两层职责必须分清：

```
静态门禁    保证架构形状正确  —— 不可能忘记加 actor 参数
集成测试    保证安全语义成立  —— 用已知的他人 ID 去访问，断言被拒
```

**只有集成测试能证明隔离真的生效。** 静态门禁是脚手架，不是安全保证。

### 3. RLS 是纵深防御，不是正确性来源

**当前阶段不启用 RLS。** 理由：

一个「看起来在保护、实际被 `service_role` 全部绕过」的 RLS，比没有 RLS
更危险 —— 它制造虚假的安全感。旧系统正是这个状态。

未来要加 RLS 时，必须满足：
- 应用连接使用受限角色，**不是** `service_role`
- 通过 `SET LOCAL app.current_user_id` 传递身份，不依赖平台特有函数
- **每一条策略都有对应的集成测试证明它真的在拦截**

在这三条满足之前，RLS 不进入新核心。

### 4. 隔离必须被测试，而不是被相信

这是本 ADR 最重要的一条。既然唯一的防线是手写条件，就必须有自动化证明。

**每个 Repository 方法都要有一条「跨用户访问被拒绝」的集成测试**，且：

```
❌ 不接受「查询结果为空」作为通过条件
     —— 结果为空可能只是测试数据没命中

✅ 必须用已知存在的、属于另一个用户的真实 ID 去访问
     —— 断言返回 null / 抛 Forbidden，而不是断言 "列表里没有"
```

这条写进 `packages/db` 的 repository 契约测试基类，新增 repository 时
自动继承，漏写就 CI 红。

## 后果

### 得到什么

- 身份只有一处定义，不再有「两张表靠巧合一致」
- 授权路径显式可读，能被静态分析和测试覆盖
- 不依赖任何平台的 JWT 格式
- 安全边界与测试边界重合 —— 说有保护就真的能证明

### 付出什么

- 每个 repository 方法都要传 `actor`，签名更啰嗦
- 没有数据库层的「自动」保护网，必须靠测试纪律
- 未来若要给外部直连数据库（如 BI 工具），需要单独设计

### 遗留系统怎么办

`apps/web` 继续用现状（`service_role` + 手写 `user_id`），但**必须补上隔离
测试**——这是 Phase 1 遗留的最大缺口。Commit 10 会覆盖 6 个 storage 类。

## 待办：一个必须先验证的疑点

> **新用户通过 Better Auth 注册后，能否正常创建照片/文档？**

如果 `users` 表没有对应行，所有业务表的外键都会失败。这个问题在旧数据库
存在时可能一直被掩盖（因为用户都是迁移过来的，两张表都有）。

Commit 10 的集成测试要显式覆盖这条：**注册一个全新用户 → 立刻上传照片 →
断言成功**。如果失败，说明旧系统有一个从未被发现的注册断裂。

## 相关

- ADR-000 运行时平台
- `DOMAIN-MODEL-REVIEW.md` I1
- `PERFORMANCE-AUDIT.md` 第四组 #21/#22/#23
