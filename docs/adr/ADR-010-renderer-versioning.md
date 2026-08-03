# ADR-010 · Renderer 有版本，Presentation 不是第二份内容

- **状态**：提议
- **日期**：2026-08-03
- **前置**：ADR-005（内容与表现分离）、ADR-006（发布快照）、ADR-008（派生素材）

---

## 背景

ADR-005 已经把内容和表现分开了，ADR-006 让 WorkVersion 冻结了
presentation 的**配置**。但那还不够，有两个漏洞：

### 漏洞一：冻结了配置，没冻结渲染代码

快照里存着 `{ theme: 'paper' }`。半年后有人改了 `gallery` 的渲染逻辑 ——
JSON 一个字节没变，**旧 Publication 的外观还是变了**。

于是「旧作品保留了我当时的表达」目前只覆盖文字内容，不覆盖视觉表达。
而对一个创作产品来说，版式就是表达的一部分。

### 漏洞二：Presentation 的边界没有写死

`PresentationConfig` 现在是一个开放的 `Record<string, string>`。
没有任何东西阻止有人往里加：

```ts
{ hiddenBlockIds: [...], blockOrder: [...], captions: {...} }
```

一旦 Presentation 能决定「哪些内容存在、按什么顺序、显示什么文字」，
它就不再是表现，而是**第二份内容真相**。那正是旧系统 CanvasElement
把 text 和 x/y 平铺在一起之后发生的事。

---

## 决策

### R1 · Renderer 用 `id@version` 标识

第一版两个：`narrative@1`、`gallery@1`。

版本号跟着**渲染代码**走，不跟着配置走。改了 narrative 的排版算法
就是 `narrative@2`，旧 Publication 继续用 `narrative@1` 渲染。

### R2 · 快照冻结四样东西

```json
{
  "rendererType": "narrative",
  "rendererVersion": 1,
  "presentationSchemaVersion": 1,
  "config": { "_v": 1, "renderer": "narrative", "theme": "paper", … }
}
```

| 字段 | 变了意味着 |
|---|---|
| `rendererType` | 换了一种表现形式 |
| `rendererVersion` | **渲染代码**变了 —— 旧发布必须继续用旧的 |
| `presentationSchemaVersion` | 配置的**结构**变了，需要迁移函数 |
| `config` | 用户调的参数 |

发布页按 `rendererType@rendererVersion` 选渲染器。
选不到就明确报错，**不要回退到最新版** —— 那正是要防的事。

### R3 · Presentation 绝对不能做的六件事

| 不能 | 因为 |
|---|---|
| 隐藏某些 Block | 那是在决定「哪些内容存在」 |
| 重新排序 Block | 那是在决定「内容的顺序」 |
| 修改文字 | 那是内容 |
| 替换 Moment 引用 | 那是内容 |
| 单独存一份 caption | 那会变成第二份说明文字，和 Moment 的观察打架 |
| 复制 Asset 或 Moment 内容 | 那会变成第二份内容真相 |

执行方式不是靠自觉：`PresentationConfig` 是一个**封闭的判别联合类型**，
每个 renderer 只有四个枚举字段。想加 `hiddenBlockIds` 必须先改类型定义、
改运行时校验、改这份 ADR —— 那时候至少有人会问一句「这真的是表现吗」。

### R4 · 配置在三个入口都做运行时校验

写入（`upsertPresentation`）、发布（`publishWork`）、渲染（发布页）。

只在写入处校验是不够的：数据库里可能有迁移脚本写进去的行，
也可能有旧版本结构的历史数据。渲染时拿到一个形状不对的 config，
要么崩，要么静默用默认值 —— 后者更糟，用户会以为自己的设置丢了。

`parsePresentationConfig()` 是纯函数：未知字段丢弃，缺失字段补默认，
非法枚举值报错。

### R5 · 一个 Work，每种 Renderer 各一份 Presentation、各一个 Publication

```
Work 「保存与活着」
├── narrative Presentation → Publication /p/保存与活着
└── gallery   Presentation → Publication /p/保存与活着-gallery
```

两个独立 slug、两份独立快照、两条独立的版本线。

`work_versions` 因此增加 `renderer_type` 列，版本号从
`UNIQUE (work_id, version_number)` 改成
`UNIQUE (work_id, renderer_type, version_number)` ——
narrative 发到第 3 版时 gallery 可能还在第 1 版，这是正常的。

发布 narrative **不会**自动更新 gallery 的 Publication。
它们是两次独立的「我决定把这一版给别人看」。

### R6 · 快照结构升到 `_v: 2`

presentation 从 `{ rendererType, config }` 变成 R2 的四字段结构。

`chk_snapshot_versioned` 那个 `_v` 从建库第一天就在，现在它第一次
派上用场：`normalizeSnapshot()` 读到 v1 就地升级成 v2
（`rendererType: 'web'` → `narrative@1`），v2 原样返回。

**升级只发生在读取时，不改写数据库里的行** —— 已发布的快照是不可变的，
改写它就违背了它存在的理由。

---

## 后果

### 得到什么

- 「旧作品保留当时的表达」第一次覆盖到**视觉**，不只是文字
- Presentation 的边界从「约定」变成「类型 + 运行时校验」
- 同一份内容可以有多种表现，且不产生第二份内容真相
- `_v` 从装饰变成了真的能用的东西

### 付出什么

- 每次改渲染代码都要判断「这算不算破坏性变更」。
  判断标准写死：**同一份 config 渲染出的视觉结果变了，就要升版本号。**
  修 bug 让它符合原本的意图不算；改默认间距算
- 快照体积略增（多三个字段）
- 需要维护多个版本的渲染器。缓解：只有真正发生破坏性变更时才分叉，
  第一版全是 `@1`

### 明确不做

| 不做 | 理由 |
|---|---|
| 自由坐标 / 拖拽缩放 | 那是 Konva 的领域，且会立刻把 Presentation 变成内容 |
| 用户自定义 CSS | 无法版本化，也无法保证旧发布的稳定 |
| 任意 JSON 配置 | 见 R3 —— 开放结构等于没有边界 |
| 多页画布 | 不在 Phase 2C |
| Presentation 级别的 caption | 见 R3 |

---

## 验收

- [ ] 一个 Work 能同时有 narrative 和 gallery 两个 Presentation
- [ ] 两者引用**同一份** Block，数量、顺序、Moment 引用完全相同
- [ ] 改 Presentation 配置**不产生任何 work_blocks 的写入**
- [ ] 改 narrative 不影响 gallery
- [ ] 发布 narrative 不会更新 gallery 的 Publication
- [ ] 两个 Publication 有各自独立的 slug 和版本线
- [ ] 旧 Publication 的快照里带着 `rendererVersion`，且渲染时用它选渲染器
- [ ] 删除一个 Presentation 不影响已有的 Publication
- [ ] Alice 不能修改 Bob 的 Presentation
- [ ] 非法配置在写入 / 发布 / 渲染三处都被拒
- [ ] v1 快照被读到时自动升级成 v2，**数据库里的行不被改写**

## 相关

- ADR-005 内容与表现分离（Presentation 是独立实体的原始决定）
- ADR-006 发布快照（`_v` 存在的理由）
