# 遗留写入清单 · Phase 3A

Phase 3A 的目标不是「重写上传页面」，而是一句可判定的话：

> **从某个明确的 commit 开始，系统不再产生任何新的 Legacy Photo
> 和 Legacy Storage 数据。**

旧数据可以继续读，旧页面可以继续存在，但**旧写入必须停止**。
只要旧写入路径还开着，每一天都在增加将来要迁移的数据量。

这份清单是那句话的判定依据：每个能产生旧数据的入口都在这里，
每一个都要走到 `已关闭`。

---

## 一、状态总览

| # | 入口 | 写入目标 | 用户入口 | 替代用例 | 状态 |
|---|---|---|---|---|---|
| L1 | `app/api/photos/route.ts` POST | `photos` 表 + Supabase `photos` bucket | Gallery 上传 | `uploadAsset` | **已关闭**（16B） |
| L2 | `app/api/photos/[id]/edit/route.ts` | 同上（覆盖写） | 图片编辑器保存 | `uploadAsset` + `derivedFromAssetId` | **已关闭**（16B） |
| L3 | `app/api/upload/route.ts` → `uploadFile()` | 任意 Supabase bucket | 编辑器内嵌图片 | `uploadAsset` | **已关闭**（16B） |
| L4 | `lib/storage/canvas-storage.ts` | `canvas_projects` + canvas bucket | 画布 | Phase 3D 再定 | 未关闭 |
| L5 | `photoStorage.setLocation` / `batchSetLocation` / `removeLocation` | `photos.location_id` | 地点标注 | Phase 3B（Place） | **已关闭**（16D，端点返回 410） |
| L6 | `photoStorage.updateDescription` / `updateDateTime` | `photos` 字段 | 照片详情编辑 | 元数据修正链 / Moment | **已关闭**（16B + 16D） |
| L7 | `scripts/migrate-data-to-supabase.js` | `photos` 表 | 运维脚本 | 无（一次性迁移工具） | 运维，见下 |
| L8 | `scripts/delete-user-content.js` | 删除，不新增 | 运维脚本 | `pnpm account` | 已标注为运维专用 |
| L9 | `lib/storage/ai-magic-storage.ts` | `ai_magic_history` 表 + `ai-magic-images` bucket | AI 修图 | `uploadAsset`（生成图也是素材） | 未关闭 |

> **L9 是门禁自己找出来的，不是手工清点出来的。**
> 我第一版清单只列到 L8 —— AI 生成图那条路径走的是另一个 storage 封装，
> 名字里没有 photo，肉眼扫过去不会停下。这正是把清单变成机器规则的理由：
> 一份靠人维护的清单，漏掉的永远是那些长得不像的入口。

**Phase 3A 还没有完成。** L4 和 L9 仍然会写 Supabase Storage，
它们的去向留在 Phase 3D（画布与 AI 修图）。不把这两条算进「已关闭」，
是因为「没有新的 Legacy Storage 对象」这条完成标准对它们同样有效。

---

## 二、L7：那个迁移脚本

`scripts/migrate-data-to-supabase.js` 会往 `photos` 表插行。
16D 之后它**跑不通了** —— 触发器要求逐行点名授权，而它是批量插入。

这是刻意的：它是一次性的历史迁移工具，目标实例已经不存在（见下一节）。
真的需要重跑时，正确的做法是照着 `supabase/seed.sql` 里那段循环改写，
而不是把触发器关掉。

---

## 三、当前实际情况的一个重要事实

`NEXT_PUBLIC_SUPABASE_URL` 指向的实例（`nncrmixivirswjmkprpf.supabase.co`）
**DNS 已经解析不到**（`pnpm verify:legacy-storage` 实测）。

所以此刻 L4 / L9 在这个环境里其实是**运行时失败**的，不是在悄悄写数据。

这不能当成「已经止血」：

- 代码路径原样存在，**换一个可用的 Supabase 配置就会立刻恢复写入**
- 失败发生在运行时，不在 CI 里，所以没有任何东西会提醒新来的人
- 「因为配置坏了所以没写进去」不是一种设计

因此门禁是必要的：**让新增的旧写入在 CI 里失败，而不是在生产里失败。**

---

## 四、三层保护

### 1. 静态门禁（16A）

`scripts/check-architecture.mjs` 的规则 `no-new-legacy-writes`：
在 `apps/web/app|lib|components` 下，除**明确豁免的文件**之外，禁止出现

