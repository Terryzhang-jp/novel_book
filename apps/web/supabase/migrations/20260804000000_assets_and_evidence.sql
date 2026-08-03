-- ============================================================================
-- Phase 2B · Asset / 证据关系 / 元数据修正 / 发布派生副本
-- ============================================================================
--
-- 依据：ADR-008（Asset 是证据）、ADR-009（未知就是未知）
--       docs/PHASE-2B-SCHEMA-CONTRACT.md
--
-- 约束名与 contract 里的编号一一对应（A-1、T-1、MA-3、C-1、PA-1…），
-- 测试里的断言也引用同一个编号。三处对不上就是有人改了其中一处没改另外两处。
--
-- ⚠️ 这份 migration 里最重要的不是四张表，是那几条**拦住越权和伪造**的约束。
--    表可以重建，被伪造进去的时间戳没人能还原。
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- assets —— 不可变的媒体素材
-- ════════════════════════════════════════════════════════════════════════════
--
-- 刻意没有的列（ADR-008 A4）：
--   title / caption / tags / category / is_public
--   observation / interpretation / x / y / scale / filter
--   thumbnail_url / file_url
--
-- 每加一个，产品中心就向素材偏移一点。旧系统就是这么变成
-- 「照片墙 + 附属说明」的。

CREATE TABLE assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- video 保留在取值域里为将来留位置，但上传用例拒绝它（A-5）。
  -- 数据库允许 ≠ 产品支持。
  type        text NOT NULL CHECK (type IN ('image', 'audio', 'video')),

  -- users/{userId}/sha256/{ab}/{hash}.{ext}。**不存 URL**（ADR-002）——
  -- URL 是运行时由当前 adapter 生成的，换供应商不该改数据。
  object_key  text NOT NULL,
  sha256      text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type   text NOT NULL,
  byte_size   bigint NOT NULL CHECK (byte_size > 0),

  width       integer CHECK (width > 0),
  height      integer CHECK (height > 0),
  duration_ms integer CHECK (duration_ms > 0),

  -- ── 时间：四个字段，不是一个（ADR-009 T1）──────────────────────────────
  -- captured_local_at 是相机记下的**墙上时间**，没有时区。
  -- 类型必须是 timestamp WITHOUT time zone —— 用 timestamptz 存它，
  -- Postgres 会按会话时区解释，等于系统替相机决定了它在哪个国家。
  captured_local_at   timestamp,
  captured_at         timestamptz,
  timezone            text,
  timezone_source     text NOT NULL DEFAULT 'unknown'
                        CHECK (timezone_source IN ('exif','gps_inferred','user','unknown')),
  timezone_confidence real CHECK (timezone_confidence >= 0 AND timezone_confidence <= 1),

  -- 上传时提取的原始元数据。**不可变**（T-4 触发器强制）
  original_metadata jsonb NOT NULL DEFAULT '{"_v":1}'::jsonb,

  -- 裁剪 / 滤镜产生新 Asset，指回来源（A1）。
  -- SET NULL 而不是 CASCADE：删了原图不该把编辑结果一起删掉。
  derived_from_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  -- A-3：没有尺寸的图片无法在发布时正确排版，也无法判断是否需要缩放
  CONSTRAINT chk_asset_dimensions CHECK (
    (type <> 'image' OR (width IS NOT NULL AND height IS NOT NULL))
    AND
    (type <> 'audio' OR duration_ms IS NOT NULL)
  ),

  -- A-4
  CONSTRAINT chk_asset_no_self_derive CHECK (derived_from_asset_id IS DISTINCT FROM id),

  -- ── T-1：时区未知时绝不伪造绝对时间 ────────────────────────────────────
  -- 写成 CHECK 而不是靠代码自觉，是因为「顺手补一个默认值」这类改动
  -- 在 code review 里看起来永远是无害的。
  CONSTRAINT chk_captured_at_requires_tz CHECK (
    (captured_at IS NULL AND timezone IS NULL)
    OR (captured_at IS NOT NULL AND timezone IS NOT NULL)
  ),

  -- T-2
  CONSTRAINT chk_timezone_has_source CHECK (
    timezone IS NULL OR timezone_source <> 'unknown'
  ),

  -- T-3：没有置信度就无法与「用户确认过的值」区分，下一次推断会覆盖它
  CONSTRAINT chk_inferred_tz_has_confidence CHECK (
    timezone_source <> 'gps_inferred' OR timezone_confidence IS NOT NULL
  )
);

COMMENT ON TABLE assets IS
  '不可变的媒体素材。它在这个产品里的身份是「证据」，不是内容中心（ADR-008）。';
COMMENT ON COLUMN assets.captured_local_at IS
  '相机记下的墙上时间，无时区。用 timestamp WITHOUT time zone —— '
  '换成 timestamptz 会让 Postgres 按会话时区解释它（ADR-009 T1）。';
