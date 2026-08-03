# Phase 2B Schema Contract —— Asset / 证据 / 时间

> 依据：ADR-002、ADR-004、ADR-006、ADR-008、ADR-009
> 状态：待评审。**评审通过前不建表。**
> 范围：`assets`、`moment_assets`、`asset_metadata_corrections`、`published_assets`

这份文档是 Commit 12B 的施工图。每一条约束都有编号，
migration 里的约束名和测试里的断言都引用同一个编号。

---

## 0. 一句话范围

> 让现实世界的照片和声音**作为证据**进入体验，并且在发布时只公开安全副本 ——
> 同时不让素材重新夺回产品中心。

---

## 1. `assets` —— 不可变的媒体素材

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | text | NOT NULL → `"user"(id)` ON DELETE CASCADE | 身份唯一来源是 Better Auth（ADR-001） |
| `type` | text | NOT NULL, CHECK in (`image`,`audio`,`video`) | video 只保留类型，不实现处理链（A2） |
| `object_key` | text | NOT NULL | `users/{userId}/sha256/{ab}/{hash}.{ext}`。**不存 URL** |
| `sha256` | text | NOT NULL, CHECK `^[a-f0-9]{64}$` | |
| `mime_type` | text | NOT NULL | |
| `byte_size` | bigint | NOT NULL, CHECK > 0 | |
| `width` | int | NULL, CHECK > 0 | image 必填（见 A-3） |
| `height` | int | NULL, CHECK > 0 | image 必填 |
| `duration_ms` | int | NULL, CHECK > 0 | audio/video 用 |
| `captured_local_at` | timestamp **without** time zone | NULL | 相机的墙上时间（T1） |
| `captured_at` | timestamptz | NULL | 时区已知才有值（T2） |
| `timezone` | text | NULL | IANA 名，如 `Asia/Tokyo` |
| `timezone_source` | text | NOT NULL DEFAULT `unknown`, CHECK in (`exif`,`gps_inferred`,`user`,`unknown`) | |
| `timezone_confidence` | real | NULL, CHECK 0..1 | 仅推断时有意义 |
| `original_metadata` | jsonb | NOT NULL DEFAULT `{"_v":1}` | **不可变**（T6） |
| `derived_from_asset_id` | uuid | NULL → `assets(id)` ON DELETE SET NULL | 编辑产生的新 Asset 指回来源（A1） |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | |
| `deleted_at` | timestamptz | NULL | 软删除（A7） |

**刻意没有的列**（ADR-008 A4）：
`title` `caption` `tags` `category` `is_public` `observation` `interpretation`
`x` `y` `scale` `filter` `thumbnail_url` `file_url`

### 不变量

- **A-1** `UNIQUE (user_id, sha256)` —— 同一用户 + 同一字节 = 同一个 Asset。
  没有它就需要跨行引用计数，而 ADR-002 的整个设计前提是不需要引用计数。
- **A-2** `object_key` 必须以 `users/{user_id}/sha256/` 开头。
  由触发器校验 —— 单靠 CHECK 无法引用另一列做前缀拼接。
  这是**授权与路径穿越的最后一道数据库防线**。
- **A-3** `type='image'` 时 `width` 和 `height` 必须非空；
  `type='audio'` 时 `duration_ms` 必须非空。
  没有尺寸的图片无法在发布时正确排版，也无法判断是否需要缩放。
- **A-4** `derived_from_asset_id` 不能等于 `id`（自引用）。
- **A-5** `type='video'` 的行**允许存在**（未来），但 Phase 2B 的上传用例
  必须拒绝它。这条不是数据库约束，是用例层契约 —— 写在这里避免将来
  有人以为「数据库允许 = 产品支持」。

### 时间不变量（ADR-009）

- **T-1** `chk_captured_at_requires_tz`：
  `(captured_at IS NULL AND timezone IS NULL) OR (captured_at IS NOT NULL AND timezone IS NOT NULL)`
  —— 时区未知时绝不伪造绝对时间。
- **T-2** `timezone IS NOT NULL` ⇒ `timezone_source <> 'unknown'`。
- **T-3** `timezone_source = 'gps_inferred'` ⇒ `timezone_confidence IS NOT NULL`。
  推断必须带置信度，否则无法与用户确认过的值区分。
- **T-4** `original_metadata` 在行创建之后**不允许 UPDATE**。
  由触发器强制（`BEFORE UPDATE` 时若 `OLD.original_metadata IS DISTINCT FROM NEW.original_metadata` 则 RAISE）。
  同样锁住 `object_key` / `sha256` / `byte_size` / `mime_type`（A1 不可变）。

### 索引

