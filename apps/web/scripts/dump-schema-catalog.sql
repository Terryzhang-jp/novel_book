-- ============================================================================
-- 规范化 schema 快照 —— 从系统目录导出，不用 pg_dump
-- ============================================================================
--
-- ## 为什么不用 pg_dump
--
-- 第一版用的是 `pg_dump --schema-only` + 排序 + 逐行 diff。它在本地
-- （PostgreSQL 14）跑得好好的，一上 CI（PostgreSQL 15）就炸：
--
--   166,167d167
--   < $$;
--   < $$;
--
-- 根因是不同大版本对函数体的 dollar-quoting 和换行处理不同。排序又把
-- 多行语句打散，于是格式差异被放大成「schema 不一致」。
--
-- 这是个真问题：**一个会因为数据库小版本变化而误报的门禁，很快就会被
-- 团队学会忽略。**
--
-- ## 改用系统目录
--
-- information_schema 和 pg_catalog 的形状在各版本间稳定得多，而且
-- `pg_get_constraintdef` / `pg_get_indexdef` / `pg_get_triggerdef` 输出的是
-- **规范化后**的定义，不受原始 SQL 写法影响。
--
-- 附带好处：diff 出来是语义化的一行，能直接读懂改了什么 ——
-- 而不是「第 166 行多了一个 $$」。
--
-- 输出格式：每行 `类型\t标识\t定义`，全局排序。
-- ============================================================================

\pset tuples_only on
\pset format unaligned
\pset fieldsep '\t'
\pset footer off

WITH
-- ── 列 ──────────────────────────────────────────────────────────────────────
cols AS (
  SELECT
    'column' AS kind,
    c.table_name || '.' || c.column_name AS ident,
    format(
      '%s%s%s',
      -- 用 format_type 而不是 data_type：后者对 varchar(n)、numeric(p,s)
      -- 这类带修饰的类型会丢信息
      format_type(a.atttypid, a.atttypmod),
      CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
      CASE WHEN c.column_default IS NOT NULL
           THEN ' DEFAULT ' || c.column_default ELSE '' END
    ) AS def
  FROM information_schema.columns c
  JOIN pg_class      pc ON pc.relname = c.table_name
  JOIN pg_namespace  pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
  JOIN pg_attribute  a  ON a.attrelid = pc.oid AND a.attname = c.column_name
  WHERE c.table_schema = 'public'
),
-- ── 约束（主键 / 外键 / 唯一 / CHECK）─────────────────────────────────────────
cons AS (
  SELECT
    'constraint' AS kind,
    rel.relname || '.' || con.conname AS ident,
    pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
),
-- ── 索引 ────────────────────────────────────────────────────────────────────
idx AS (
  SELECT
    'index' AS kind,
    tablename || '.' || indexname AS ident,
    indexdef AS def
  FROM pg_indexes
  WHERE schemaname = 'public'
),
-- ── RLS 策略 ────────────────────────────────────────────────────────────────
pol AS (
  SELECT
    'policy' AS kind,
    tablename || '.' || policyname AS ident,
    format(
      '%s FOR %s TO %s USING (%s) WITH CHECK (%s)',
      CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      cmd,
      array_to_string(roles, ','),
      COALESCE(qual, '-'),
      COALESCE(with_check, '-')
    ) AS def
  FROM pg_policies
  WHERE schemaname = 'public'
),
-- ── 触发器 ──────────────────────────────────────────────────────────────────
trg AS (
  SELECT
    'trigger' AS kind,
    c.relname || '.' || t.tgname AS ident,
    pg_get_triggerdef(t.oid) AS def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
),
-- ── 函数 ────────────────────────────────────────────────────────────────────
-- 只取签名和函数体，不取 pg_get_functiondef —— 后者的格式随版本变化。
-- prosrc 是原样存储的函数体，稳定。
fn AS (
  SELECT
    'function' AS kind,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS ident,
    format(
      'RETURNS %s LANGUAGE %s | %s',
      pg_get_function_result(p.oid),
      l.lanname,
      -- 折叠空白：缩进变化不该算 schema 变更
      regexp_replace(btrim(p.prosrc), '\s+', ' ', 'g')
    ) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language  l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
),
-- ── 表（含 RLS 开关）────────────────────────────────────────────────────────
tbl AS (
  SELECT
    'table' AS kind,
    c.relname AS ident,
    format('rls=%s', CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'disabled' END) AS def
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
)
SELECT kind || E'\t' || ident || E'\t' || def
FROM (
  SELECT * FROM tbl
  UNION ALL SELECT * FROM cols
  UNION ALL SELECT * FROM cons
  UNION ALL SELECT * FROM idx
  UNION ALL SELECT * FROM pol
  UNION ALL SELECT * FROM trg
  UNION ALL SELECT * FROM fn
) all_objects
ORDER BY kind, ident, def;
