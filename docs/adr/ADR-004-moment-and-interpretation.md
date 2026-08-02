# ADR-004 · Moment 与理解的演化

- **状态**：已接受 · 2026-08-02 · 决策人：产品负责人
- **对应评审项**：`DOMAIN-MODEL-REVIEW.md` M1 / M4 / M7

---

## 定义

> Moment 是一个**具有体验意义的现场单元**。不是一张照片，也不是一个时间点，
> 而是「我在这里注意到了什么、以及我因此理解了什么」。

## 三层结构

```
事实 Facts          时间、地点、素材、数据来源      客观，不可覆盖
观察 Observation    当时注意到什么、感受到什么      主观但当场，可多条
理解 Interpretation 后来如何解释它、原判断如何改变  事后，可演化
```

**必须在数据结构上分开**，否则事后的想法会污染当时的记录。

## 决策

### M1 · Moment 不必须有照片 ← 产品定位的分水岭

只有语音、文字或现场感受也可以形成 Moment。照片是 `Asset`，
是 Moment 的**证据之一**，不是它成立的必要条件。

若要求必须有照片，产品中心仍然是 Photo，只是改名叫 Moment。

### M4 · Moment 最多属于一个 Journey，可以暂时不属于任何 Journey

```
journey_id  nullable，不是多对多
```

评审指出原方案「必须属于一个 Journey」与「删 Journey 后进入未归类」
在数据库层冲突。改成可空之后自然支持四件事：

- 现场先快速记录，之后再整理
- 删除或拆分 Journey
- 自动分组尚未确认
- 未归类 Moment 收件箱

### M7 · 理解保留历史，且不是一个反复覆盖的字符串

```
InterpretationRevision
  id
  momentId
  content
  createdAt
  supersedesId              指向被它取代的那一版（首版为 NULL）
  basedOnObservationIds     这次理解基于哪些观察
  status                    current | superseded
```

#### 基数：每个 Moment 最多一个 current，revision 是**单一线性链**

```
一个 Moment
  · 可以没有 Interpretation
  · 最多只有一个 status = 'current' 的 revision
  · revision 形成单一线性链，不分叉
```

数据库层强制三条：

```sql
-- ① 一个 Moment 只能有一条当前理解
CREATE UNIQUE INDEX uq_interpretation_current
  ON interpretation_revisions (moment_id) WHERE status = 'current';

-- ② supersedes 必须指向同一个 Moment 的 revision（触发器，见 schema contract）
-- ③ 首版 supersedes_id 为 NULL；非首版必须指向当时的 current
```

不加这三条，很快会出现：
- 两个 current，UI 不知道该显示哪个
- revision 跨 Moment 连接，历史链断裂
- 分叉之后无法判断「我现在的理解」是哪一条

**暂不支持分叉理解。** 将来确实需要「同一 Moment 产生多个独立理解主题」时
再引入 `InterpretationThread` —— 不在第一版预先建复杂图结构。
过早的通用性会让最简单的场景（看自己想法怎么变）也变得难写。

比给整个 Moment 做版本化更准确：变化的是**解释**，不是事实和观察。

这支撑的是产品最独特的长期价值：

```
旅行当晚的理解 → 一周后的理解 → 和另一段旅行比较后的新理解
```

「一个地方如何改变了我以后理解和选择的方式」—— 这条链是产品灵魂。
`DOMAIN-MODEL-REVIEW.md` 的场景 5 就是它。

### 事实层：来源可追溯，原始值不可覆盖

旧系统的教训：手动地点覆盖 EXIF 之后**无法恢复原值**。

```
每个可被修改的字段带
  provenance   exif | user | ai | derived
  confidence   AI 推断时必填
原始值与用户修正值分列存储
```

AI 推断的字段被用户纠正后不得再被覆盖。

### 观察层：允许多条并保留时间

不是 `observation: string`，而是 `Observation[]` ——
用户可能在现场和回家后分别记录不同观察。

## 其他确认项

| 问题 | 结论 |
|---|---|
| 只有语音 | 可以。存为 `Asset(type='audio')`，转写文本作为观察初稿 |
| 多个地点 | 可以，但区分「主地点」（用于地图和分组）与「路径」 |
| 被多个 Work 引用 | 可以 —— 见 ADR-005 |
| 删除后 Work 怎么办 | 留墓碑块，显示删除时的快照文本，不可编辑。不级联删 Work |

## 反例

- 「在秩父拍的 47 张照片」→ 素材集合，没有观察也没有理解
- 「秩父很好」→ 感想，缺具体现场和证据。可以是雏形，但缺 observation
- 「我觉得日本的城市规划值得学习」→ 跨多个 Moment 的**结论**，属 Work 层
