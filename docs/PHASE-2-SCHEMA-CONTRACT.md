# Phase 2A · Schema Contract

> 2026-08-02 · 依据 ADR-003 / 004 / 005 / 006 / 007
> **这份文件是建表前的最后一道设计门。** 表结构、不变量、删除规则、
> 所有权规则、快照格式在这里定死，migration 只是它的机械翻译。

---

## 0 · Phase 2A 的唯一目标

> **证明 Moment 的体验演化能进入 Work，并在发布后保持不变。**

一条纵向链路：

```
创建 Journey
→ 创建一个无照片 Moment
→ 添加 Observation
→ 添加 Interpretation v1
→ 创建 Work 并引用 Moment
→ 发布 Web Publication
→ 新增 Interpretation v2
→ 验证旧 Publication 仍显示 v1        ← 这一步是灵魂
→ 重新发布后新 Publication 显示 v2
```

跑通它，产品的核心主张就成立了：**你能看见自己的理解怎么变的，
而且旧作品保留了你当时的表达。**

---

## 1 · 明确不做的（第一版范围）

写下来是为了防止范围蔓延 —— 每一条都有人会觉得"顺手就做了"。

| 不做 | 理由 |
|---|---|
| Tiptap / Konva 编辑器 | 先证明模型对，编辑器是表现层 |
| Asset 上传、视频、语音 | Moment 不必须有照片，这条链路不需要 |
| Place 完整系统 | Moment 先用自由文本地点 |
| 自动 Journey 候选表 | 用户手动建即可 |
| 发布素材副本 | 没有 Asset 就没有副本 |
| MapBlock / QuoteBlock / ComparisonBlock | 第一版只有 text 和 moment_ref |
| 自定义 slug + 301 历史 | 自动生成 slug 够用 |
| `shared` 可见性 + 访问名单 | 只做 private / unlisted / public |
| 协作、remix、模板市场 | 远期 |
| 账号生命周期的 30 天流程 | ADR-007 只落实外键与状态检查 |

---

## 2 · 表清单（9 张）

```
journeys
moments
observations
interpretation_revisions

works
work_blocks
work_presentations

work_versions
publications
```

命名前缀：全部落在 `public` schema，与遗留表并存。
遗留表（`photos` / `documents` / `canvas_projects` …）**不动**。

---

## 3 · 关系图

```
"user" (Better Auth，唯一身份源 — ADR-001)
   │
   ├── Journey 0..n              type ∈ {trip, outing}，不可公开
   │      │
   │      └── Moment 0..n        journey_id 可空（未归类）
   │             ├── Observation 0..n              多条，保留时间
   │             └── InterpretationRevision 0..n   线性链，最多一个 current
   │
   └── Work 0..n                 可跨 Journey
          ├── WorkBlock 0..n     type ∈ {text, moment_ref}，有序
          ├── WorkPresentation 0..n   (work_id, renderer_type) 唯一
          │
          └── WorkVersion 0..n   不可变，含完整 snapshot
                 └── Publication 0..1   slug + visibility + withdrawn_at
```

---

## 4 · 逐表定义

### 4.1 `journeys`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | text | FK → `"user"(id)` ON DELETE CASCADE |
| `title` | text | NOT NULL |
| `type` | text | NOT NULL, CHECK ∈ (`trip`, `outing`) |
| `intent` | text | 可空 —— 「为什么出发」 |
| `started_at` | timestamptz | **NOT NULL** |
| `ended_at` | timestamptz | 可空（表示进行中） |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

**没有 `is_public` 列。** ADR-003 J6：Journey 不可公开，
从数据结构上杜绝，而不是靠代码自觉。

索引：`(user_id, started_at DESC)`

### 4.2 `moments`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | text | FK → `"user"(id)` ON DELETE CASCADE |
| `journey_id` | uuid | FK → `journeys(id)` **ON DELETE SET NULL**，可空 |
| `title` | text | 可空 |
| `occurred_at` | timestamptz | 可空 —— 事实层 |
| `place_label` | text | 可空 —— 第一版用自由文本，不接 Place 系统 |
| `provenance` | jsonb | NOT NULL DEFAULT `'{}'` —— 每个事实字段的来源 |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

