-- Migration 009: 照片默认私有
--
-- 背景（PERFORMANCE-AUDIT.md 第七组 #13）：
--   photos.is_public 的默认值是 TRUE —— 用户上传的每一张照片默认就是公开的，
--   会出现在 /chichibu 公开地图上。而 documents 和 locations 的默认值都是
--   FALSE。这个不一致是隐私事故的直接来源。
--
-- 产品决策：所有素材默认 private，只有明确执行「发布」后才 public。
--   长期方向是把公开状态收归 Publication 管理，素材本身不再自带公开位
--   （见 REFACTOR-PLAN.md Phase 2）。这条 migration 是过渡期的止血。
--
-- ⚠️ 这条 migration 只改默认值，不动存量数据。
--    存量数据的处理见下方「第二步」，需要人工确认后单独执行。

-- ── 第一步：改默认值（安全，可立即执行）────────────────────────────
ALTER TABLE photos ALTER COLUMN is_public SET DEFAULT false;

COMMENT ON COLUMN photos.is_public IS
  '是否公开。2026-08 起默认 false。长期将由 publications 表接管，'
  '素材本身不再自带公开状态。';

-- ── 第二步：存量数据（需人工确认，默认不执行）──────────────────────
--
-- 问题：现有 is_public=true 的照片，分不清是「用户主动公开」还是
--       「旧默认值导致的被动公开」—— 数据库里没有记录这个区别。
--
-- 先跑这个盘点，判断规模：
--
--   SELECT
--     count(*)                                        AS 总数,
--     count(*) FILTER (WHERE is_public)               AS 当前公开,
--     count(*) FILTER (WHERE is_public AND location_id IS NOT NULL) AS 公开且绑了地点,
--     count(DISTINCT user_id)                         AS 涉及用户数
--   FROM photos WHERE trashed IS NOT TRUE;
--
-- 「公开且绑了地点」是唯一能近似识别「用户主动公开」的信号 —— 因为
-- /chichibu 只展示有坐标的照片，用户手动绑地点通常意味着他确实想让它
-- 出现在地图上。但这只是推测，不是证据。
--
-- 保守做法（推荐）：全部转私有，让用户重新选择要公开什么。
--
--   BEGIN;
--   -- 先留痕，便于回滚和事后申诉
--   CREATE TABLE IF NOT EXISTS photos_public_backup_202608 AS
--     SELECT id, user_id, is_public, location_id, created_at, now() AS snapshot_at
--     FROM photos WHERE is_public IS TRUE;
--
--   UPDATE photos SET is_public = false WHERE is_public IS TRUE;
--   COMMIT;
--
-- 回滚：
--   UPDATE photos p SET is_public = b.is_public
--   FROM photos_public_backup_202608 b WHERE p.id = b.id;

-- ── 还需要一并检查的（不在本 migration 范围内）──────────────────────
--
-- 1. /api/public/photos 是否只返回 is_public=true —— 已确认是，但它不按
--    地区过滤，「秩父」页面其实展示的是全部公开照片。
--
-- 2. Supabase Storage 的 photos bucket 是 public 的：
--    https://<proj>.supabase.co/storage/v1/object/public/photos/{userId}/...
--    **is_public 只控制「在应用里显示与否」，不控制文件本身可访问性。**
--    知道 URL 的任何人都能看到任何照片。这条 migration 解决不了这个问题，
--    需要改用 Signed URL 或 private bucket —— 见 REFACTOR-PLAN.md Phase 1 待办。
