-- ============================================================================
-- Phase 2A 核心领域模型
-- ============================================================================
--
-- 这份 migration 是 docs/PHASE-2-SCHEMA-CONTRACT.md 的机械翻译。
-- 每条约束在那份文件里都有对应的编号不变量（J-1 / M-4 / I-1 …）。
--
-- 依据：ADR-003 Journey 边界 · ADR-004 Moment 与理解演化
--       ADR-005 Work 唯一内容真相 · ADR-006 版本与发布
--       ADR-007 账号生命周期
--
-- ## 与遗留表的关系
--
-- 新表与遗留表（photos / documents / canvas_projects …）**并存**。
-- 遗留表不动。新表全部外键指向 Better Auth 的 "user"(id)（ADR-001）。
--
-- ## 第一版有意不建的
--
-- assets / places / journey_candidates / publication_assets /
-- slug 历史 / shared 访问名单 —— 见 schema contract 第 1 节。
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- Journey —— 一段有边界的现实外出经历
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE journeys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  -- J-1：只有两类。不引入 encounter —— 一次偶遇更像 Moment，
  -- 类型太多会让用户在开始记录前先替产品做分类作业。
  type        text NOT NULL CHECK (type IN ('trip', 'outing')),
  -- 「为什么出发」。可空 —— 不强迫用户在记录前先想清楚意图。
  intent      text,
  -- J-4：开始必填，结束可空（表示进行中）
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_journey_period CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- J-3：**刻意没有 is_public 列**。
-- ADR-003 J6「Journey 不可公开」从数据结构上杜绝，而不是靠代码自觉。
-- 公开必须经过 Work → Publication。
COMMENT ON TABLE journeys IS
  '私人体验容器。刻意没有 visibility 列 —— 公开必须经过 Work → Publication（ADR-003 J6）。';

CREATE INDEX idx_journeys_user_started ON journeys (user_id, started_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- Moment —— 有体验意义的现场单元（事实层）
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE moments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- M-1 / J-2：可空，且删 Journey 时置空而不是级联删除。
  -- Journey 是**组织方式**，Moment 是**内容** —— 删组织方式不该毁内容。
  journey_id   uuid REFERENCES journeys(id) ON DELETE SET NULL,
  title        text,
  -- 事实层：什么时候发生的。可空 —— Moment 不必须有时间。
  occurred_at  timestamptz,
  -- 第一版用自由文本，不接 Place 系统
  place_label  text,
  -- 每个事实字段的来源：{"_v":1,"occurred_at":{"source":"user"}}
  -- 旧系统的教训是手动地点覆盖 EXIF 后原值无法恢复。
  provenance   jsonb NOT NULL DEFAULT '{"_v":1}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- M-2：**没有任何 asset 外键**。Moment 不必须有照片 —— 这是产品定位的
-- 分水岭（ADR-004 M1）。第一版根本没有 assets 表，这条不变量天然成立。
COMMENT ON TABLE moments IS
  'Moment 可以没有 Journey、没有时间、没有素材 —— 只有一句观察也成立（ADR-004 M1）。';

CREATE INDEX idx_moments_user_occurred ON moments (user_id, occurred_at DESC NULLS LAST);
CREATE INDEX idx_moments_journey ON moments (journey_id) WHERE journey_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- Observation —— 当时注意到什么（观察层）
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE observations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id   uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  -- user_id 冗余一列：让「不能给别人的 Moment 追加观察」（M-5）
  -- 可以在**单表**上检查，不必每次 join moments。
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (length(btrim(content)) > 0),
  -- 什么时候**记的** —— 与 moment.occurred_at（什么时候**发生的**）不同。
  -- 现场记一条、回家再记一条，是两次不同的观察。
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_observations_moment ON observations (moment_id, recorded_at);

-- ════════════════════════════════════════════════════════════════════════════
-- InterpretationRevision —— 后来如何理解（理解层，可演化）
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE interpretation_revisions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id                uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id                  text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content                  text NOT NULL CHECK (length(btrim(content)) > 0),
  -- 指向被它取代的那一版。首版为 NULL。
  supersedes_id            uuid REFERENCES interpretation_revisions(id) ON DELETE RESTRICT,
  based_on_observation_ids uuid[] NOT NULL DEFAULT '{}',
  status                   text NOT NULL CHECK (status IN ('current', 'superseded')),
  created_at               timestamptz NOT NULL DEFAULT now(),

  -- 自己不能取代自己
  CONSTRAINT chk_no_self_supersede CHECK (supersedes_id IS DISTINCT FROM id)
);

