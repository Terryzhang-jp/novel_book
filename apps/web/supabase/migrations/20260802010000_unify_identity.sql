-- ============================================================================
-- 统一身份：业务表外键从 users 改为指向 Better Auth 的 "user"
-- ============================================================================
--
-- ## 问题（已由 test/integration/identity.test.ts 自动化证明）
--
-- 系统里有两张用户表：
--   "user"   Better Auth 写入，TEXT 主键
--   users    6 张业务表的外键指向它，UUID 主键
--
-- 注册走 authClient.signUp.email() → Better Auth，只写 "user" 和 account。
-- lib/auth.ts 里没有任何 databaseHooks 补写 users。
--
-- 后果：**新注册用户无法创建任何内容** —— 照片、文档、地点的 INSERT
-- 全部被外键拒绝。集成测试里三条 INSERT 都确实抛了 foreign key violation。
--
-- 这个断裂在旧生产库存在时被掩盖了：那里的用户都是从 users 迁移到 "user"
-- 的，两张表都有行。「全新注册」这条路径很可能从来没被真正走通过。
--
-- ## 决策（ADR-001）
--
-- Better Auth 的 "user" 是唯一身份源。不再维护双写，不再新增业务用户表。
--
-- ## 本 migration 做什么
--
--   1. 把 users 里存在但 "user" 里缺失的行补过去（防御性，正常应为 0 行）
--   2. 6 张业务表的 user_id 从 uuid 改成 text
--   3. 外键改为指向 "user"(id)
--   4. users 表**保留但废弃** —— 不再被任何外键引用
--
-- users 表暂不 DROP：它还存着 password_hash 和 profile 等历史数据，
-- 等确认无人依赖后由单独的 migration 清理。保留它的成本只是一张静态表，
-- 而误删的代价不可逆。
--
-- ## 兼容性
--
-- 应用层无需改动查询：Better Auth 的 session.user.id 本来就是字符串，
-- 之前靠 Postgres 隐式转成 uuid，现在直接是 text 比较。
-- RLS 策略里的 `user_id::text = auth.uid()::text` 同样不受影响。
-- ============================================================================

BEGIN;

-- ── 1. 防御性回填 ───────────────────────────────────────────────────────────
-- 正常情况下 migrate-users-to-better-auth.ts 已经做过，这里是保险：
-- 如果有 users 行在 "user" 里没有对应项，先补上，否则下一步加外键会失败。
INSERT INTO "user" (id, name, email, email_verified, require_password_change,
                    security_question, security_answer_hash, created_at, updated_at)
SELECT u.id::text,
       u.name,
       u.email,
       true,
       COALESCE(u.require_password_change, false),
       u.security_question,
       u.security_answer_hash,
       COALESCE(u.created_at, now()),
       COALESCE(u.updated_at, now())
  FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM "user" a WHERE a.id = u.id::text)
ON CONFLICT (email) DO NOTHING;

-- 回填后仍然对不上就直接失败 —— 带着不一致的数据继续做外键改造会更糟
DO $check$
DECLARE
  orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count
    FROM users u
   WHERE NOT EXISTS (SELECT 1 FROM "user" a WHERE a.id = u.id::text);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'users 表里有 % 行在 "user" 表里没有对应项（可能是 email 冲突），无法安全改外键',
      orphan_count;
  END IF;
END
$check$;

-- ── 2 & 3. 逐表：删旧外键 → 改类型 → 加新外键 ───────────────────────────────
--
-- ⚠️ 复杂点：这 6 张表上有 RLS 策略引用 user_id 列，Postgres 不允许直接
--    ALTER 被策略引用的列（cannot alter type of a column used in a policy
--    definition）。所以必须先卸下策略、改完类型再原样装回去。
--
--    这里**原样重建**而不是顺手删掉。ADR-001 已经论证这些策略是失效的
--    （auth.uid() 恒为 NULL，且服务端一律用 service_role 绕过），但那条
--    结论适用于新核心；遗留系统的既有行为不在本 migration 的改动范围内。
--    一次 migration 只做一件事。
--
--    真正处理 RLS 的时机见 ADR-001「RLS 是纵深防御，不是正确性来源」。

DO $repoint$
DECLARE
  t text;
  business_tables text[] := ARRAY[
    'photos',
    'documents',
    'locations',
    'canvas_projects',
    'photo_embeddings',
    'ai_magic_history'
  ];
  fk_name text;
  pol record;
  saved_policies jsonb := '[]'::jsonb;
BEGIN
  -- 2a. 把这些表上的 RLS 策略定义原样保存下来
  FOR pol IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = ANY(business_tables)
  LOOP
    saved_policies := saved_policies || jsonb_build_object(
      'table',      pol.tablename,
      'name',       pol.policyname,
      'permissive', pol.permissive,
      'roles',      array_to_string(pol.roles, ','),
      'cmd',        pol.cmd,
      'qual',       pol.qual,
      'with_check', pol.with_check
    );
    EXECUTE format('DROP POLICY %I ON %I', pol.policyname, pol.tablename);
  END LOOP;

  -- 2b. 改外键与列类型
  FOREACH t IN ARRAY business_tables LOOP
    -- 找到当前指向 users 的外键名（不硬编码，防止各环境命名不同）
    SELECT tc.constraint_name INTO fk_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
     WHERE tc.table_name = t
       AND tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'users'
     LIMIT 1;

    IF fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, fk_name);
    END IF;

    -- uuid → text。已有值是合法 uuid 字符串，转换无损。
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN user_id TYPE text USING user_id::text', t
    );

    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id)
         REFERENCES "user"(id) ON DELETE CASCADE',
      t, t || '_user_id_fkey'
    );
  END LOOP;

  -- 2c. 原样装回策略
  FOR pol IN SELECT * FROM jsonb_array_elements(saved_policies) AS p(v)
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
      pol.v->>'name',
      pol.v->>'table',
      CASE WHEN pol.v->>'permissive' = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      pol.v->>'cmd',
      pol.v->>'roles',
      CASE WHEN pol.v->>'qual' IS NOT NULL
           THEN 'USING (' || (pol.v->>'qual') || ')' ELSE '' END,
      CASE WHEN pol.v->>'with_check' IS NOT NULL
           THEN 'WITH CHECK (' || (pol.v->>'with_check') || ')' ELSE '' END
    );
  END LOOP;
END
$repoint$;

-- ── 4. 标记 users 为废弃 ────────────────────────────────────────────────────
COMMENT ON TABLE users IS
  '【已废弃 2026-08】身份的唯一来源是 Better Auth 的 "user" 表。'
  '本表不再被任何外键引用，仅保留历史数据（password_hash / profile）。'
  '确认无人依赖后由后续 migration DROP。见 ADR-001。';

COMMIT;