COMMENT ON COLUMN assets.original_metadata IS
  '上传时提取的原始元数据，不可变。修正走 asset_metadata_corrections（ADR-009 T6）。';

-- A-1：同一用户 + 同一字节 = 同一个 Asset。
-- 允许两行共用一个 object_key 就需要跨行引用计数，
-- 而 ADR-002 的整个设计前提是不需要引用计数。
CREATE UNIQUE INDEX uq_assets_user_sha256 ON assets (user_id, sha256);

CREATE INDEX idx_assets_user_created ON assets (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_derived_from ON assets (derived_from_asset_id)
  WHERE derived_from_asset_id IS NOT NULL;

-- ── A-2：object_key 必须落在该用户的命名空间内 ────────────────────────────
-- 这是授权与路径穿越的**最后一道数据库防线**。
-- CHECK 做不到（需要引用另一列拼前缀），所以用触发器。
CREATE OR REPLACE FUNCTION assert_object_key_namespace() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected text;
BEGIN
  expected := 'users/' || NEW.user_id || '/sha256/';
  IF position(expected in NEW.object_key) <> 1 THEN
    RAISE EXCEPTION
      '违反不变量 A-2：object_key 不在该用户的命名空间内（期望前缀 %，实际 %）',
      expected, NEW.object_key;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assets_object_key_namespace
  BEFORE INSERT OR UPDATE OF object_key, user_id ON assets
  FOR EACH ROW EXECUTE FUNCTION assert_object_key_namespace();

-- ── T-4 / A1：不可变字段 ──────────────────────────────────────────────────
-- 旧系统把编辑后的图覆盖原字段、把原图塞进 original_file_url，
-- 结果是编辑两次之后第一次的结果永远消失，而且同一张图产生了 7 份
-- 说不清来源的副本（PERFORMANCE-AUDIT 第六组）。
--
-- 这里直接让数据库拒绝改写。
CREATE OR REPLACE FUNCTION assert_asset_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.object_key IS DISTINCT FROM OLD.object_key
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.original_metadata IS DISTINCT FROM OLD.original_metadata
  THEN
    RAISE EXCEPTION
      '违反不变量 T-4：Asset 的字节与原始元数据不可变。'
      '编辑请创建新的 Asset 并用 derived_from_asset_id 指回来源。';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assets_immutable
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assert_asset_immutable();

-- ════════════════════════════════════════════════════════════════════════════
-- moment_assets —— 证据关系
-- ════════════════════════════════════════════════════════════════════════════
--
-- 不是 moment.asset_ids[]。那个只能回答「这个 Moment 有几张照片」，
-- 而产品的原始命题是：什么证据支持我的观察？什么东西让我改变了理解？

CREATE TABLE moment_assets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id  uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,

  -- MA-4：RESTRICT 而不是 CASCADE。
  -- 删除 Asset 走软删除；有人绕过软删除硬删时，让数据库直接拒绝，
  -- 而不是静默地把用户 Moment 里的证据抹掉。
  asset_id   uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,

  -- contradicting 是这个产品和「相册」的分界线：
  -- 如果一张照片只能是支持性的，系统就默认了用户的理解不会被推翻。
  role       text NOT NULL DEFAULT 'supporting'
               CHECK (role IN ('supporting', 'contradicting', 'context')),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- MA-1：同一张素材在同一个 Moment 里只出现一次。
  -- 想表达两种角色，说明那是两段不同的观察。
  CONSTRAINT uq_moment_asset UNIQUE (moment_id, asset_id)
);

-- MA-2：与 work_blocks 同款 DEFERRABLE，让重排能在一个事务里一次改完，
-- 不用先挪到临时的负数位置
ALTER TABLE moment_assets
  ADD CONSTRAINT uq_moment_asset_order UNIQUE (moment_id, sort_order)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_moment_assets_asset ON moment_assets (asset_id);

-- ── MA-3：Moment 与 Asset 必须同属一人 ────────────────────────────────────
-- 和 W-2 / J-3 同一个理由：迁移脚本、批处理、未来修 bug 时加的新入口
-- 都不会经过用例层，而这类越权用户看不见 ——
-- 只会某天发现自己没公开过的素材出现在别人的作品里。
CREATE OR REPLACE FUNCTION assert_moment_asset_same_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  moment_owner text;
  asset_owner  text;
BEGIN
  SELECT user_id INTO moment_owner FROM moments WHERE id = NEW.moment_id;
  SELECT user_id INTO asset_owner  FROM assets  WHERE id = NEW.asset_id;

  IF moment_owner IS DISTINCT FROM asset_owner THEN
    RAISE EXCEPTION
      '违反不变量 MA-3：Moment 与 Asset 不属于同一个用户（% vs %）',
      moment_owner, asset_owner;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_moment_asset_same_owner
  BEFORE INSERT OR UPDATE OF moment_id, asset_id ON moment_assets
  FOR EACH ROW EXECUTE FUNCTION assert_moment_asset_same_owner();