-- I-1：一个 Moment 最多一条当前理解。
-- 没有它，UI 不知道该显示哪个「我现在的理解」。
CREATE UNIQUE INDEX uq_interpretation_current
  ON interpretation_revisions (moment_id)
  WHERE status = 'current';

-- I-5：一条 revision 只能被取代一次 —— **防分叉的关键**。
-- 没有它，两个并发请求可以同时 supersede 同一条，形成两条分支，
-- 之后无法判断哪个是当前理解。
CREATE UNIQUE INDEX uq_interpretation_supersedes
  ON interpretation_revisions (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE INDEX idx_interpretation_moment ON interpretation_revisions (moment_id, created_at);

-- I-4：supersedes 只能指向同一个 Moment 的 revision。
-- 外键做不到跨列条件，用触发器。
CREATE OR REPLACE FUNCTION check_interpretation_same_moment()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  target_moment uuid;
BEGIN
  IF NEW.supersedes_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT moment_id INTO target_moment
    FROM interpretation_revisions WHERE id = NEW.supersedes_id;
  IF target_moment IS NULL THEN
    RAISE EXCEPTION 'supersedes_id % 不存在', NEW.supersedes_id;
  END IF;
  IF target_moment <> NEW.moment_id THEN
    RAISE EXCEPTION
      '违反不变量 I-4：不能 supersede 另一个 Moment 的 revision（% vs %）',
      target_moment, NEW.moment_id;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_interpretation_same_moment
  BEFORE INSERT OR UPDATE ON interpretation_revisions
  FOR EACH ROW EXECUTE FUNCTION check_interpretation_same_moment();

-- ════════════════════════════════════════════════════════════════════════════
-- Work —— 用户真正编辑的创作对象
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE works (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (length(btrim(title)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- W-1：**刻意没有 journey_id** —— Work 可跨 Journey。
-- 体验按时间发生，表达按主题组织，这正是两者分开的理由。
-- 也刻意没有 is_public —— 公开性由 Publication 管。
COMMENT ON TABLE works IS
  'Work 可跨 Journey（ADR-005 W1），公开性由 publications 管（ADR-006）。';

CREATE INDEX idx_works_user_updated ON works (user_id, updated_at DESC);

-- ── WorkBlock —— 内容（唯一真相）─────────────────────────────────────────────

CREATE TABLE work_blocks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id      uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  position     integer NOT NULL CHECK (position >= 0),
  -- 第一版只有两种。不一上来就实现六种 —— 先证明「引用而非复制」这个模型对。
  type         text NOT NULL CHECK (type IN ('text', 'moment_ref')),
  text_content text,
  -- W-4：Moment 被删时置空，但 tombstone 留着删除那一刻的内容，
  -- 让 Work 不出现无法解释的空洞。
  moment_id    uuid REFERENCES moments(id) ON DELETE SET NULL,
  tombstone    jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_block_shape CHECK (
    (type = 'text'       AND text_content IS NOT NULL AND length(btrim(text_content)) > 0)
    OR
    (type = 'moment_ref' AND (moment_id IS NOT NULL OR tombstone IS NOT NULL))
  )
);

-- W-3：顺序唯一，且**必须可延迟** —— 重排序时中间状态会短暂撞约束，
-- 不延迟就没法在一个事务里完成重排。
ALTER TABLE work_blocks
  ADD CONSTRAINT uq_work_block_position UNIQUE (work_id, position)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_work_blocks_moment ON work_blocks (moment_id) WHERE moment_id IS NOT NULL;

-- ── WorkPresentation —— 表现（每种输出各一套）────────────────────────────────

CREATE TABLE work_presentations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id       uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  renderer_type text NOT NULL CHECK (renderer_type IN ('web', 'magazine', 'poster', 'map')),
  config        jsonb NOT NULL DEFAULT '{"_v":1}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- W-5：一个 Work 对每种输出各一套配置。
  -- 这是本轮的结构性修正：原方案把 presentation 做成 Work 上的单一字段，
  -- 会让同一 Work 的网页版式和杂志版式互相覆盖（ADR-005 修正）。
  CONSTRAINT uq_work_presentation UNIQUE (work_id, renderer_type)
);

-- ════════════════════════════════════════════════════════════════════════════
-- WorkVersion —— 不可变发布快照
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE work_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- P-5：可空 + SET NULL —— **删 Work 不删已发布版本**。
  -- 已发布的链接不该因为作者整理草稿而 404。
  work_id        uuid REFERENCES works(id) ON DELETE SET NULL,
  -- P-6：但删**账号**时必须一并删除（ADR-007 覆盖规则）。
  -- 这条 CASCADE 就是那个覆盖规则的执行手段。
  user_id        text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number >= 1),
  -- P-1 / P-3：完整快照，必须能脱离所有实时表独立渲染。
  -- 只存外键是不够的 —— Moment 或 Interpretation 一改，
  -- 旧 Publication 跟着变，那就等于没有快照。
  snapshot       jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_work_version UNIQUE (work_id, version_number),
  -- 快照必须带 schema 版本，否则将来无法安全演进
  CONSTRAINT chk_snapshot_versioned CHECK (snapshot ? '_v')
);

