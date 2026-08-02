# ADR-002 · 对象存储：统一接口，供应商是 adapter

- **状态**：已接受
- **日期**：2026-08-02
- **决策人**：产品负责人

---

## 背景

旧系统的文件访问直接绑定 Supabase Storage API（`lib/supabase/storage.ts`），
并且有三个独立的上传链路互不共享逻辑：

```
/api/photos              → bucket photos
/api/upload              → bucket documents
/api/canvas/upload-image → 又一条
```

后果（实测，见 `PERFORMANCE-AUDIT.md` 第六组）：

- 同一张图最多产生 **7 份副本**（原图 / 压缩图 / 缩略图 / 编辑后 / 编辑前 /
  文档副本 / 画布副本）
- **完全没有内容哈希去重**，同一张图上传 10 次就是 10 个文件
- `photos` bucket 是 public 的，`is_public` 只控制「应用里显不显示」，
  **不控制文件本身可访问性** —— 知道 URL 的任何人都能看到任何照片
- 孤儿文件无对账机制
- 缓存头曾是 1 小时（已在 Phase 1 修为 immutable）

## 决策

### 1. 统一接口

```ts
/** 存储对象的稳定标识。不含供应商信息，不含域名。 */
export type ObjectKey = string;   // 形如 "users/{userId}/sha256/ab/abcd….jpg"

export interface PutObjectInput {
  key: ObjectKey;
  body: Buffer | Uint8Array;
  contentType: string;
  /** 缓存策略。内容寻址的对象应为 immutable */
  cacheControl?: string;
  /** 已存在时是否覆盖。默认 false */
  overwrite?: boolean;
}

export interface StoredObject {
  key: ObjectKey;
  size: number;
  contentType: string;
  /** 内容的 sha256，用于去重与完整性校验 */
  hash: string;
}

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  /** 带过期时间的读取 URL。private 对象的唯一访问方式 */
  getSignedUrl(key: ObjectKey, expiresInSeconds?: number): Promise<string>;
  delete(key: ObjectKey): Promise<void>;
  exists(key: ObjectKey): Promise<boolean>;
  stat(key: ObjectKey): Promise<StoredObject | null>;
  /** 对账用：列出某前缀下的全部 key */
  list(prefix: string): AsyncIterable<ObjectKey>;
}
```

领域层和 Service 层只认这个接口，**永远不知道背后是谁**。

### 2. Adapter 清单

| 实现 | 用途 | 何时做 |
|---|---|---|
| `InMemoryObjectStorage` | 纯单元测试 | Commit 9 |
| `LocalFileObjectStorage` | 本地开发、集成测试、Playwright | Commit 9 |
| `S3ObjectStorage` | 生产（S3 / R2 / MinIO，S3 兼容协议） | 需要时 |
| `SupabaseObjectStorage` | 一种生产部署选项 | 需要时 |

**关键**：`LocalFileObjectStorage` 让「文件相关的业务逻辑」完全不需要
Docker 或任何云服务就能开发和测试 —— 上传、去重、签名 URL、删除、对账
全部可以先做完。

### 3. 内容寻址 —— 先做**用户命名空间内**的去重

```
users/{userId}/sha256/{hash[0:2]}/{hash}.{ext}
```

注意 `{userId}` 在 hash **之前**。这是刻意的取舍。

#### 为什么不做全局去重

「同一份内容只存一份」听起来免费，实际会立刻引入三个问题：

**① 跨用户生命周期**
Alice 和 Bob 上传了同一个文件。Alice 删除时能不能删物理对象？谁拥有它？
怎么算引用数？删错了 Bob 的图就没了。这需要一整套引用计数 + 原子递减，
而且删除必须在事务里和数据库状态保持一致。

**② 隐私侧信道**
如果 key 完全由内容 hash 决定，知道某文件 hash 的人可以探测「这个文件
在系统里存不存在」。对于照片这类内容，「你也上传过这张图」本身就是信息泄露。

**③ 授权绕过**
全局 key 意味着对象不再天然归属某个用户，授权检查必须完全依赖上层 ——
少一处检查就是任意读取。

#### 用户命名空间方案提供什么

- ✅ 同一用户内去重（这已经覆盖了绝大部分场景：用户重复上传自己的照片）
- ✅ 完整性校验
- ✅ key 不可变 → `max-age=31536000, immutable`
- ✅ **删除语义简单** —— 对象只属于一个用户，删了就是删了
- ✅ 无需跨用户引用计数
- ✅ 授权判断只看路径前缀，天然与 Asset 所有权对齐

#### 未来真的需要全局去重时

再引入一层间接：

```
Blob                   全局唯一，按内容 hash 寻址，带引用计数
AssetBlobReference     Asset ↔ Blob 的多对多
```

那时候引用计数、原子删除、隐私模型要一次性设计好。**现在不做。**