```
idx_assets_user_created   (user_id, created_at DESC) WHERE deleted_at IS NULL
uq_assets_user_sha256     UNIQUE (user_id, sha256)
idx_assets_derived_from   (derived_from_asset_id) WHERE derived_from_asset_id IS NOT NULL
```

---

## 2. `moment_assets` —— 证据关系

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `moment_id` | uuid | NOT NULL → `moments(id)` ON DELETE CASCADE |
| `asset_id` | uuid | NOT NULL → `assets(id)` ON DELETE **RESTRICT** |
| `role` | text | NOT NULL DEFAULT `supporting`, CHECK in (`supporting`,`contradicting`,`context`) |
| `sort_order` | int | NOT NULL, CHECK >= 0 |
| `note` | text | NULL |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

### 不变量

- **MA-1** `UNIQUE (moment_id, asset_id)` —— 同一张素材在同一个 Moment 里
  只出现一次。想表达两种角色，说明那是两段不同的观察。
- **MA-2** `UNIQUE (moment_id, sort_order) DEFERRABLE INITIALLY DEFERRED`
  —— 与 `work_blocks` 同款，让重排能在一个事务里一次改完。
- **MA-3** Moment 与 Asset 必须**同属一人**。触发器 `trg_moment_asset_same_owner`，
  报错码 `MA-3`。和 W-2 / J-3 同一个理由：迁移脚本和未来的新入口不会
  经过用例层。
- **MA-4** `ON DELETE RESTRICT`（不是 CASCADE）。
  删除 Asset 走**软删除**，物理删除必须先处理引用 —— 让数据库在有人
  绕过软删除时直接拒绝，而不是静默地把用户 Moment 里的证据抹掉。

### 删除语义（A7）

| 动作 | 影响 |
|---|---|
| 从 Moment 移除 | 删 `moment_assets` 行；Asset 不动 |
| 删除 Asset | `assets.deleted_at = now()`；`moment_assets` 行**保留**，界面显示占位 |
| 删除 Moment | `moment_assets` 行 CASCADE 删除；Asset 不动 |
| 删除账号 | `assets` CASCADE 删除（`moment_assets` 已随 Moment 先行 CASCADE） |

---

## 3. `asset_metadata_corrections` —— append-only 的修正链

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `asset_id` | uuid | NOT NULL → `assets(id)` ON DELETE CASCADE |
| `user_id` | text | NOT NULL → `"user"(id)` ON DELETE CASCADE |
| `field` | text | NOT NULL, CHECK in (`captured_local_at`,`timezone`,`gps`,`orientation`) |
| `value` | jsonb | NOT NULL |
| `source` | text | NOT NULL, CHECK in (`user`,`ai`,`gps_inferred`) |
| `confidence` | real | NULL, CHECK 0..1 |
| `supersedes_id` | uuid | NULL → 自引用 ON DELETE RESTRICT |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

### 不变量

- **C-1** `UNIQUE (supersedes_id) WHERE supersedes_id IS NOT NULL` —— 防分叉。
  和 `uq_interpretation_supersedes` 完全同款：没有它，两个并发请求能同时
  supersede 同一条，之后无法判断「当前生效的修正」是哪条。
- **C-2** 触发器：`supersedes_id` 指向的行必须属于**同一个 asset**。
  对应 `interpretation_revisions` 的 I-4。
- **C-3** 不能自我 supersede。
- **C-4** `source='ai'` 或 `'gps_inferred'` ⇒ `confidence IS NOT NULL`。
- **C-5** 应用层契约（无法用约束表达）：
  **推断不得覆盖 `source='user'` 的最新修正。**
  由 `applyCorrection` 用例检查，并有专门的测试。

### 合成规则

读一个 Asset 的有效元数据：

```
对每个 field：取该 field 修正链的最后一条；没有修正 → 回落到 assets 列上的原值
```

`original_metadata` 永远是最初提取的那份，不参与合成的写入，只作为可追溯的底。

---

## 4. `published_assets` —— 发布派生副本

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `work_version_id` | uuid | NOT NULL → `work_versions(id)` ON DELETE CASCADE |
| `source_asset_id` | uuid | NULL → `assets(id)` ON DELETE SET NULL |
| `user_id` | text | NOT NULL → `"user"(id)` ON DELETE CASCADE |
| `object_key` | text | NOT NULL |
| `sha256` | text | NOT NULL |
| `mime_type` | text | NOT NULL |
| `width` | int | NOT NULL |
| `height` | int | NOT NULL |
| `byte_size` | bigint | NOT NULL |
| `preset` | text | NOT NULL, CHECK in (`web1600`) |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

