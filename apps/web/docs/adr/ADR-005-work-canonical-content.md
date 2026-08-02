# ADR-005 · Work 的唯一内容真相

- **状态**：已接受 · 2026-08-02 · 决策人：产品负责人
- **对应评审项**：`DOMAIN-MODEL-REVIEW.md` W1 / W4 / M5

---

## 定义

> Work 是用户对 Moment、素材和文字进行**选择、组织和表达**后形成的可编辑
> 创作对象。它只描述「内容是什么、按什么顺序」，**不描述「长什么样」**。

## 决策

### 内容与表现严格分离

```
Work
├── content: Block[]              ← 语义
│     TextBlock / AssetBlock / MomentRefBlock
│     MapBlock / QuoteBlock / ComparisonBlock
└── presentation: Presentation    ← 样式
      theme / layout / typography / output
```

旧系统的 `CanvasElement` 把 `text`（内容）和 `x/y/rotation/fontSize/fill`
（表现）平铺在同一个对象上。后果是「同一份内容换个版式」做不到，
用户必须一开始选工具 = **提前选定最终输出格式**。

分开之后，输出格式只是 Work 的不同 Renderer：

```
              ┌── Web Renderer      → 网页长文
Work.content ─┼── Magazine Renderer → A4 杂志（Konva）
              ├── Poster Renderer   → 社交海报
              └── Map Renderer      → 主题地图
```

### W4 · Tiptap 和 Konva 编辑同一个 Work，但更准确地说

```
Tiptap  编辑 Work.content        结构：顺序、语义、文字
Konva   编辑 Work.presentation   表现：这一页怎么摆
```

**绝不能各自保存一份内容真相。** Konva 保存的是「这个 Block 放在哪、
多大、旋转多少、用什么样式」，而不是复制一份文字和图片。

这条不成立，四套渲染引擎就收敛不了 —— 只会变成「更漂亮的工具集合」。

### M5 · 编辑时引用 Moment，发布时快照

评审的修正很关键，不是二选一：

```
编辑状态    Work → 引用 Moment      Moment 更新能进入正在创作的作品
发布状态    Publication → WorkVersion 快照   已发布内容不会被后续修改改变
```

只引用不快照 → 用户改 Moment，已发布文章悄悄变化。
只快照不引用 → 退化成旧的 Document / CanvasProject，改一处要改很多处。

### W1 · Work 可以跨 Journey

体验按时间发生，表达按主题组织 —— 这正是 Journey 与 Work 分开的理由。

「三个城市的楼梯」这类主题作品成立，依赖 W1 + M5 两条同时为真。

## 关于「Moment 是唯一接口」的修正

评审指出原表述过于绝对：文档同时允许 Work 有自由 TextBlock 和独立
AssetBlock，与「唯一接口」矛盾。

改为：

> **Moment 是体验层进入创作层的主要语义接口；
> Work 也允许直接包含自由文字和独立素材。**

前言、结语、过渡段落不需要挂在 Moment 上。

## 其他确认项

| 问题 | 结论 |
|---|---|
| Work 是否有版本 | 有，但**只在发布时**生成快照。编辑期用简单自动保存 |
| Work 删除后 Publication | 保留 —— 指向已冻结的 WorkVersion |
| 一个 Work 多种输出 | 可以，多个 Publication 各用不同 Renderer |
| 哪些属于内容、哪些属于表现 | 语义与顺序是内容；坐标、字体、颜色、尺寸是表现 |

## 反例

- 「我的所有照片」→ 素材库
- 「秩父之行」→ Journey。基于它做的游记才是 Work
- 「A4 杂志」→ 输出格式，是 Renderer
- 「海报模板 #3」→ Presentation 预设
