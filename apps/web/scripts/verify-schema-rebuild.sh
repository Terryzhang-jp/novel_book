#!/usr/bin/env bash
#
# 验证 schema 能从零重建，且 DDL 与提交进仓库的快照逐行一致。
#
# 三层验收（缺一不可）：
#   1. 对象数量正确    —— 表/索引/策略/约束/触发器计数
#   2. 具体 DDL 一致   —— 与 supabase/schema.snapshot.sql 逐行 diff
#   3. seed 能加载     —— 含自检断言
#
# 只有 #1 通过是不够的：两边都可能有 50 个索引，但其中一个索引列错了。
#
# 用法：
#   ./scripts/verify-schema-rebuild.sh              验证
#   ./scripts/verify-schema-rebuild.sh --update     重新生成快照（schema 有意变更时）
#
# 依赖：本地 Postgres（pg_isready 能连上）。不需要 Docker。
# 退出码 0 = 全部通过，可直接接 CI。

set -uo pipefail
cd "$(dirname "$0")/.."

UPDATE_SNAPSHOT=false
[[ "${1:-}" == "--update" ]] && UPDATE_SNAPSHOT=true

DB="tc_schema_verify_$$"
SNAPSHOT="supabase/schema.snapshot.sql"

cleanup() { psql -q postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# ── 1. 建库 + Supabase 平台垫片 ─────────────────────────────────────────────
# Supabase 托管环境自带 auth schema 和 anon/authenticated/service_role 角色。
# 原生 Postgres 上要手工补，否则 RLS 策略和 GRANT 会失败。
# 这不是 schema 缺陷，是平台差异 —— 所以垫片不进 baseline 文件。
echo "▸ 创建一次性数据库 ${DB}"
psql -q postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
psql -q postgres -c "CREATE DATABASE ${DB};" >/dev/null || {
  echo "✗ 无法创建数据库。本地 Postgres 在跑吗？(pg_isready)"; exit 1;
}

psql -v ON_ERROR_STOP=1 -q "${DB}" >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
END $do$;
SQL

# ── 2. 按时间戳顺序重放 migrations ──────────────────────────────────────────
echo "▸ 重放 migrations"
FAILED=0
shopt -s nullglob
for f in $(ls supabase/migrations/*.sql | sort); do
  if out=$(psql -v ON_ERROR_STOP=1 -q "${DB}" -f "$f" 2>&1); then
    printf '  ✅ %s\n' "$(basename "$f")"
  else
    printf '  ❌ %s\n     %s\n' "$(basename "$f")" "$(echo "$out" | grep -m1 ERROR)"
    FAILED=$((FAILED + 1))
  fi
done
[ "${FAILED}" -ne 0 ] && { echo "✗ ${FAILED} 个 migration 失败"; exit 1; }

# ── 3. 对象数量 ─────────────────────────────────────────────────────────────
count() { psql -tA "${DB}" -c "$1" | tr -d ' '; }
TABLES=$(count "select count(*) from pg_tables where schemaname='public';")
INDEXES=$(count "select count(*) from pg_indexes where schemaname='public';")
POLICIES=$(count "select count(*) from pg_policies where schemaname='public';")
CONSTRAINTS=$(count "select count(*) from information_schema.table_constraints where constraint_schema='public';")
TRIGGERS=$(count "select count(*) from information_schema.triggers where trigger_schema='public';")

echo "▸ 对象数量：${TABLES} 表 / ${INDEXES} 索引 / ${POLICIES} RLS策略 / ${CONSTRAINTS} 约束 / ${TRIGGERS} 触发器"

# ── 4. DDL 快照 diff（关键：数量相同不等于定义相同）─────────────────────────
# 规范化：剔除 pg_dump 的环境设置、注释、版本号等不稳定内容后排序，
# 让 diff 只反映真实的 DDL 差异。
normalize_dump() {
  pg_dump --schema-only --no-owner --no-privileges --no-comments --schema=public "$1" \
    | grep -vE "^(SET |SELECT pg_catalog\.set_config|--|\\\\restrict|\\\\unrestrict)" \
    | grep -v "^$" \
    | sort
}

CURRENT=$(mktemp)
normalize_dump "${DB}" > "${CURRENT}"

if [ "${UPDATE_SNAPSHOT}" = true ]; then
  {
    echo "-- 规范化 schema 快照 —— 由 scripts/verify-schema-rebuild.sh --update 生成"
    echo "-- 不要手工编辑。schema 有意变更时重新生成并连同 migration 一起提交。"
    echo "-- 内容已排序且剔除环境相关行，仅用于 DDL 一致性 diff，不可直接执行。"
    echo
    cat "${CURRENT}"
  } > "${SNAPSHOT}"
  echo "▸ ✅ 已更新快照 ${SNAPSHOT}（$(wc -l < "${CURRENT}" | tr -d ' ') 行 DDL）"
elif [ ! -f "${SNAPSHOT}" ]; then
  echo "✗ 找不到 ${SNAPSHOT}。首次使用请跑：$0 --update"
  rm -f "${CURRENT}"; exit 1
else
  EXPECTED=$(mktemp)
  grep -v "^--" "${SNAPSHOT}" | grep -v "^$" > "${EXPECTED}"
  if diff -q "${EXPECTED}" "${CURRENT}" >/dev/null; then
    echo "▸ ✅ DDL 与快照逐行一致（$(wc -l < "${CURRENT}" | tr -d ' ') 行）"
  else
    echo "▸ ❌ DDL 与快照不一致："
    diff "${EXPECTED}" "${CURRENT}" | head -40 | sed 's/^/     /'
    echo
    echo "  如果这是有意的 schema 变更，请跑：$0 --update  并把快照一起提交"
    rm -f "${CURRENT}" "${EXPECTED}"; exit 1
  fi
  rm -f "${EXPECTED}"
fi
rm -f "${CURRENT}"

# ── 5. seed 能加载（含自检断言）─────────────────────────────────────────────
if [ -f supabase/seed.sql ]; then
  echo "▸ 加载 seed"
  if out=$(psql -v ON_ERROR_STOP=1 -q "${DB}" -f supabase/seed.sql 2>&1); then
    echo "$out" | grep -E "NOTICE" | sed 's/^psql[^ ]* /     /'
    echo "  ✅ seed 加载成功"
  else
    echo "  ❌ seed 失败：$(echo "$out" | grep -m1 -E 'ERROR|ASSERT')"
    exit 1
  fi
fi

echo
echo "✓ 通过：schema 可从零重建，DDL 与快照一致，seed 可加载"
