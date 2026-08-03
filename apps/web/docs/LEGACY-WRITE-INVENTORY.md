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
| L1 | `app/api/photos/route.ts` POST → `photoStorage.create()` | `photos` 表 + Supabase `photos` bucket | Gallery 上传 | `uploadAsset` | **未关闭** |
| L2 | `app/api/photos/[id]/edit/route.ts` → `photoStorage.replacePhoto()` | 同上（覆盖写） | 图片编辑器保存 | `uploadAsset`（新 Asset，不覆盖） | **未关闭** |
| L3 | `app/api/upload/route.ts` → `uploadFile()` | 任意 Supabase bucket | 通用上传 | `uploadAsset` | **未关闭** |
| L4 | `lib/storage/canvas-storage.ts` | `canvas_projects` + canvas bucket | 画布 | Phase 3D 再定 | **未关闭** |
| L5 | `photoStorage.setLocation` / `batchSetLocation` / `removeLocation` | `photos.location_id` | 地点标注 | Phase 3B（Place） | **未关闭** |
| L6 | `photoStorage.updateDescription` / `updateDateTime` | `photos` 字段 | 照片详情编辑 | Asset 修正链 | **未关闭** |
| L7 | `scripts/migrate-data-to-supabase.js` | `photos` 表 | 运维脚本 | 无（一次性迁移工具） | 运维，见下 |
| L8 | `scripts/delete-user-content.js` | 删除，不新增 | 运维脚本 | `pnpm account` | 已标注为运维专用 |
| L9 | `lib/storage/ai-magic-storage.ts` | `ai_magic_history` 表 + `ai-magic-images` bucket | AI 修图 | `uploadAsset`（生成图也是素材） | **未关闭** |

> **L9 是门禁自己找出来的，不是手工清点出来的。**
> 我第一版清单只列到 L8 —— AI 生成图那条路径走的是另一个 storage 封装，
> 名字里没有 photo，肉眼扫过去不会停下。这正是把清单变成机器规则的理由：
> 一份靠人维护的清单，漏掉的永远是那些长得不像的入口。

**创建新数据的只有 L1–L4 和 L9。** L5、L6 是改已有行——它们同样要迁，
但它们不会让「旧数据总量」继续增长，优先级低一档。

---

## 二、当前实际情况的一个重要事实

`NEXT_PUBLIC_SUPABASE_URL` 指向的实例（`nncrmixivirswjmkprpf.supabase.co`）
**DNS 已经解析不到**（`pnpm verify:legacy-storage` 实测）。

所以此刻 L1–L4 在这个环境里其实是**运行时失败**的，不是在悄悄写数据。

这不能当成「已经止血」：

- 代码路径原样存在，**换一个可用的 Supabase 配置就会立刻恢复写入**
- 失败发生在运行时，不在 CI 里，所以没有任何东西会提醒新来的人
- 「因为配置坏了所以没写进去」不是一种设计

因此 16A 的门禁是必要的：**让新增的旧写入在 CI 里失败，而不是在生产里失败。**

---

## 三、机器门禁（本次提交落地的部分）

`scripts/check-architecture.mjs` 新增规则 `no-new-legacy-writes`：

在 `apps/web/app/`、`apps/web/lib/`、`apps/web/components/` 里，
除**明确豁免的遗留 adapter 文件**之外，禁止出现：

```
.from('photos').insert / .update / .upsert
supabaseAdmin.storage.from(...).upload(...)
uploadFile(...)
```

豁免清单是**显式的文件列表**，不是目录通配。理由和 15B 的表清单一样：
通配会让某天新增的文件自动获得豁免，而那正是要挡住的东西。

清单里每一项都对应上表的一行。**一个入口关闭，就从豁免清单里删掉一行** ——
清单变空的那一刻，Phase 3A 完成。

---

## 四、明确不做双写

不采用「上传一次 → 写 Photo → 再写 Asset」。

双写会制造：一边成功一边失败、两份 id、两套删除语义、
逐渐分叉的 metadata、重复的用户隔离规则，以及一个永远不敢删的旧表。

旧生产数据已经不存在，没有需要保护的兼容性。所以：

```
新 Asset 是唯一的写入事实
旧页面需要 Photo 形状  →  只读投影（LegacyPhotoReadAdapter）
```

`mapAssetToLegacyPhotoDto()` 只做读取投影，**不允许保存**。

---

## 五、剩余步骤

- **16B** 统一上传 Facade：旧 UI 与 Studio 调同一个 `uploadAsset`
- **16C** `LegacyPhotoReadAdapter`：把 Asset 投影成旧 Gallery 需要的 DTO
- **16D** 物理阻止：`photos` 表加写入保护（和 `trg_guard_user_delete`
  同款——事务本地、点名授权，不是布尔开关）；旧上传 API 改为调用新用例或返回 410
- **16E** 真实旧入口 E2E：从旧上传页上传 → Studio 里看得到 → 旧 Gallery 兼容视图看得到
  → `assets` 有一行 → `photos` **没有**新行 → Legacy bucket **没有**新对象

### Phase 3A 完成标准

```
所有上传入口写入 Asset
没有新 Photo 记录
没有新 Legacy Storage 对象
旧 Gallery 通过只读 adapter 显示新 Asset
任何直接的旧写入在 CI 中失败
非 active 用户在外部副作用前被拒绝        ← 已完成（15E）
失败上传不留孤儿对象
Legacy 对象真实可访问性已验证             ← 已完成（15E）
```
