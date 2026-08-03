-- ============================================================================
-- Phase 2C · Renderer 版本化，一个 Work 多个 Publication
-- ============================================================================
--
-- 依据：ADR-010
--
-- 两个变化：
--   1. renderer_type 从 web/magazine/poster/map 收敛成**已实现的两个**
--   2. work_versions 带上 renderer_type，版本线按 renderer 分开
--
-- 第 2 条是「一个 Work 两个 Publication」的地基：narrative 发到第 3 版时
-- gallery 可能还在第 1 版，这是正常的，不该互相挤占版本号。
-- ============================================================================

-- ── work_presentations ──────────────────────────────────────────────────────
-- 'web' 是 Phase 2A 的唯一 renderer，它就是今天的 narrative。
UPDATE work_presentations SET renderer_type = 'narrative' WHERE renderer_type = 'web';

ALTER TABLE work_presentations DROP CONSTRAINT work_presentations_renderer_type_check;
ALTER TABLE work_presentations
  ADD CONSTRAINT work_presentations_renderer_type_check
  CHECK (renderer_type IN ('narrative', 'gallery'));

-- 取值域里只列**已经实现**的 renderer，不为将来占位。
-- 占位的取值域会让「数据库允许 = 产品支持」这个误解一直存在。
COMMENT ON COLUMN work_presentations.renderer_type IS
  '已实现的 renderer。加新的必须同时有渲染代码和 RENDERER_VERSIONS 条目（ADR-010）。';

-- ── work_versions ───────────────────────────────────────────────────────────
-- 冗余一列 renderer_type（真相仍在 snapshot 里）。
-- 理由：findByWork(work, renderer) 是热路径，用 snapshot->>'…' 查 JSON
-- 既写不出索引，也让「这个版本属于哪个 renderer」这件事藏在 JSON 深处。
ALTER TABLE work_versions
  ADD COLUMN renderer_type text NOT NULL DEFAULT 'narrative'
    CHECK (renderer_type IN ('narrative', 'gallery'));

-- 版本线按 renderer 分开
ALTER TABLE work_versions DROP CONSTRAINT uq_work_version;
ALTER TABLE work_versions
  ADD CONSTRAINT uq_work_version UNIQUE (work_id, renderer_type, version_number);

DROP INDEX idx_work_versions_work;
CREATE INDEX idx_work_versions_work
  ON work_versions (work_id, renderer_type, version_number DESC);

COMMENT ON COLUMN work_versions.renderer_type IS
  'snapshot.presentation.rendererType 的冗余列，用于按 renderer 查版本线。'
  '真相在 snapshot 里 —— 这一列只是索引用的投影。';

-- ── 一致性：冗余列必须和快照里的真相一致 ────────────────────────────────────
-- 冗余最大的风险是两边不一致之后没人知道哪个对。
-- 让数据库直接拒绝不一致的写入，冗余就是安全的。
CREATE OR REPLACE FUNCTION assert_version_renderer_matches() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  in_snapshot text;
BEGIN
  in_snapshot := NEW.snapshot -> 'presentation' ->> 'rendererType';
  -- v1 快照没有这个结构，读取时才升级（ADR-010 R6），所以允许为空
  IF in_snapshot IS NULL THEN
    RETURN NEW;
  END IF;
  IF in_snapshot IS DISTINCT FROM NEW.renderer_type THEN
    RAISE EXCEPTION
      '违反不变量 PR-3：renderer_type 列（%）与快照里的（%）不一致',
      NEW.renderer_type, in_snapshot;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_version_renderer_matches
  BEFORE INSERT OR UPDATE OF renderer_type, snapshot ON work_versions
  FOR EACH ROW EXECUTE FUNCTION assert_version_renderer_matches();
