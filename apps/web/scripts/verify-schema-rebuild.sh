#!/usr/bin/env bash
#
# 验证：仅凭仓库里的 SQL，能否从一个空数据库重建出完整 schema？
#
# 这是重构最重要的一条安全网验收项。审计发现真实 schema 只存在于生产
# Supabase 实例里，而那个实例后来被删除了 —— 所以仓库里这些 .sql 是
# schema 仅存的记录，必须能跑通。
#
# 用法：
#   ./scripts/verify-schema-rebuild.sh              # 用本地 Postgres
#   PGHOST=... PGUSER=... ./scripts/verify-schema-rebuild.sh
#
# 退出码 0 = 全部通过。任何一个 SQL 失败都会以非 0 退出，可直接接进 CI。

set -uo pipefail
cd "$(dirname "$0")/.."

DB="tc_schema_verify_$$"
PSQL_BASE="psql -v ON_ERROR_STOP=1 -q"

cleanup() {
  psql -q postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "▸ 创建一次性数据库 ${DB}"
psql -q postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
psql -q postgres -c "CREATE DATABASE ${DB};" >/dev/null || {
  echo "✗ 无法创建数据库。本地 Postgres 在跑吗？(pg_isready)"; exit 1;
}

# ── 平台垫片 ────────────────────────────────────────────────────────
# Supabase 提供 auth schema 和 anon/authenticated/service_role 角色。
# 在原生 Postgres 上要手工补，否则 RLS 策略和 GRANT 语句会失败。
# 这不是 schema 的缺陷，是平台差异。
echo "▸ 安装 Supabase 平台垫片"
${PSQL_BASE} "${DB}" >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
END $do$;
SQL

# ── 执行顺序 ────────────────────────────────────────────────────────
# ⚠️ 这个顺序不能按文件名排序推导出来：
#    007_add_canvas_magazine_columns.sql 会 ALTER canvas_projects，
#    而那张表由未编号的 scripts/create-canvas-table.sql 创建。
#    详见 supabase/migrations/000_baseline_README.md
FILES=(
  supabase/migrations/001_initial_schema.sql
  supabase/migrations/002_add_location_sharing.sql
  supabase/migrations/003_add_require_password_change.sql
  supabase/migrations/004_add_trash_fields.sql
  supabase/migrations/005_add_photo_edit_fields.sql
  supabase/migrations/006_add_photo_embeddings.sql
  scripts/create-canvas-table.sql            # ← 必须在 007 之前
  supabase/migrations/007_add_canvas_magazine_columns.sql
  supabase/migrations/008_add_photo_thumbnail.sql
  scripts/create-ai-magic-history-table.sql
  scripts/add-ai-partner-memory.sql
  scripts/add-canvas-version-column.sql
  scripts/add-security-question.sql
  scripts/remove-decorations-column.sql
  scripts/migrations/001_better_auth_tables.sql
)

echo "▸ 依次执行 ${#FILES[@]} 个 SQL"
FAILED=0
for f in "${FILES[@]}"; do
  if out=$(${PSQL_BASE} "${DB}" -f "$f" 2>&1); then
    printf '  ✅ %s\n' "$(basename "$f")"
  else
    printf '  ❌ %s\n     %s\n' "$(basename "$f")" "$(echo "$out" | grep -m1 ERROR)"
    FAILED=$((FAILED + 1))
  fi
done

# ── 结果 ────────────────────────────────────────────────────────────
TABLES=$(psql -tA "${DB}" -c "select count(*) from pg_tables where schemaname='public';")
INDEXES=$(psql -tA "${DB}" -c "select count(*) from pg_indexes where schemaname='public';")
POLICIES=$(psql -tA "${DB}" -c "select count(*) from pg_policies where schemaname='public';")

echo
echo "▸ 重建结果：${TABLES} 张表 / ${INDEXES} 个索引 / ${POLICIES} 条 RLS 策略"
psql -tA "${DB}" -c "select tablename from pg_tables where schemaname='public' order by 1;" | sed 's/^/    /'

# 期望值来自 2026-08-02 的首次验证。数字变化说明 schema 被改过 ——
# 那可能是对的（新 migration），但必须是有意的，所以在这里显式对账。
EXPECTED_TABLES=11
echo
if [ "${FAILED}" -ne 0 ]; then
  echo "✗ 失败：${FAILED} 个 SQL 无法执行 —— schema 不能从零重建"
  exit 1
fi
if [ "${TABLES}" -ne "${EXPECTED_TABLES}" ]; then
  echo "✗ 表数不符：期望 ${EXPECTED_TABLES}，实际 ${TABLES}"
  echo "  如果这是有意的变更，请更新本脚本里的 EXPECTED_TABLES"
  exit 1
fi
echo "✓ 通过：schema 可以从零完整重建"