```
.from('photos').insert / .update / .upsert
supabaseAdmin.storage.from(...).upload(...)
uploadFile(...)
```

豁免清单是**显式的文件列表**，不是目录通配 —— 通配会让某天新增的文件
自动获得豁免，而那正是要挡住的东西。

**一个入口关闭，就从豁免清单里删掉一行。清单变空的那一刻，Phase 3A 完成。**

剩下的三行：

```
apps/web/lib/supabase/storage.ts        L3 的实现文件（uploadFile 的定义）
apps/web/lib/storage/canvas-storage.ts  L4
apps/web/lib/storage/ai-magic-storage.ts L9
```

`test/unit/check-architecture.test.ts` 里有两条测试锁住**已关闭的入口不能
重新打开**：把 `photo-storage.ts` 或 `app/api/upload/route.ts` 加回豁免清单
会让 CI 变红。豁免清单只能变短。

### 2. 接口层（16B / 16D）

- `PhotoStorage` 只剩 `findById` / `findByUserId` / `findByCategory` /
  `getStats` / `getAllPublicPhotos`。写入方法**删除**，不是注释掉，
  也不是抛 not-implemented —— 留着一个不能用的写入方法，等于留着一个
  将来会有人再调用的入口。
- `PhotoRepository`（`@tc/legacy-adapters`）同样只剩 `list` / `findById` /
  `listPublic`。

### 3. 数据库（16D）

`20260811000000_freeze_legacy_photo_writes.sql` 在 `photos` 上装了
`trg_guard_legacy_photo_write`（BEFORE INSERT OR UPDATE）。放行条件是
**在同一个事务里逐行点名**：

```sql
SELECT set_config('tc.allow_legacy_photo_write', '<那一行的 id>', true);
```

第三个参数 `true` = 事务本地，授权随事务结束消失，不会残留在连接池上。
和 `trg_guard_user_delete` 同一个模式，理由也一样：布尔开关一旦打开，
一条不带 WHERE 的 UPDATE 就能改光整张表；点名之后一次最多动一行。

**DELETE 不拦。** `photos.user_id` 上挂着 `ON DELETE CASCADE`，
永久删除账号那一路必须能跑完 —— 挡住 DELETE 等于让「你的东西你能删掉」
在旧表上失效，那比多留几行旧数据严重得多。

静态门禁挡的是「有人不小心写了」；触发器挡的是「不管用什么方式都写不进去」，
包括运维脚本、psql 会话，和将来某个还不存在的后台任务。

---

## 五、明确不做双写

不采用「上传一次 → 写 Photo → 再写 Asset」。

双写会制造：一边成功一边失败、两份 id、两套删除语义、
逐渐分叉的 metadata、重复的用户隔离规则，以及一个永远不敢删的旧表。

旧生产数据已经不存在，没有需要保护的兼容性。所以：

```
新 Asset 是唯一的写入事实
旧页面需要 Photo 形状  →  只读投影（mapAssetToLegacyPhotoDto）
```

投影是**单向的**：`@tc/legacy-adapters` 里没有 `mapLegacyPhotoToAsset`，
没有 `save`，没有 `create`。一旦出现反向映射，「Asset 是唯一事实」就不成立了。

投影里有三处刻意的不忠实，每一处都在代码里写了理由：

| 字段 | 值 | 理由 |
|---|---|---|
| `isPublic` | 恒为 `false` | 公开性由 Publication 管理，与素材无关。旧系统这里硬编码过 `true`，每张上传的照片立刻出现在公开地图上 |
| `locationId` | 恒为缺失 | Place 能力还不存在（Phase 3B）。缺席表示「系统还没有地点库」，不是「这张图暂时没关联上」 |
| `metadata.dateTime` | 只在知道**绝对时刻**时才有值 | 墙上时间放在额外的 `capturedLocalAt` 字段里。把没有时区的时间写进一个下游当 ISO-8601 时刻用的字段，等于替相机决定了时区（ADR-009） |

---

## 六、退役的用户能力

硬切不是零成本。下面这些能力**被明确移除或推迟**，端点返回 410 并说明去向 ——
不是静默失败，也不是留一个会 500 的路径。