`ON DELETE SET NULL` 是 ADR-003 的直接落实：
**Journey 是组织方式，Moment 是内容。删组织方式不该毁内容。**

`provenance` 形如 `{"_v":1,"occurred_at":{"source":"user"},"place_label":{"source":"ai","confidence":0.8}}`。
第一版不强制填，但列先建好 —— 加列容易，改语义难。

索引：`(user_id, occurred_at DESC NULLS LAST)`、`(journey_id)`

### 4.3 `observations`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `moment_id` | uuid | FK → `moments(id)` ON DELETE CASCADE |
| `user_id` | text | FK → `"user"(id)` ON DELETE CASCADE |
| `content` | text | NOT NULL, CHECK `length(btrim(content)) > 0` |
| `recorded_at` | timestamptz | NOT NULL DEFAULT now() —— 什么时候记的 |
| `created_at` | timestamptz | NOT NULL |

**允许多条**（ADR-004）：现场记一条、回家再记一条，是两次不同的观察，
不是对同一条的编辑。

`user_id` 冗余存一份：让「不同用户不能追加 Observation」这条不变量
可以在**单表**上检查，不必每次 join moments。

索引：`(moment_id, recorded_at)`

### 4.4 `interpretation_revisions`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `moment_id` | uuid | FK → `moments(id)` ON DELETE CASCADE |
| `user_id` | text | FK → `"user"(id)` ON DELETE CASCADE |
| `content` | text | NOT NULL, CHECK 非空 |
| `supersedes_id` | uuid | FK → `interpretation_revisions(id)`，可空（首版） |
| `based_on_observation_ids` | uuid[] | NOT NULL DEFAULT `'{}'` |
| `status` | text | NOT NULL, CHECK ∈ (`current`, `superseded`) |
| `created_at` | timestamptz | NOT NULL |

**三条硬约束**（ADR-004 修正）：

```sql
-- ① 每个 Moment 最多一条 current
CREATE UNIQUE INDEX uq_interpretation_current
  ON interpretation_revisions (moment_id) WHERE status = 'current';

-- ② supersedes 只能指向同一个 Moment 的 revision
--    外键做不到跨列条件，用触发器
CREATE TRIGGER trg_interpretation_same_moment ...

-- ③ supersedes 唯一 —— 一条 revision 只能被取代一次，保证链不分叉
CREATE UNIQUE INDEX uq_interpretation_supersedes
  ON interpretation_revisions (supersedes_id) WHERE supersedes_id IS NOT NULL;
```

③ 是防分叉的关键。没有它，两个人（或两个并发请求）可以同时 supersede
同一条 revision，形成两条分支，之后无法判断哪个是"当前理解"。

**旧 revision 不可修改** —— 由 Service 层保证并有测试；
数据库层第一版不加行级只读（那需要触发器，成本高于收益）。

### 4.5 `works`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | text | FK → `"user"(id)` ON DELETE CASCADE |
| `title` | text | NOT NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

**没有 `journey_id`** —— Work 可跨 Journey（ADR-005 W1）。
**没有 `is_public`** —— 公开性由 Publication 管（ADR-006）。

### 4.6 `work_blocks`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `work_id` | uuid | FK → `works(id)` ON DELETE CASCADE |
| `position` | integer | NOT NULL —— 顺序 |
| `type` | text | NOT NULL, CHECK ∈ (`text`, `moment_ref`) |
| `text_content` | text | `type='text'` 时必填 |
| `moment_id` | uuid | FK → `moments(id)` **ON DELETE SET NULL**；`type='moment_ref'` 时必填 |
| `tombstone` | jsonb | 可空 —— Moment 被删时的墓碑快照 |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

顺序唯一：`UNIQUE (work_id, position) DEFERRABLE INITIALLY DEFERRED`
—— 可延迟是必须的，否则重排序时中间状态会撞唯一约束。

判别约束：

```sql
CHECK (
  (type = 'text'       AND text_content IS NOT NULL) OR
  (type = 'moment_ref' AND (moment_id IS NOT NULL OR tombstone IS NOT NULL))
)
```

