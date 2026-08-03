-- ============================================================================
-- 冻结遗留 Photo 写入 —— Phase 3A / 16D
-- ============================================================================
--
-- Phase 3A 要证明的是一句可判定的话：
--
--     **从这个 migration 起，系统不再产生新的 Legacy Photo 数据。**
--
-- 16A 已经用 scripts/check-architecture.mjs 在 CI 里挡住了新增的写入代码。
-- 但静态门禁有两个够不着的地方：
--
--   · 它只看 apps/web 的源码。运维脚本、psql 会话、将来某个后台任务
--     都在它的视野之外
--   · 它检查的是**形状**。一段绕开已知形状的写法（拼 SQL、动态表名、
--     经由某个封装）照样能过
--
-- 所以最后一道要在数据库里。门禁挡住的是「有人不小心写了」，
-- 这个触发器挡住的是「不管用什么方式，它就是写不进去」。
--
-- ── 为什么是点名授权，不是布尔开关 ──────────────────────────────────────
--
-- 和 trg_guard_user_delete（20260807000000）同一个模式：
--
--     SELECT set_config('tc.allow_legacy_photo_write', '<那一行的 id>', true);
--
-- 第三个参数 `true` 表示**事务本地** —— 事务一结束授权就消失，
-- 不会残留在连接池的 session 上被下一个请求捡到。
--
-- 布尔开关一旦打开，`UPDATE photos SET ...` 不带 WHERE 就能改光整张表。
-- 要求逐行点名之后，一条语句最多只能动一行。
--
-- ── 为什么只管 INSERT 和 UPDATE ────────────────────────────────────────
--
-- DELETE 必须保持畅通：`photos.user_id` 上挂着 ON DELETE CASCADE，
-- 永久删除账号时那一路要能跑完。挡住 DELETE 等于让「你的东西你能删掉」
-- 这条承诺在遗留表上失效 —— 那比多留几行旧数据严重得多。
--
-- 这和 15B 的 require_active_owner 是同一个判断：**减少内容的操作始终放行，
-- 增加或改写内容的操作才需要理由。**

-- ── 1. 守门函数 ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION guard_legacy_photo_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- current_setting(..., true) 在没设置时返回 NULL 而不是报错
  IF current_setting('tc.allow_legacy_photo_write', true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION
      '禁止写入遗留 photos 表（id=%，操作=%）。新素材一律走 uploadAsset → '
      'assets + ObjectStorage；旧 Gallery 通过只读投影显示 Asset '
      '（mapAssetToLegacyPhotoDto）。'
      '确有一次性数据修复的必要时，在同一个事务里 '
      'SELECT set_config(''tc.allow_legacy_photo_write'', ''<那一行的 id>'', true) '
      '逐行点名放行。见 docs/LEGACY-WRITE-INVENTORY.md。',
      NEW.id, TG_OP
      USING ERRCODE = 'raise_exception',
            CONSTRAINT = 'legacy_photo_write_frozen';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION guard_legacy_photo_write() IS
  'Phase 3A：photos 表只读。写入需要事务本地、逐行点名的授权。';

-- ── 2. 装上去 ───────────────────────────────────────────────────────────────
--
-- 表不存在就明确报错，而不是静默跳过 —— 静默跳过意味着某天有人改了表名，
-- 保护会悄悄消失，而 CI 依然全绿。和 20260809000000 里同样的处理。

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'photos'
  ) THEN
    RAISE EXCEPTION 'photos 表不存在 —— guard_legacy_photo_write 装不上去';
  END IF;

  CREATE TRIGGER trg_guard_legacy_photo_write
    BEFORE INSERT OR UPDATE ON public.photos
    FOR EACH ROW EXECUTE FUNCTION guard_legacy_photo_write();
END $do$;

-- ── 3. 顺手让 update_photos_updated_at 不再有机会开火 ───────────────────────
--
-- 那个触发器是 BEFORE UPDATE 的，和守门触发器同一时机。Postgres 按名字
-- 字母序执行同时机的行级触发器：
--
--     trg_guard_legacy_photo_write   <   update_photos_updated_at
--
-- 't' < 'u'，所以守门的先跑。这不是巧合能依赖的东西 —— 万一将来有人
-- 重命名，顺序就变了。但即使顺序反过来也没有后果：updated_at 只改
-- NEW 上的一个字段，真正的写入照样会被守门函数挡住。
--
-- 写在这里是为了让下一个读到「为什么这张表上有两个 BEFORE UPDATE 触发器」
-- 的人不用自己推一遍。

COMMENT ON TABLE public.photos IS
  'Phase 3A 起只读。新素材在 assets 表，旧 Gallery 通过只读投影读它。'
  '写入被 trg_guard_legacy_photo_write 冻结（见 20260811000000）。';