-- ════════════════════════════════════════════════════════════════════════════
-- asset_metadata_corrections —— append-only 的修正链
-- ════════════════════════════════════════════════════════════════════════════
--
-- 与 interpretation_revisions 是同一个模式：不覆盖，只追加。
--
-- 旧系统的教训：手动地点覆盖 EXIF 之后原值无法恢复，而且下一次推断会把
-- 手动修正覆盖回去 —— 因为系统分不清「用户定的」和「上次推断的」。

CREATE TABLE asset_metadata_corrections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  field       text NOT NULL
                CHECK (field IN ('captured_local_at','timezone','gps','orientation')),
  value       jsonb NOT NULL,
  source      text NOT NULL CHECK (source IN ('user','ai','gps_inferred')),
  confidence  real CHECK (confidence >= 0 AND confidence <= 1),
  supersedes_id uuid REFERENCES asset_metadata_corrections(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- C-3
  CONSTRAINT chk_correction_no_self_supersede CHECK (supersedes_id IS DISTINCT FROM id),

  -- C-4：推断必须带置信度，否则无法与用户确认过的值区分
  CONSTRAINT chk_correction_confidence CHECK (
    source = 'user' OR confidence IS NOT NULL
  )
);

-- C-1：防分叉。与 uq_interpretation_supersedes 完全同款 ——
-- 没有它，两个并发请求能同时 supersede 同一条，
-- 之后无法判断「当前生效的修正」是哪条。
CREATE UNIQUE INDEX uq_correction_supersedes
  ON asset_metadata_corrections (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE INDEX idx_corrections_asset_field
  ON asset_metadata_corrections (asset_id, field, created_at);

-- C-2：supersede 的目标必须是同一个 asset 的同一个 field。
-- 对应 interpretation_revisions 的 I-4。
CREATE OR REPLACE FUNCTION assert_correction_same_target() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_asset uuid;
  target_field text;
BEGIN
  IF NEW.supersedes_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT asset_id, field INTO target_asset, target_field
    FROM asset_metadata_corrections WHERE id = NEW.supersedes_id;

  IF target_asset IS NULL THEN
    RAISE EXCEPTION 'supersedes_id % 不存在', NEW.supersedes_id;
  END IF;
  IF target_asset <> NEW.asset_id OR target_field <> NEW.field THEN
    RAISE EXCEPTION
      '违反不变量 C-2：只能取代同一个 Asset 的同一个字段（% / % vs % / %）',
      target_asset, target_field, NEW.asset_id, NEW.field;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_correction_same_target
  BEFORE INSERT OR UPDATE ON asset_metadata_corrections
  FOR EACH ROW EXECUTE FUNCTION assert_correction_same_target();

-- ════════════════════════════════════════════════════════════════════════════
-- published_assets —— 发布派生副本
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ 这张表**不在读取路径上**（ADR-008 A10）。
--    页面渲染和 /p/{slug}/a/{hash} 都只读 publications + work_versions。
--    因此它也**不加入**「五张实时表改名后仍能渲染」那条测试的清单 ——
--    加进去等于承认它在路径上。
--
-- 它只用于三件事：账号删除时清理派生对象、对账、避免重复派生。

CREATE TABLE published_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_version_id uuid NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,

  -- PA-2：SET NULL —— **原始 Asset 被删不影响已发布副本**。
  -- 这是「旧作品保留当时的表达」在素材层的对应物。
  source_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,

  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  sha256     text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type  text NOT NULL,
  width      integer NOT NULL CHECK (width > 0),
  height     integer NOT NULL CHECK (height > 0),
  byte_size  bigint NOT NULL CHECK (byte_size > 0),

  -- 第一版只有一个预设。做响应式多尺寸之前先把链路跑通。
  preset     text NOT NULL CHECK (preset IN ('web1600')),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- PA-1
  CONSTRAINT uq_published_asset UNIQUE (work_version_id, sha256)
);

COMMENT ON TABLE published_assets IS
  '发布派生副本的账本。不在读取路径上 —— 渲染与资源路由只读 '
  'publications + work_versions（ADR-008 A10）。';

CREATE INDEX idx_published_assets_user ON published_assets (user_id);
CREATE INDEX idx_published_assets_source ON published_assets (source_asset_id)
  WHERE source_asset_id IS NOT NULL;

-- PA-3：同 A-2，派生对象也必须落在该用户的命名空间内
CREATE TRIGGER trg_published_assets_object_key_namespace
  BEFORE INSERT OR UPDATE OF object_key, user_id ON published_assets
  FOR EACH ROW EXECUTE FUNCTION assert_object_key_namespace();