| 端点 | 状态码 | 去向 |
|---|---|---|
| `DELETE /api/photos/trash/empty` | 410 `CAPABILITY_REMOVED` | 素材不再被硬删除。软删除已经让它从所有列表消失；要「一点不剩」只有删除账号那条路（有 30 天冷静期） |
| `PUT/DELETE /api/photos/[id]/location` | 410 `CAPABILITY_PENDING` | Phase 3B（Place） |
| `POST /api/photos/batch-location` | 410 `CAPABILITY_PENDING` | Phase 3B（Place） |
| `PUT /api/photos/[id]` 的 `description` | 410 `CAPABILITY_MOVED` | 说明文字属于 Moment 的观察或理解，素材上不再有 |
| 地点坐标改动回写照片 | 静默移除 | 旧行为会覆盖**相机记下的原始坐标**且不可恢复。新形状是一条修正（append-only），等 Phase 3B |

继续可用、只是换了底座的：

```
上传          POST /api/photos          → uploadAsset
图片编辑保存  POST /api/photos/[id]/edit → uploadAsset + derivedFromAssetId（不覆盖原件）
列表 / 详情   GET  /api/photos[/id]      → Asset 的只读投影
删除 / 回收站 DELETE /api/photos/[id]、/api/photos/trash → 软删除 / 恢复
拍摄时间修正  PUT  /api/photos/[id]      → applyMetadataCorrection('captured_local_at')
编辑器内嵌图  POST /api/upload           → uploadAsset，返回受控预览 URL
```

---

## 七、受控预览

16B 要求上传 facade 负责「缩略图」。新路径没有把缩略图当成第二份存储对象，
而是加了一个派生端点：

```
GET /api/studio/assets/[id]/preview?size=thumb|large
```

- 走**和发布派生完全同一个 ImageDeriver** —— 同一段剥离元数据的代码。
  共用一个实现，是为了不出现「发布时剥干净了、预览没剥」这种
  只在其中一条路径上成立的安全性。
- 不落盘。落盘意味着新的 key 命名空间、新的引用计数问题、素材删除时的
  新清理义务，换来的只是省掉一次 sharp 调用。
- 代价用 ETag 抵掉：**ETag 只由数据库里的行算出来**（sha256 + 档位 +
  算法版本），所以 304 那一路根本不读字节、不调 sharp。
- `Cache-Control: private, no-cache, must-revalidate` —— 比原件的
  `no-store` 松一档（副本已经不带 GPS），比 `max-age` 严一档
  （素材被删或账号被停用后，缓存不能继续替我们送出内容）。
- 档位只有两档。开放任意宽度等于把服务器变成免费的图片缩放服务。

---

## 八、Phase 3A 完成标准

```
[x] 所有**上传**入口写入 Asset                    16B
[x] 没有新 Photo 记录                             16D（数据库触发器）
[ ] 没有新 Legacy Storage 对象                    L4 / L9 未关闭（Phase 3D）
[x] 旧 Gallery 通过只读 adapter 显示新 Asset       16C
[x] 任何直接的旧写入在 CI 中失败                   16A + 16D
[x] 非 active 用户在外部副作用前被拒绝              15E
[x] 失败上传不留孤儿对象                          16B（落库失败 → storage_cleanup_jobs）
[x] Legacy 对象真实可访问性已验证                  15E
```

八条里有七条已经成立。剩下的一条要等 L4（画布）和 L9（AI 修图）迁完。

---

## 九、验收在哪里

| 层 | 文件 | 证明什么 |
|---|---|---|
| 单元 | `test/unit/legacy-photo-projection.test.ts` | 投影不可能把素材变公开；墙上时间不被当成绝对时刻；用户修正压过 EXIF |
| 单元 | `test/unit/check-architecture.test.ts` | 门禁认得出遗留写入；**已关闭的入口不能重新豁免** |
| 集成 | `test/integration/legacy-write-freeze.test.ts` | 直接打 SQL 也写不进 photos；授权只放行一行且事务本地；DELETE 仍放行；上传落进 assets 而 photos 不变 |
| E2E | `e2e/legacy-upload-cutover.spec.ts` | 从**旧上传页**真的传一张图 → 旧 Gallery 看得见 → Studio 看得见 → `assets` 多一行、`photos` 一行不多 → 预览返回 200 再 304 |

E2E 里刻意**没有**「远端 bucket 没有新对象」这条断言：那个实例连不上，
返回什么都能被解释成通过。那条由静态门禁（上传路径上没有任何
`uploadFile` 调用）和「字节确实落在本地内容寻址路径下」共同保证。
