# ADR-009 · 未知就是未知：时间与地点的语义

- **状态**：提议
- **日期**：2026-08-03
- **决策人**：产品负责人
- **前置**：ADR-004（Moment 三层与 provenance）、ADR-008（Asset 是证据）

---

## 背景

Phase 2A 的报告里如实写着：时间按 UTC 原样显示。
在一个**旅行**产品里，这不是 UI 细节。

大多数相机的 EXIF 只有：

```
DateTimeOriginal: 2026:08:03 14:35:00
```

**没有时区。** 这串数字的意思是「相机所在地的墙上时钟指向 14:35」。
它可能是东京的 14:35，也可能是伦敦的 14:35 —— 相差 8 小时，
而这 8 小时会把「傍晚」变成「中午」，把两天的照片排错顺序。

系统面对这种数据只有三条路：

1. 当成 UTC —— 于是东京下午三点的照片显示成「凌晨」
2. 当成服务器时区 —— 于是同一张照片在不同部署上显示不同时间
3. 当成用户当前时区 —— 于是用户回国后，旅途中的照片集体偏移

**三条都是在伪造一个系统并不知道的事实。**

这个产品的核心是「保存当时的自己」。把 14:35 说成别的时间，
就是在最基础的层面上背叛这件事。

---

## 决策

### T1 · 时间拆成四个字段，不是一个

```
capturedLocalAt      timestamp WITHOUT time zone   相机记下的墙上时间
capturedAt           timestamptz                   NULL until 时区已知
timezone             text                          'Asia/Tokyo'，可空
timezoneSource       exif | gps_inferred | user | unknown
timezoneConfidence   real                          可空，仅推断时有意义
```

对应关系：

| 已知条件 | capturedLocalAt | timezone | capturedAt |
|---|---|---|---|
| EXIF 带 OffsetTimeOriginal | 14:35 | 由 offset 得 | ✅ 可算 |
| EXIF 只有本地时间 | 14:35 | `NULL` | **`NULL`** |
| 有 GPS，可反查时区 | 14:35 | 推断，记 confidence | ✅ 可算 |
| 用户手动指定时区 | 14:35 | `source='user'` | ✅ 可算 |

### T2 · 时区未知时，`capturedAt` 必须是 NULL

**不允许**用服务器时区、用户当前时区、Journey 的目的地、
或者「大概率是这个」来悄悄补全。

数据库层强制：

```sql
CONSTRAINT chk_captured_at_requires_tz CHECK (
  (captured_at IS NULL AND timezone IS NULL)
  OR (captured_at IS NOT NULL AND timezone IS NOT NULL)
)
```

写成 CHECK 而不是靠代码自觉，是因为这类「顺手补一个默认值」的改动
在 code review 里看起来永远是无害的。

#### 这意味着排序会有一类无序数据

有 `capturedAt` 的和没有的无法严格比较。**这是事实，不是缺陷。**
处理方式是显式的：先按 `capturedLocalAt` 排（同一次旅行里相机时钟一致，
这个顺序是对的），时区已知的再作为精确锚点。

不做的是：给未知的填一个假值让 `ORDER BY` 好写。

### T3 · 显示规则

| 情况 | 显示 |
|---|---|
| 时区已知 | `2026-08-03 14:35 (Asia/Tokyo)` |
| 时区未知 | `2026-08-03 14:35 · 相机本地时间，时区未知` |
| 无时间 | `时间未知` |

时区未知时**既不转换也不标 UTC**。标 UTC 是在断言一件没被断言过的事。

「时区未知」这几个字应该是可点击的 —— 它是一个邀请：
用户知道自己那天在哪，补一次时区，这段记录就完整了。

### T4 · Asset 的时间是证据，不自动成为 Moment 的时间

Moment 有自己的 `occurredAt`（何时发生），Asset 有自己的
`capturedLocalAt`（何时拍摄）。**两者不同步。**

理由：一段经历可以在结束几小时后才被记录，也可以用第二天补拍的照片
作为证据。把 Asset 的时间直接写进 Moment，等于宣称「体验发生在快门按下的
那一刻」—— 而这正是旧系统以 Photo 为中心留下的假设。

