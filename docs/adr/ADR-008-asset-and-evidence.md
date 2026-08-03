# ADR-008 · Asset 是证据，不是内容中心

- **状态**：提议
- **日期**：2026-08-03
- **决策人**：产品负责人
- **前置**：ADR-002（对象存储）、ADR-004（Moment 三层）、ADR-006（发布快照）

---

## 背景

Phase 2A 证明了「无照片 Moment」成立 —— 一句观察就足以构成一个 Moment。
现在要把现实世界的照片和声音接进来。

**这一步的全部风险在于：素材很容易重新夺回产品中心。**

旧系统就是这样：中心是 Photo，一切围绕它组织，于是「没有拍照的那段路」
在系统里不存在。如果 Phase 2B 只是给 Moment 加一个 `assetIds[]` 字段，
半年之后产品会退回同一个形状 —— 界面上最大的那块是照片墙，
观察和理解变成照片的附属说明。

所以这份 ADR 要回答的不是「怎么存图片」，而是：

> 素材以什么身份进入这个产品？

答案是：**证据**。

---

## 决策

### A1 · Asset 不可变

一个 Asset 一旦创建，`objectKey` / `sha256` / `byteSize` / `mimeType` /
`width` / `height` / `duration` / `originalMetadata` **永不改变**。

裁剪、滤镜、旋转、背景移除都**产生新的 Asset**，通过 `derived_from_asset_id`
指回来源。

#### 为什么

旧系统的做法是把编辑后的图覆盖原字段，把原图塞进 `original_file_url`。
后果是「编辑」这个动作没有历史 —— 编辑两次之后，第一次编辑的结果永远消失。
更糟的是 `PERFORMANCE-AUDIT.md` 第六组记录的那件事：同一张图产生了
**7 份副本**，而系统说不清哪一份是哪一份。

不可变让这些问题一次消失：每份字节都有唯一身份，编辑链是一棵可追溯的树。
它也和 ADR-002 的内容寻址天然一致 —— key 由内容决定，内容变了就是另一个 key。

### A2 · 第一版只做 image 和 audio

`type` 的取值域是 `image | audio | video`，但 **video 只保留类型，不实现处理链**。

理由：视频需要转码、封面抽帧、时长探测、流式播放，任何一项做不完整都会
让「上传成功但打不开」变成常态。宁可现在拒绝视频上传并明确说「暂不支持」，
也不要接受一个半成品。

`document`（PDF 等）**不在 Asset 里**。它不是体验的证据，是另一类东西，
等真正需要时单独决定。

### A3 · 同一用户 + 同一字节 = 同一个 Asset

`UNIQUE (user_id, sha256)`。

用户重复上传同一张照片，得到的是**同一行 Asset**，不是两行指向同一个对象。

#### 为什么不允许两行

ADR-002 已经决定同一用户的相同字节产生相同 `objectKey`。如果允许两行
Asset 共用一个 key，那么删除其中一行时：删对象会让另一行变成悬空引用，
不删对象就需要引用计数 —— 而 ADR-002 明确说过「用户命名空间方案的价值之一
就是不需要引用计数」。

一行 + `moment_assets` 多对多，同时满足了「同一照片可被多个 Moment 引用」
这个需求，且删除语义保持简单：**删了就是删了**。

#### 代价

用户在两个不同 Moment 里上传同一张照片，看到的是同一个 Asset。
若他把它从一处删掉，另一处也会受影响 —— 所以「从 Moment 移除」和
「删除 Asset」必须是界面上两个不同的动作（见 A7）。

### A4 · Asset 不承载解释

Asset 里**没有**这些字段：

| 不放什么 | 因为它属于 |
|---|---|
| `observation` / `caption` | Moment 的观察层 |
| `interpretation` | Moment 的理解层 |
| `isPublic` | Publication（ADR-006） |
| `x` / `y` / `scale` / `filter` | WorkPresentation（ADR-005） |
| `title` / `tags` / `category` | 旧 Photo 模型的遗物，新核心不要 |

Asset 只有两样东西：**一份不可变的字节，和它自带的技术元数据。**

这一条是整份 ADR 的执行细节。上面任何一个字段一旦被加进 Asset，
产品中心就开始向素材偏移。

### A5 · 用 MomentAsset 表达证据关系，不用 assetIds[]

```
MomentAsset
├── momentId
├── assetId
├── role          supporting | contradicting | context
├── sortOrder
└── note          为什么放这个（可空）
```

`role` 第一版三种：

