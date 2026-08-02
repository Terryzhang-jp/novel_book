# ADR-006 · 版本与发布

- **状态**：已接受 · 2026-08-02 · 决策人：产品负责人
- **对应评审项**：`DOMAIN-MODEL-REVIEW.md` P1–P6

---

## 定义

> Publication 是某个 **WorkVersion** 经用户明确确认后生成的**不可变发布快照**。
> 它有独立 URL 和独立可见性。

## 核心：发布是快照，不是开关

旧系统的 `is_public` 只是内容表上的一个布尔值，改内容立刻对外生效 ——
**用户在草稿状态下的每一次修改都会被外界看到**。

```
Work（一直在改） ──发布──▶ WorkVersion v3（冻结） ◀── Publication /p/abc
       │
       └── 继续改成 v4、v5…   外界仍看 v3，直到再次发布
```

## 决策

| # | 问题 | 结论 |
|---|---|---|
| P1 | 可见性 | `private` / `unlisted` / `public` / `shared`（指定邮箱，可后做） |
| P2 | slug | 用户可改；改了旧 URL 做 301，不失效 |
| P3 | 发布后改稿是否同步 | **不同步**。编辑页提示「已发布 v3，当前 v5，2 处改动未发布」 |
| P4 | 撤回 | 可以。撤回后返回「作者已下架」而**不是 404** —— 404 会让分享过链接的人以为出错 |
| P5 | 历史版本 | 保留，默认只展示最新已发布版本；历史仅作者可见 |
| P6 | 发布素材 | **必须用独立副本** —— 见下 |

### P6 · 原始素材永不公开

```
原始 Asset        private，只能通过签名 URL 访问（ADR-002）
      ↓ 发布时生成
发布副本          尺寸受控 · 去除不必要 EXIF · 独立 objectKey
                  可缓存 · 随 Publication 撤回而删除
```

**不能直接公开原图，也不能把 Signed URL 固化进 WorkVersion。**

理由：发布一篇文章不应该让原图（含完整 EXIF、GPS、完整分辨率）永久公开。
旧系统正是这个状态 —— `photos` bucket 是 public 的，
`is_public` 只控制「应用里显不显示」，不控制文件本身可访问性。

## 「秩父」的正确形态

现在 `/chichibu` 是硬编码路由 + 展示所有公开照片（且不按地区过滤）。

正确形态：**一条 Journey 产出的 Work 的一个 Publication**，
URL 是 `/p/chichibu-2025-09`。

## 与 ADR-005 的衔接

```
Work（引用 Moment，可变）
  → WorkVersion（快照，不可变）
    → Publication（可见性 + slug + 发布素材副本）
```

删 Work 不影响已发布内容；删 Publication 不影响 WorkVersion。