「用这张照片的时间」是一个**显式动作**。执行后：

```json
{ "_v": 1, "occurredAt": { "source": "derived", "recordedAt": "…" } }
```

`provenance` 记 `source='derived'`，于是「这个时间是从素材推出来的」
将来可查，也不会被下一次推断静默覆盖用户的手动修正（ADR-004）。

### T5 · GPS 同理

Asset 的 GPS 坐标是**事实**。Moment 的 `placeLabel` 是**用户的表述**。

「秩父神社」和 `35.9926, 139.0856` 不是同一层的东西：前者是这个人怎么称呼
那个地方，后者是设备记录的数字。自动把反查地址填进 `placeLabel`，
用户就再也写不出「那家没有招牌的店」。

同 T4：反查是显式动作，落进 provenance 的 `source='derived'`。

### T6 · EXIF 原值不可覆盖，修正另存

`assets.original_metadata` 是**不可变**的 jsonb —— 上传时提取，此后永不 UPDATE。

用户的修正写进独立的 append-only 表：

```
asset_metadata_corrections
├── assetId
├── field           'capturedLocalAt' | 'timezone' | 'gps' | …
├── value           jsonb
├── source          user | ai | gps_inferred
├── confidence      可空
├── supersedesId    上一次修正，可空
└── createdAt
```

读取时的合成规则：**同一 field 取最新一条修正；没有修正则回落到原值。**

#### 为什么是 append-only 而不是直接改字段

旧系统的教训写在 `packages/domain/src/moment.ts` 的注释里：
手动地点覆盖 EXIF 之后**原值无法恢复**。用户改错了没有退路，
而且下一次 AI 推断会把手动修正再覆盖回去 —— 因为系统分不清
「这个值是用户定的」和「这个值是上次推断的」。

append-only 让三件事同时成立：原值永远在、每次修正有来源、
AI 推断不会覆盖 `source='user'` 的修正。

它和 ADR-004 的 Interpretation 修订链是**同一个模式**：
不覆盖，只追加，链上每一版都还在。

---

## 后果

### 得到什么

- 系统不再伪造它不知道的事实
- 「时区未知」变成一个用户可以修复的状态，而不是一个隐藏的错误
- EXIF 原值永久可追溯，用户修正有来源、有历史
- Moment 的时间和地点保持是**用户的表述**，不被设备数据同化

### 付出什么

- 时间字段从 1 个变成 4 个，每处显示都要处理「时区未知」分支。
  缓解：封装成一个 `formatCapturedTime()` 纯函数，UI 不各写各的
- 排序有一类无序数据（见 T2）
- 多一张 corrections 表，读取时要做一次合成

### 明确不做

| 不做 | 理由 |
|---|---|
| 内置时区数据库做 GPS→时区反查 | 需要 tz 边界数据，体积和更新都不小。第一版留接口，`timezoneSource='gps_inferred'` 先空着 |
| 地址反查（geocoding） | 依赖外部服务，且 T5 已经决定它不自动写进 placeLabel |
| 自动按时间聚类成 Journey | 明确在「暂不接」清单里 |
| 猜测时区 | 整份 ADR 就是为了不做这件事 |

---

## 验收

- [ ] EXIF 只有本地时间的照片：`capturedLocalAt` 有值，`timezone` 和 `capturedAt` 都是 NULL
- [ ] 尝试在 `timezone IS NULL` 时写入 `captured_at` → 数据库拒绝
- [ ] 界面显示「相机本地时间，时区未知」，**不显示 UTC，也不做转换**
- [ ] 用户补时区后，`capturedAt` 被算出来，`timezoneSource='user'`
- [ ] `original_metadata` 在任何修正之后都保持不变（逐字节比较）
- [ ] 用户修正过的字段，再跑一次推断**不会**被覆盖
- [ ] Moment 的 `occurredAt` 不会因为挂上一个 Asset 而自动改变
- [ ] 显式执行「用这张照片的时间」后，provenance 记 `source='derived'`

## 相关

- ADR-004 Moment 与理解修订（同一个「不覆盖，只追加」模式）
- ADR-008 Asset 是证据
- `packages/domain/src/moment.ts` 的 provenance 注释（旧系统的原值丢失事故）