| role | 含义 | 界面措辞 |
|---|---|---|
| `supporting` | 支持这条观察 | 「这是我看到的」 |
| `contradicting` | 与当前理解冲突 | 「但这张让我不确定」 |
| `context` | 提供现场背景 | 「当时周围是这样」 |

#### 为什么值得多一张表

`assetIds[]` 能回答「这个 Moment 有几张照片」。
`MomentAsset` 能回答的是：

> 什么证据支持我的观察？什么东西让我后来改变了理解？

第二个问题才是这个产品的原始命题。`contradicting` 这个角色尤其重要 ——
它是「理解会变化」在素材层的对应物：如果一张照片只能是支持性的，
那么系统就默认了用户的理解不会被推翻。

`note` 可空，但存在本身是一个邀请：写下你为什么放这张。

### A6 · 跨用户引用禁止，数据库兜底

`moment_assets` 只能连接**同一所有者**的 Moment 和 Asset。

和 Phase 2A 的 W-2 / J-3 一样，应用层校验 + 数据库触发器两道。
理由同 ADR-005 修正后的说明：未来的批量导入、迁移脚本、修 bug 时新增的
入口都不会经过用例层，而这类越权用户看不见。

### A7 · 两个不同的删除动作

| 动作 | 语义 | 效果 |
|---|---|---|
| **从 Moment 移除** | 「这张不算这段经历的证据」 | 删 `moment_assets` 行，Asset 保留 |
| **删除 Asset** | 「我不想再保留这份素材」 | Asset 软删除，**所有**引用它的 Moment 留下占位 |

界面上必须是两个动作、两处措辞。合并成一个「删除」按钮，
用户会在想做前者的时候做了后者。

删除 Asset 采用**软删除**（`deleted_at`），不立刻删对象：

- `moment_assets` 行保留 —— Moment 里显示「这里原本有一份素材，已被删除」，
  和 ADR-005 的墓碑同一个道理：作品和记录里不出现无法解释的空洞
- 对象由对账任务在宽限期后物理删除
- **已发布的 Publication 完全不受影响**，因为它引用的是派生副本（A8），
  不是原始 Asset

### A8 · 发布时生成派生副本，原图永不公开

这是 ADR-002「默认私有」在 Phase 2B 的落点，也是 Phase 2B 真正的难点。

```
原始 Asset          private，只能经所有权检查后读取
      │
      │  发布时
      ▼
PublishedAsset      受控尺寸 · 剥离 EXIF/GPS · 独立 objectKey
```

派生规则：

- 长边上限 **1600px**（第一版单一预设，不做响应式多尺寸）
- 统一转 **WebP**，质量 82
- **剥离全部元数据** —— EXIF、GPS、相机序列号、缩略图
- 派生对象本身也内容寻址，`sha256` 由派生后的字节决定

#### 访问方式：不是公开桶，是一条只看 Publication 状态的路由

```
GET /p/{slug}/a/{derivedHash}.webp
  → 按 slug 查 Publication
  → 不可见（不存在 / private 非本人 / 已撤回）→ 404
  → 在该版本的 snapshot 里核对 derivedHash 确实属于这篇
  → 流式返回，Cache-Control: public, no-cache, must-revalidate + ETag
```

##### ⚠️ 修正（2026-08-03）：内容不可变 ≠ 响应可永久缓存

这一条最初写的是 `Cache-Control: immutable`，**那是错的**，
因为它把两件不同的事混为一谈：

| | 是否成立 |
|---|---|
| 对象内容不可变（同 hash 同字节） | ✅ 真 |
| 响应永久有效（客户端可长期不再询问） | ❌ 假 —— **可访问性会变** |

作者撤回之后 origin 确实返回 404，但已经缓存过的浏览器或 CDN
**根本不会来问**，于是撤回在那些客户端上没有发生 —— 而页面看起来完全正常。
origin 侧的 E2E 覆盖不到这一层。

正确做法是 `no-cache, must-revalidate` + `ETag: "<derivedHash>"`：
字节仍可缓存（省传输），但每次使用前必须回来验证。
有效 → 304；撤回 → 404。

`no-cache` 的实际含义是「可以存，但用之前必须回来问」，
不是「不要缓存」（那是 `no-store`）。

长期 `immutable` 只有在**有能力主动 purge 的 CDN** 之后才谈得上。

同样的修正适用于原图路由：原来的 `private, max-age=3600` 意味着
删掉一份素材之后，作者自己的浏览器还能再看它一小时。

三个后果，每个都是刻意的：