COMMENT ON COLUMN work_versions.snapshot IS
  '完整发布快照。渲染 Publication 时不得查询 moments / observations / '
  'interpretation_revisions / work_blocks / work_presentations 任何实时表（ADR-006）。';

CREATE INDEX idx_work_versions_work ON work_versions (work_id, version_number DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- Publication —— 发布结果
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE publications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_version_id uuid NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  -- 第一版不含 shared
  visibility      text NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
  published_at    timestamptz NOT NULL DEFAULT now(),
  -- P-4：撤回**不删记录**。删行就无法区分「作者已下架」和「从来不存在」，
  -- URL 会变成 404，而我们已经决定要显示「已下架」。
  withdrawn_at    timestamptz,

  CONSTRAINT uq_publication_slug UNIQUE (slug)
);

CREATE INDEX idx_publications_user ON publications (user_id, published_at DESC);
CREATE INDEX idx_publications_live
  ON publications (slug) WHERE withdrawn_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- updated_at 触发器
-- ════════════════════════════════════════════════════════════════════════════
-- 复用 baseline 里已有的 update_updated_at_column()

CREATE TRIGGER trg_journeys_updated_at BEFORE UPDATE ON journeys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_moments_updated_at BEFORE UPDATE ON moments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_works_updated_at BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_work_blocks_updated_at BEFORE UPDATE ON work_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_work_presentations_updated_at BEFORE UPDATE ON work_presentations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════════════════════
-- 关于 RLS
-- ════════════════════════════════════════════════════════════════════════════
--
-- **新表刻意不启用 RLS。**
--
-- ADR-001：一个「看起来在保护、实际被 service_role 全部绕过」的 RLS 比没有
-- 更危险 —— 它制造虚假的安全感。遗留表上那 26 条策略正是这个状态
-- （auth.uid() 恒为 NULL）。
--
-- 新核心的安全边界是：
--   应用层 Actor 授权 + Repository 里带 user_id 条件的 SQL + 集成测试证明
--
-- 未来要加 RLS 必须先满足 ADR-001 的三个前提：受限角色、SET LOCAL 传身份、
-- 每条策略有对应的集成测试。

COMMIT;