**墓碑机制**（ADR-004）：Moment 被删除时 `moment_id` 变 NULL，
但 `tombstone` 里留着删除那一刻的展示内容。Work 不会因为素材被删而
出现一个无法解释的空洞。

### 4.7 `work_presentations`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `work_id` | uuid | FK → `works(id)` ON DELETE CASCADE |
| `renderer_type` | text | NOT NULL, CHECK ∈ (`web`, `magazine`, `poster`, `map`) |
| `config` | jsonb | NOT NULL DEFAULT `'{"_v":1}'` —— theme / layout / typography |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

`UNIQUE (work_id, renderer_type)` —— 一个 Work 对每种输出各一套配置。

**这是本轮的结构性修正**（ADR-005）：原方案把 presentation 做成 Work 上的
单一字段，会让同一 Work 的网页版式和杂志版式互相覆盖。

第一版只用 `web`，但一对多从第一天就成立。

### 4.8 `work_versions`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `work_id` | uuid | FK → `works(id)` **ON DELETE SET NULL**，可空 |
| `user_id` | text | FK → `"user"(id)` ON DELETE CASCADE |
| `version_number` | integer | NOT NULL |
| `snapshot` | jsonb | NOT NULL —— 见第 5 节 |
| `created_at` | timestamptz | NOT NULL |

`UNIQUE (work_id, version_number)`

`work_id` 可空 + `ON DELETE SET NULL`：**删 Work 不删已发布版本**
（ADR-005/006）。已发布的链接不该因为作者整理草稿而 404。

⚠️ 但删**账号**时必须一并删除 —— `user_id` 上的 CASCADE 负责这件事
（ADR-007 的覆盖规则）。

### 4.9 `publications`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `work_version_id` | uuid | FK → `work_versions(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | text | FK → `"user"(id)` ON DELETE CASCADE |
| `slug` | text | NOT NULL, UNIQUE |
| `visibility` | text | NOT NULL, CHECK ∈ (`private`, `unlisted`, `public`) |
| `published_at` | timestamptz | NOT NULL |
| `withdrawn_at` | timestamptz | 可空 |

**撤回不删行**（ADR-006）：删掉行就无法区分「作者已下架」和
「从来不存在」，URL 会变成 404 —— 而我们已经决定要显示「已下架」。

第一版 `visibility` 不含 `shared`。

---

## 5 · WorkVersion snapshot contract

### 判定标准

> **渲染一个 Publication 时，不允许查询 `moments` / `observations` /
> `interpretation_revisions` / `work_blocks` / `work_presentations`
> 任何一张实时表。只读 `snapshot` 就能渲染出完整页面。**

这条会写成集成测试：发布后修改 Moment 和 Interpretation，
旧 Publication 的渲染输出必须逐字节不变。

### 格式

```jsonc
{
  "_v": 1,
  "work": { "id": "…", "title": "秩父：保存与活着" },
  "presentation": {
    "rendererType": "web",
    "config": { "_v": 1, "theme": "plain" }
  },
  "blocks": [
    { "type": "text", "position": 0, "text": "前言…" },
    {
      "type": "moment_ref",
      "position": 1,
      "momentId": "…",              // 仅供追溯，渲染不依赖它
      "moment": {                    // ← 冻结的展示内容
        "title": "秩父的支路",
        "occurredAt": "2025-09-14T06:40:00.000Z",
        "placeLabel": "秩父市番场町某条侧巷",
        "observations": [
          { "content": "居民还在门口晾衣服和交谈", "recordedAt": "…" }
        ],
        "interpretation": {          // ← 发布那一刻的 current revision
          "revisionId": "…",
          "content": "保存和活着是两件事。",
          "createdAt": "…"
        }
      }
    },
    {
      "type": "moment_ref",
      "position": 2,
      "momentId": null,
      "tombstone": { "title": "已删除的 Moment", "deletedAt": "…" }
    }
  ]
}
```

要点：

- `momentId` 只是追溯线索，**渲染器不得用它去查库**
- `interpretation` 冻结的是**内容本身**，不是 revision id
- `observations` 冻结的是发布那一刻的全部观察
- 每层带 `_v`，将来 schema 演进有迁移锚点

---

## 6 · 领域不变量（先写测试，再写 UI）