数据库存 `objectKey` + `hash` + `size` + `contentType` + `width/height`，
**不存 URL** —— URL 是运行时由当前 adapter 生成的，换供应商不需要改数据。

> 这条同时解决了 AI 生图的 base64 问题：模型返回图片后立刻 `put()`，
> 数据库只记 `objectKey`。实测旧做法单条记录 1.1 MB base64，
> 新做法约 200 字节。

### 4. 默认私有 + 签名 URL + 读取前必须鉴权

**每一次读取都要先过 Asset 所有权检查**，`getSignedUrl()` 不是授权点，
它只是「已经授权之后」的取件凭证：

```ts
// 正确
const asset = await assetRepo.findById(actor, assetId);   // ← 授权发生在这里
if (!asset) throw new NotFoundError();
const url = await storage.getSignedUrl(asset.objectKey);

// 禁止 —— 拿到 objectKey 就能换 URL，等于没有授权
const url = await storage.getSignedUrl(userSuppliedKey);
```

#### ⚠️ LocalFileObjectStorage 的硬性约束

它**绝对不能**把存储目录挂成静态目录。否则用户可以直接
`GET /uploads/users/{otherUserId}/sha256/...` 绕过整个 Repository 层，
数据库权限做得再对也没用。

强制要求：

1. 存储根目录必须在 `public/` **之外**（放 `.storage/`，且 gitignore）
2. 读取只能通过一个走鉴权的 route handler 流式返回
3. `getSignedUrl()` 返回的是**带签名和过期时间的应用内 URL**，
   不是文件系统路径
4. 所有 key 在落盘前做路径穿越校验：解析后的绝对路径必须仍在
   `{root}/users/{userId}/` 之内

第 4 条要有对应的契约测试（`../`、绝对路径、URL 编码的 `%2e%2e`）。

**所有对象默认 private。** 公开访问不是给对象打标记，而是在**发布时生成
独立的公开副本**：

```
原图              private，永远只能通过签名 URL 访问
      ↓ 发布时
发布副本（压缩过） public，独立 key，随 Publication 生命周期存亡
```

这直接解决 `DOMAIN-MODEL-REVIEW.md` P6 提出的问题：**发布一篇文章不应该
让原图永久公开**。

### 5. 生命周期与对账

- 删除 Asset 记录时同步删对象；失败进重试队列，不静默丢弃
- 提供 `storage:audit` 命令：对比数据库里的 key 集合与存储里的实际 key，
  报告孤儿文件和悬空引用
- **同一用户的多个 Asset 可能指向同一 key**（他上传了两次同一张图），
  因此删除前要在**该用户范围内**查引用数。因为 key 带用户前缀，
  这个查询是 `WHERE user_id = ? AND object_key = ?`，不需要全局引用计数表

## 后果

### 得到什么

- 文件相关功能的开发和测试**不需要任何外部服务**
- 换存储供应商 = 换一行 adapter 注入
- 去重、完整性、不可变缓存三个能力免费获得
- 原图不再因为「发布」而永久公开

### 付出什么

- 需要维护 4 个 adapter（但 InMemory 和 LocalFile 都很薄）
- 签名 URL 有过期时间，前端要处理刷新
- 跨用户不去重：两个用户上传同一张图会存两份。这是为了换取简单的删除语义和
  隐私隔离，是有意的取舍（见「为什么不做全局去重」）

### 遗留系统怎么办

`apps/web` 继续直连 Supabase Storage。但为了让旧应用能在无 Supabase 的本地
环境跑起来（用于验证上传/EXIF/Canvas 这些待迁移能力），会提供一个薄的
兼容层，把 `lib/supabase/storage.ts` 的四个函数转发到 `ObjectStorage`。

**这个兼容层是一次性的迁移工具，不是新架构的一部分。**

## 验收

- [ ] `ObjectStorage` 接口零外部依赖
- [ ] `InMemory` 和 `LocalFile` 两个实现通过**同一套契约测试**
- [ ] 契约测试覆盖：put / 去重 / 签名 URL / delete / exists / stat / list
- [ ] 同一用户上传相同字节 → 得到相同 objectKey，存储里只有一个对象
- [ ] 不同字节 → 不同 objectKey
- [ ] **不同用户上传相同字节 → 不同 objectKey**（用户命名空间隔离）
- [ ] hash 与实际落盘内容一致
- [ ] 路径穿越无效：`../`、绝对路径、`%2e%2e` 全部被拒
- [ ] 写入是原子的：中途失败不留下半个文件
- [ ] 删除不会越出该用户的命名空间
- [ ] LocalFileStorage 的根目录不在 `public/` 下，且无静态路由可直达
- [ ] 旧应用能用 `LocalFileObjectStorage` 在无 Supabase 环境下跑通上传

## 相关

- ADR-000 运行时平台
- `DOMAIN-MODEL-REVIEW.md` P6（发布素材的隐私边界）
- `PERFORMANCE-AUDIT.md` 第六组（7 份副本、无去重、缓存头）