### 不变量

- **PA-1** `UNIQUE (work_version_id, sha256)` —— 同一版本内同一份派生字节只登记一次。
- **PA-2** `source_asset_id` 可空且 SET NULL：**原始 Asset 被删不影响已发布副本**。
  这是「旧作品保留当时的表达」在素材层的对应物。
- **PA-3** `object_key` 前缀必须是该 `user_id` 的命名空间（同 A-2 触发器）。
- **PA-4** **这张表不在读取路径上**（ADR-008 A10）。
  页面渲染和 `/p/{slug}/a/{hash}` 都只读 `publications` + `work_versions`。
  ADR-006 那条「五张表改名后仍能渲染」的测试继续有效，且**不把
  `published_assets` 加进那个改名清单** —— 加进去等于承认它在读取路径上。

---

## 5. 快照结构的增量（ADR-006 + A9）

`SnapshotMoment` 增加一个可选字段：

```ts
readonly assets?: readonly {
  readonly role: 'supporting' | 'contradicting' | 'context';
  readonly derivedHash: string;   // 公开 URL 用；不含 userId
  readonly objectKey: string;     // 服务端取件用；不出现在页面上
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly note?: string;
}[];
```

- **S-1** 快照里**不出现签名 URL**。URL 是运行时拼的，
  否则过期后整页变裂图（ADR-008 A8）。
- **S-2** 快照里**不出现原始 Asset 的 objectKey**，只有派生副本的。
  原图永不公开。
- **S-3** `assets` 缺失或为空数组都合法 —— 无素材的 Moment 是一等公民。
- **S-4** `assertSnapshotIsSelfContained` 扩展：若某 asset 项缺 `derivedHash`
  或 `objectKey`，视为假快照，抛 `P-3`。

---

## 6. 资源路由契约

```
GET /p/{slug}/a/{derivedHash}.{ext}
```

- **R-1** 先按 slug 判定 Publication 可见性（不存在 / private 非本人 / 已撤回 → **404**）。
- **R-2** 再在该版本 snapshot 里核对 `derivedHash` 确实属于这篇，
  否则 404 —— 防止拿一篇的 slug 去取另一篇的图。
- **R-3** 命中后流式返回，`Cache-Control: public, max-age=31536000, immutable`
  （内容寻址，字节永不变）。
- **R-4** URL 里**不允许出现 userId 或 objectKey**。
- **R-5** 原始 Asset 的读取走另一条路由，必须先过所有权检查，
  且 `Cache-Control: private`。

---

## 7. 第一版明确不做

| 项 | 理由 |
|---|---|
| 全局内容去重 | ADR-002 已论证三个问题 |
| 视频处理链 | A2 |
| 响应式多尺寸 / srcset | 单一 `web1600` 预设先跑通 |
| GPS → 时区反查 | 需要 tz 边界数据；ADR-009 留了 `gps_inferred` 位置 |
| 地址反查 | T5 已决定它不自动写进 placeLabel |
| AI 识图 / 自动打标 | 会把推断混进事实层 |
| 批量上传 / 瀑布流 / 相册 | 旧 Gallery 的形状，会把中心拉回素材 |
| 修图 | 不可变模型已留位置（派生 Asset），不是 Phase 2B |
| CDN 下沉 | A8 的已知代价，记为优化点而不是假装不存在 |
| EXIF 方向自动旋转 | 派生时处理，但不修改原始 Asset |

---

## 8. 验收总表

Commit 12E 的灵魂测试逐条对应：

| # | 断言 | 依据 |
|---|---|---|
| 1 | Moment 没有 Asset 仍然成立 | ADR-004 M1 |
| 2 | Moment 可以增加 Asset | A5 |
| 3 | 同一字节上传两次 → 一个 Asset，一个对象 | A-1 |
| 4 | 同一 Asset 被两个 Moment 引用，role 各自独立 | MA-1 |
| 5 | Alice 引用 Bob 的 Asset → 404 | A6 |
| 6 | 绕过用例层直接 INSERT 跨用户 → 数据库拒绝 | MA-3 |
| 7 | 原图匿名不可访问 | R-5 |
| 8 | 发布后匿名可见派生副本；撤回后立即 404 | R-1 |
| 9 | 派生副本不含 EXIF / GPS | A8 |
| 10 | 删除 Asset → Moment 留占位；已发布页面逐字不变 | A7 / PA-2 |
| 11 | 时区未知 → `captured_at` 为 NULL，界面不显示 UTC | T-1 / T3 |
| 12 | `original_metadata` 在修正后逐字节不变 | T-4 |
| 13 | 推断不覆盖用户修正 | C-5 |
