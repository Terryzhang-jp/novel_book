-- ============================================================================
-- Schema hardening · 时区不再靠字符串形状猜类型
-- ============================================================================
--
-- 问题：`timezone` 一列同时装着两种**不是同一类**的数据
--
--     +09:00       固定偏移，没有夏令时规则
--     Asia/Tokyo   IANA 时区，含历史与未来的规则
--
-- 后果是所有读取方只能靠正则 `^[+-]\d{2}:\d{2}$` 猜自己拿到的是哪一种。
-- 现在只有一处猜测点；等 GPS 反查、地点推断、用户时区选择都接进来，
-- 它会扩散到多个 Service 和 Repository —— 那时候改的成本是现在的几倍。
--
-- ADR-009 的原则不变：**未知就是未知**。多出来的 `unknown` 种类让这件事
-- 从「value 是 NULL」变成一个有名字的状态。
-- ============================================================================

ALTER TABLE assets RENAME COLUMN timezone TO timezone_value;

ALTER TABLE assets
  ADD COLUMN timezone_kind text NOT NULL DEFAULT 'unknown'
    CHECK (timezone_kind IN ('offset', 'iana', 'unknown'));

-- 回填：现有数据全部是 EXIF 给的固定偏移（第一版 UI 只提供偏移量）。
-- 这里不猜 —— 按实际形状判定，判不出来的一律 unknown。
UPDATE assets
   SET timezone_kind = CASE
         WHEN timezone_value IS NULL THEN 'unknown'
         WHEN timezone_value ~ '^[+-][0-9]{2}:[0-9]{2}$' THEN 'offset'
         ELSE 'iana'
       END;

-- ── 三条互斥的形状约束 ──────────────────────────────────────────────────────
ALTER TABLE assets
  ADD CONSTRAINT chk_timezone_shape CHECK (
    (timezone_kind = 'unknown' AND timezone_value IS NULL)
    OR (timezone_kind = 'offset' AND timezone_value ~ '^[+-][0-9]{2}:[0-9]{2}$')
    OR (timezone_kind = 'iana'
        AND timezone_value ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)+$'
        -- 固定偏移**不能**被登记成 IANA 名。
        -- '+09:00' 可能是东京、首尔、雅库茨克 —— 混进来就等于伪造了时区规则。
        AND timezone_value !~ '^[+-]')
  );

-- ── T-1 重写：时区未知就没有绝对时间 ────────────────────────────────────────
-- 原来的约束依赖「timezone IS NULL」，现在依赖有名字的状态。
ALTER TABLE assets DROP CONSTRAINT chk_captured_at_requires_tz;
ALTER TABLE assets
  ADD CONSTRAINT chk_captured_at_requires_tz CHECK (
    (timezone_kind = 'unknown' AND captured_at IS NULL)
    OR (timezone_kind <> 'unknown' AND captured_at IS NOT NULL)
  );

-- T-2 同步
ALTER TABLE assets DROP CONSTRAINT chk_timezone_has_source;
ALTER TABLE assets
  ADD CONSTRAINT chk_timezone_has_source CHECK (
    timezone_kind = 'unknown' OR timezone_source <> 'unknown'
  );

-- timezone_source 补上 'ai'：一次 AI 修正当然可以针对时区，
-- 而 asset_metadata_corrections.source 里本来就有它。两个取值域不一致的话，
-- 修正链的 source 没法原样带到 Asset 上。
ALTER TABLE assets DROP CONSTRAINT assets_timezone_source_check;
ALTER TABLE assets
  ADD CONSTRAINT assets_timezone_source_check
  CHECK (timezone_source IN ('exif', 'gps_inferred', 'user', 'ai', 'unknown'));

COMMENT ON COLUMN assets.timezone_kind IS
  'offset | iana | unknown。有了它，读取方不再需要靠字符串形状猜类型（ADR-009）。';
COMMENT ON COLUMN assets.timezone_value IS
  'kind=offset 时是 ±HH:MM；kind=iana 时是 IANA 标识；kind=unknown 时必须为 NULL。';
