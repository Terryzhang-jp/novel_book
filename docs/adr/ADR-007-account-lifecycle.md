# ADR-007 · 账号生命周期与删除

- **状态**：已接受 · 2026-08-02 · 决策人：产品负责人
- **关闭缺口**：`verification-gaps.json` → `account-deletion-semantics`

---

## 背景

migration `20260802010000_unify_identity` 把业务外键改为
`REFERENCES "user"(id) ON DELETE CASCADE`。这是**数据库物理行为**，
不应该自动成为产品语义。

当前系统只有「删 user 行」这一个动作，无法区分四种完全不同的操作。
一个用户点「退出登录」和一个用户点「删除我的账号」不该走同一条代码路径。

## 状态机

```
active  ──禁用──▶  disabled  ──恢复──▶  active
   │                                        ▲
   └──申请删除──▶ deletion_requested ───撤销┘
                        │ 30 天等待期结束
                        ▼
                     deleted
```

## 四种操作的语义

| 操作 | Session | 内容 | 已发布 Publication | 可逆 |
|---|---|---|---|---|
| 退出登录 / session 失效 | 当前 session 失效 | **不动** | 不动 | — |
| 禁用账号（管理员） | 全部 session 撤销 | **全部保留** | 下架 | 可恢复 |
| 用户申请删除 | 全部 session 撤销 | 保留但不可访问 | **立即下架** | 30 天内可撤销 |
| 最终永久删除 | — | 删除私人数据、原始素材、Work、Publication | 删除 | **不可逆** |

## 一条容易被忽略的覆盖规则

ADR-005 说「删除 Work 时 Publication 可以保留」。

**那条规则只适用于作者正常整理草稿。**

删除**整个账号**时不能继续保留 Publication —— 否则用户要求删除数据后，
公开作品仍然挂在网上，与删除预期直接冲突。

```
删 Work      → Publication 保留（作者在整理草稿）
删账号       → Publication 一并删除（用户要求消失）
```

## 数据导出

导出是**删除前的可选操作**，由用户主动触发，不是删除过程自动生成一份
无人管理的导出文件。

```
用户申请删除
  → 提示「要不要先导出你的数据」
  → 用户选择导出 → 生成一次性下载链接（有效期 7 天）
  → 进入 30 天等待期
```

自动生成导出文件的问题：那份文件本身成了新的隐私资产，
而用户已经表达了「我要消失」。

## 实现要求

1. `user` 表新增 `status` 与 `deletion_requested_at`
2. 禁用与待删除状态下，认证中间件拒绝建立新 session
3. `ON DELETE CASCADE` **保留** —— 它是最终永久删除那一步的执行手段，
   但只能由删除流程触发，不能被任何常规操作路径调用
4. 每种状态变更写审计日志（谁、何时、为什么）
5. 集成测试必须覆盖四种操作各自的边界，尤其：
   - 禁用后内容仍在数据库里
   - 申请删除后 Publication 立即不可访问
   - 30 天内撤销能完全恢复
   - 最终删除后 Publication 确实消失

## 影响

- 现有的「删 user 行」路径必须收口到删除流程内部
- `scripts/delete-user-content.js` 是运维脚本，不是产品功能，需明确标注

---

## 已落实（2026-08-03 · Commit 14C–14E）

migration `20260807000000_account_lifecycle.sql` + `packages/domain/src/account.ts`
+ `use-cases/account.ts`。实现过程中有四处需要写回这份 ADR。

### 1. `deleted` 不是一个能查到的行

状态机以 `deleted` 结束，但 `"user".status` 的 CHECK 里**没有**这个值 ——
最终删除会把整行删掉，CASCADE 随即清空业务数据。这正是上面实现要求 3
所说的「CASCADE 是最终删除那一步的执行手段」。

所以 `deleted` 由「行不存在」+ `account_events` 里的记录共同表达。
`AccountRepository.findStatus` 返回 `null` 就是这个状态。

领域类型里仍然保留 `deleted`：`canAuthenticate('deleted')` 这样的问题
应该有答案，而不是「这个值不可能出现」然后在某处默认放行。

### 2. 撤销靠一次性令牌，不靠登录

上面实现要求 2 说「禁止 disabled / deletion_requested 建立 session」。
这条和「30 天内可撤销」放在一起会推出一个结论：**撤销不可能要求先登录**。

所以申请删除时签发一个 256 位随机令牌，库里只存 sha256，明文只显示一次。
`/account/restore` 是公开路径，令牌本身就是身份证明。

代价：令牌丢了，用户自己就撤销不了。兜底是运维路径
（`pnpm account restore`，状态机允许 deletion_requested → active）。
真实部署里这封信应该同时发到注册邮箱 —— 邮件通道还没接，已记入
`verification-gaps.json` → `account-cancel-token-not-emailed`。

### 3. 「下架」是读取时判定，不是批量改写

`disabled` / `deletion_requested` 让公开页面立刻不可访问，实现方式是
`viewPublication` 查一次作者状态，**不是**给所有 Publication 批量写
`withdrawn_at`。

理由有三个：

- `withdrawn_at` 的含义是「作者主动下架了这一篇」。账号被停用是另一回事，
  两者混用会丢失信息
- 撤销时无法还原：批量写过之后，分不清哪些是用户自己早就下架的
- 批量作业可能只成功一半；读取时判定没有中间状态

代价是发布页每次访问多一次主键查询。

对访客返回的是 `not_found` 而不是 `withdrawn`：「已下架」会告诉访客
「这里曾经有东西」，而账号被停用是作者与平台之间的事。

### 4. CASCADE 被锁进删除流程（数据库层强制）

上面实现要求 3 说 CASCADE「不能被任何常规操作路径调用」。光靠约定做不到 ——
任何一处 `DELETE FROM "user"` 看起来都和普通清理代码没有区别。

所以加了 `trg_guard_user_delete`：删除前必须在**同一事务**里
`set_config('tc.allow_user_delete', '<那一个 user id>', true)`。

开关是 user id 而不是布尔值：布尔开关一旦打开，
一条不带 WHERE 的 `DELETE FROM "user"` 就能删光整张表。
`test/integration/identity.test.ts` 有一条测试专门验证这一点。

### 5. 删除顺序：先 works，再 user

`work_blocks.moment_id` 是 `ON DELETE SET NULL`，而 `chk_block_shape`
要求每个 block 要么有 moment_id 要么有墓碑。级联时 Postgres 不保证
先删哪张表 —— moments 先走的话，那些 block 会瞬间变成「两者皆无」，
CHECK 报错，**有作品的账号删不掉**。

`AccountRepository.purge` 因此先 `DELETE FROM works`，再删 user 行。
这个 bug 是被 `runDueDeletions` 的「整批不能被任何一个账号卡住」
那条断言抓到的。
