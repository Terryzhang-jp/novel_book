# Phase 2D-1 · 账号生命周期契约

migration `20260807000000_account_lifecycle.sql` 落下的不变量清单。
和 Phase 2A/2B 的契约同一个用途：**每一条都要么由数据库约束保证，
要么由一条能指名道姓的测试保证**；两者都没有的条目不该出现在这里。

关联：ADR-007（含 2026-08-03 的五条实现更正）。

---

## AC · 状态机

| 编号 | 不变量 | 由什么保证 |
|---|---|---|
| AC-1 | 只允许 ADR-007 画出的五条迁移；其余全部拒绝，包括 `from === to` | `assertTransitionAllowed`（纯函数）· 单元测试穷举 4×4 组合 |
| AC-2 | `deletion_requested` ⇔ 三个删除字段同时非空；其他状态下三个字段必须同时为空 | CHECK `chk_deletion_fields` |
| AC-3 | `deletion_effective_at > deletion_requested_at` | CHECK `chk_deletion_window` |
| AC-4 | 只有 `deletion_requested` 且已到期的账号能被永久删除 | `assertDeletable` · 集成测试「差 1 毫秒也拒绝」 |
| AC-5 | `status` 只能是 `active` / `disabled` / `deletion_requested`。**`deleted` 不落库** —— 那一步删整行 | CHECK `user_status_check` |
| AC-6 | 状态迁移是 compare-and-set，`from` 不匹配就失败 | `UPDATE ... WHERE id = $1 AND status = $2` |

## SE · 会话

| 编号 | 不变量 | 由什么保证 |
|---|---|---|
| SE-1 | 非 `active` 账号**不能建立** session（所有登录方式，含 OAuth） | `databaseHooks.session.create.before` —— 它挂在写 session 行那一刻，不在各个登录端点里 |
| SE-2 | 非 `active` 账号**已持有的**凭据也立即失效 | `resolveSession()` 每次解析身份都复查 status |
| SE-3 | 停用 / 申请删除会撤销该用户全部 session 行 | `revokeSessions` · 集成测试断言条数 |
| SE-4 | 「退出登录」不改任何内容、不改账号状态、不写审计 | 集成灵魂测试 1（逐行比对 moments + 断言审计为空） |

> SE-1 和 SE-2 必须同时存在。只有 SE-1，已经登录的人还能用满 cookieCache 的 5 分钟；
> 只有 SE-2，他重新登录一次就又进来了。

## PU · 发布可见性

| 编号 | 不变量 | 由什么保证 |
|---|---|---|
| PU-1 | 作者非 `active` 时，其全部 Publication 立即不可访问 | `viewPublication` 查 `accounts.findStatus` |
| PU-2 | 对访客返回 `not_found` 而**不是** `withdrawn` —— 不公告作者的账号状态 | 集成测试断言 status 值 |
| PU-3 | 下架不改写任何一行 —— 撤销停用后自动全部恢复 | 读取时判定；集成测试比对撤销前后的快照 JSON 逐字节相同 |
| PU-4 | 派生图路由和页面走同一个判定 | 两者都只调 `viewPublication`；E2E 同时断言页面 404 和图片 404 |

## DE · 删除

| 编号 | 不变量 | 由什么保证 |
|---|---|---|
| DE-1 | `DELETE FROM "user"` 在任何常规路径上都失败 | 触发器 `trg_guard_user_delete` |
| DE-2 | 放行开关精确到一个 user id，一条语句最多删一个账号 | 触发器比对 `current_setting('tc.allow_user_delete') = OLD.id` · 集成测试用不带 WHERE 的 DELETE 验证 |
| DE-3 | 删除前必须先收集 object key —— 行没了就查不到该删哪些字节 | `finalizeAccountDeletion` 的事务内顺序 |
| DE-4 | 对象存储的删除在事务**之外** —— 删文件失败不能回滚已完成的行删除 | 同上；失败写 `storage_cleanup_incomplete` 审计 |
| DE-5 | 先删 `works` 再删 user 行，否则 `chk_block_shape` 会让有作品的账号删不掉 | `AccountRepository.purge` · 集成测试「整批不能被任何一个账号卡住」 |
| DE-6 | 删账号会一并删除 Publication（**覆盖** ADR-005 的「删 Work 保留 Publication」） | CASCADE · 集成灵魂测试 7 |
| DE-7 | 批量任务里单个账号失败不中断整批 | `runDueDeletions` 逐个 try/catch |

## AU · 审计

| 编号 | 不变量 | 由什么保证 |
|---|---|---|
| AU-1 | `account_events.user_id` **没有外键** —— 审计必须比被审计对象活得久 | 建表语句（注释写明理由）· 集成测试在 purge 之后仍读得到 `deletion_finalized` |
| AU-2 | 每次状态变更都写一条，含 actor 类型与 reason | 五个用例各自 `recordEvent` |
| AU-3 | system actor 必须带 reason | `systemActor()` 构造时强制 |
| AU-4 | 审计里**不出现**撤销令牌，明文和哈希都不行 | 集成测试把整个审计序列化后断言不包含二者 |

## TK · 撤销令牌

| 编号 | 不变量 | 由什么保证 |
|---|---|---|
| TK-1 | 256 位 CSPRNG；库里只存 sha256 | `CryptoTokenIssuer` · 集成测试比对库里的值 |
| TK-2 | 令牌哈希全局唯一 | 部分唯一索引 `uq_user_deletion_cancel_token` |
| TK-3 | 一个令牌只能撤销它自己那个账号 | 按哈希反查 · 集成测试用两个账号验证 |
| TK-4 | 用过即失效（撤销时清空哈希） | `transition` 把三个删除字段一起置空 · 集成测试重放同一令牌 |
| TK-5 | 过期后不能撤销 | `canCancelDeletion` · 集成测试推进到第 30 天 |
| TK-6 | 令牌错误一律 `NotFoundError`，不区分「错」「用过」「已删除」 | `cancelAccountDeletion` |

## CL · 时钟

| 编号 | 不变量 | 由什么保证 |
|---|---|---|
| CL-1 | 30 天等待期的判定走注入的 Clock，不是 `new Date()` | `Clock` 端口；`systemClock` 是唯一调用 `new Date()` 的地方 |
| CL-2 | 同一次操作里的多个时间戳来自同一次 `clock.now()` | 用例内只取一次 |
| CL-3 | 测试与运维演练走**同一条**生产代码路径 | `advanceableClock`（测试）/ `fixedClock`（CLI `--now`）只换实现，不换分支 |