1. **撤回立即生效。** 公开桶的做法要么删文件（那就不可逆），
   要么留着（那撤回是假的）。走路由则撤回当下就 404，字节还在。
2. **URL 里不出现 userId。** `objectKey` 含 `users/{userId}/`，
   直接暴露会泄露作者的内部 id。URL 只出现派生内容的 hash。
3. **不固化签名 URL。** ADR-006 要求快照能独立渲染，但快照里存签名 URL
   会在过期后变成一片裂图 —— 快照存的是 `objectKey` 和 `derivedHash`，
   URL 是运行时拼的。

代价：字节流经应用进程。第一版接受，并明确记为**将来可以下沉到 CDN 的
优化点**，而不是假装它不存在。

### A9 · 快照里放什么

`WorkSnapshot` 的 moment block 增加：

```ts
readonly assets?: readonly {
  readonly role: MomentAssetRole;
  readonly derivedHash: string;    // 公开 URL 用这个
  readonly objectKey: string;      // 服务端取件用这个，不出现在页面上
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly note?: string;
}[];
```

仍然满足 ADR-006 的判定标准：渲染只读快照，不查任何实时表。
删除原始 Asset 不影响已发布页面 —— 派生副本有自己的生命周期。

### A10 · published_assets 表只用于生命周期，不在读取路径上

```
published_assets(work_version_id, source_asset_id?, object_key, sha256, …)
```

用途只有三个：账号删除时找出要清理的派生对象、对账、避免同一版本
对同一 Asset 重复派生。

**页面渲染和资源路由都不查它** —— 它们只读 `publications` + `work_versions`。
这一点由 ADR-006 那条「五张表改名后仍能渲染」的测试继续守着。

---

## 后果

### 得到什么

- 素材有了明确身份：**证据**，而不是内容本身
- 「什么让我改变了理解」第一次可以被表达（`contradicting`）
- 编辑有历史（不可变 + 派生链），不再出现 7 份说不清来源的副本
- 发布一篇文章不会让原图永久公开
- 撤回是真的撤回

### 付出什么

- 多一张关系表和一个 role 概念 —— 用户第一次上传时要多做一次选择。
  缓解：`supporting` 是默认值，不选也能上传
- 派生副本占额外存储。1600px WebP 通常是原图的 5%–15%，可接受
- 字节流经应用进程（见 A8 代价）

### 明确不做

| 不做 | 理由 |
|---|---|
| 全局内容去重 | ADR-002 已论证：跨用户生命周期、隐私侧信道、授权绕过 |
| 视频处理链 | 见 A2 |
| 响应式多尺寸派生 | 单一 1600px 预设先跑通链路 |
| AI 识图 / 自动打标 | 会把 AI 的推断混进「事实层」，需要先有 provenance 的完整实践 |
| 相册瀑布流 / 批量上传 | 那是旧 Gallery 的形状，会把中心拉回素材 |
| 修图 | 不可变模型已经给它留了位置（派生 Asset），但不是 Phase 2B |

---

## 验收

- [ ] Moment 没有任何 Asset 时**仍然完全成立**（不能出现「请先上传照片」）
- [ ] 同一用户上传相同字节两次 → 同一个 Asset 行、同一个 objectKey
- [ ] 同一个 Asset 可以被两个 Moment 引用，各自有独立的 role
- [ ] Alice 引用 Bob 的 Asset → `NotFoundError`（404，不是 403）
- [ ] 绕过用例层直接 INSERT 跨用户 `moment_assets` → 数据库拒绝
- [ ] 原始 Asset 的 objectKey 匿名不可访问，且没有任何静态路由直达
- [ ] 发布后匿名可访问派生副本；**撤回后同一 URL 立即 404**
- [ ] 响应头不含 `immutable`、不含正数 `max-age`；含 `no-cache` 和 `ETag`
- [ ] 带 `If-None-Match` 请求：Publication 有效 → 304，撤回后 → 404
- [ ] **已经缓存过该图的同一个浏览器上下文**，在撤回后再访问得到 404
- [ ] 派生副本的字节里不含 EXIF / GPS
- [ ] 删除 Asset → 引用它的 Moment 显示占位；已发布页面**逐字不变**
- [ ] 「从 Moment 移除」不删 Asset

## 相关

- ADR-002 对象存储（内容寻址、默认私有、LocalFile 的硬性约束）
- ADR-004 Moment 三层（Asset 属于事实层的证据，不属于观察和理解）
- ADR-006 发布快照（派生副本如何进快照）
- ADR-009 时间与地点语义