这些比表名和字段名更重要。每条对应一个集成测试。

### Journey

```
J-1  type 只能是 trip 或 outing
J-2  删除 Journey 只把 moment.journey_id 设为 NULL，不删 Moment
J-3  Journey 没有公开状态（表里就没有这一列）
J-4  started_at 必填，ended_at 可空
J-5  Alice 看不到 Bob 的 Journey（用已知存在的 id 访问）
```

### Moment

```
M-1  Moment 可以没有 Journey（journey_id 为 NULL）
M-2  Moment 可以没有任何 Asset —— 第一版根本没有 Asset 表，天然成立
M-3  Moment 必须属于某个 Actor
M-4  Observation 属于且只属于一个 Moment
M-5  不同用户不能给别人的 Moment 追加 Observation
M-6  Observation 允许多条，按 recorded_at 排序
```

### Interpretation

```
I-1  一个 Moment 最多一条 current revision（唯一索引）
I-2  新 revision 必须 supersede 当时的 current；首版 supersedes 为 NULL
I-3  旧 revision 不可修改（Service 层拒绝）
I-4  不能 supersede 另一个 Moment 的 revision（触发器）
I-5  一条 revision 只能被 supersede 一次（唯一索引，防分叉）
I-6  完整历史可按链回溯
```

### Work

```
W-1  Work 可以引用不同 Journey 的 Moment
W-2  Work 不能引用其他用户的 Moment
W-3  WorkBlock 顺序稳定且可重排（延迟唯一约束）
W-4  删除 Moment 后 WorkBlock 保留墓碑快照，不留空洞
W-5  一个 Work 每种 renderer_type 最多一套 presentation
```

### Publication

```
P-1  发布时生成不可变 snapshot
P-2  Moment / Interpretation 后续改变不影响已有 WorkVersion
P-3  Publication 渲染不查询任何实时表
P-4  撤回后 withdrawn_at 有值，记录仍在，显示「已下架」
P-5  删除 Work 不删除 Publication
P-6  删除账号会一并删除 Publication（ADR-007 覆盖规则）
P-7  slug 全局唯一
P-8  private 的 Publication 匿名访问不可见
```

---

## 7 · 所有权与删除规则汇总

| 操作 | 结果 |
|---|---|
| 删 Journey | Moment 保留，`journey_id` → NULL |
| 删 Moment | Observation / Interpretation 级联删；WorkBlock 留墓碑 |
| 删 Work | WorkBlock / Presentation 级联删；**WorkVersion 与 Publication 保留** |
| 删 WorkVersion | 其 Publication 级联删 |
| 撤回 Publication | 只设 `withdrawn_at`，不删行 |
| 删账号 | 全部级联删除，**含 WorkVersion 与 Publication** |

所有 Repository 方法第一个参数是 `actor: Actor`（ADR-001，由
`check:arch` 强制）。跨用户访问一律返回 `NotFoundError`，
对外 404，不区分「不存在」和「不是你的」。

---

## 8 · 架构约束

```
packages/domain                 纯类型 + 纯函数，零依赖
packages/application            用例层，接受 Actor
packages/infrastructure-postgres Repository 的 pg 实现
packages/infrastructure-storage  ObjectStorage（第一版用不到，但接口已在）
```

- 新核心**零 `@supabase/*` import**（`check:arch` 强制）
- 新核心**不引用遗留 `users` 表**（`check:arch` 强制）
- 新表全部外键指向 `"user"(id)`
- 本地 PostgreSQL + LocalFileStorage 即可运行，**不需要 Docker**

---

## 9 · 验收标准

### 工程

```
✅ CI 全绿（含新增的领域不变量测试）
✅ 新核心零 Supabase import
✅ 本地 PG + LocalFileStorage 可运行
✅ 所有 Repository 接收 Actor
✅ snapshot 可以不查询原始表独立渲染
```

### 产品

用户能**实际看见**这四句话：

```
「我当时这么观察」
「我后来这样理解」
「我的理解之后又改变了」
「旧作品保留了我当时的表达」
```

> 如果所有表都建好、所有测试都绿，但用户看不到这条变化链，
> **Phase 2A 仍然算失败。**
