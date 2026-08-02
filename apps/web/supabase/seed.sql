-- ============================================================================
-- 本地开发种子数据
-- ============================================================================
--
-- 由 `supabase db reset` 在重放完 migrations 之后自动加载。
--
-- 设计原则：
--   1. **两个用户**，用于验证数据隔离 —— 这是最重要的一条测试维度
--   2. 覆盖照片四分类的**每一种**（time-location / time-only / location-only / neither）
--   3. 覆盖已知的边界数据：无 EXIF、HEIC、已编辑、回收站、AI 生成
--   4. 全部素材默认 private（migration 009 之后的正确行为）
--   5. 数据量小（可读、可断言），不追求真实感
--
-- ⚠️ 密码哈希是 bcrypt('devpassword123', 10)，**仅限本地**。
--    seed 里不放任何真实凭据。
--
-- 固定 UUID：测试断言需要可预测的 ID，不要改。
-- ============================================================================

-- ── 用户 ────────────────────────────────────────────────────────────────────
-- 业务表 users（旧）与 Better Auth 的 "user" 表 id 保持一致 ——
-- 这个「靠约定维持」的一致性正是 I1 待决问题的核心，seed 里如实复现，
-- 以便集成测试能暴露它。

INSERT INTO users (id, email, password_hash, name, require_password_change, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@dev.local',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Alice', false, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'bob@dev.local',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Bob', false, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "user" (id, name, email, email_verified, require_password_change, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice', 'alice@dev.local', true, false, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'Bob',   'bob@dev.local',   true, false, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Better Auth 把密码存在 account 表的 password 列（provider_id = 'credential'）
INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'credential',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'credential',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── 地点 ────────────────────────────────────────────────────────────────────
INSERT INTO locations (id, user_id, name, coordinates, address, usage_count, is_public, created_at, updated_at) VALUES
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '秩父神社',
   '{"latitude": 35.9926, "longitude": 139.0856}'::jsonb,
   '{"formattedAddress": "埼玉県秩父市番場町1-3", "country": "日本", "city": "秩父市"}'::jsonb,
   2, false, now(), now()),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '羊山公園', '{"latitude": 35.9836, "longitude": 139.0942}'::jsonb,
   '{"formattedAddress": "埼玉県秩父市大宮6360", "country": "日本", "city": "秩父市"}'::jsonb,
   1, false, now(), now()),
  -- Bob 的地点 —— 用于验证 Alice 看不到它
  ('20000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Bob 的秘密基地', '{"latitude": 35.6812, "longitude": 139.7671}'::jsonb,
   NULL, 1, false, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── 照片：覆盖四分类 + 边界情况 ──────────────────────────────────────────────
-- 注意 is_public 全部为 false —— migration 009 之后的正确默认行为。
-- 测试应断言「新建照片默认 private」。

INSERT INTO photos (id, user_id, file_name, original_name, file_url, thumbnail_url,
                    location_id, metadata, category, is_public, trashed, created_at, updated_at) VALUES

  -- ① time-location：有时间 + 有 GPS（最常见）
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'seed-01.jpg', 'DSC00001.JPG',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-01.jpg',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/thumbnails/thumb_seed-01.jpg',
   '10000000-0000-0000-0000-000000000001',
   '{"dateTime":"2025-09-14T06:40:00.000Z","location":{"latitude":35.9926,"longitude":139.0856,"source":"exif"},"camera":{"make":"SONY","model":"ILCE-7M3"},"dimensions":{"width":6000,"height":4000},"fileSize":4823910,"mimeType":"image/jpeg"}'::jsonb,
   'time-location', false, false, now(), now()),

  -- ② time-location：同一地点第二张，用于验证按地点筛选返回 >1 张
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'seed-02.jpg', 'DSC00002.JPG',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-02.jpg',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/thumbnails/thumb_seed-02.jpg',
   '10000000-0000-0000-0000-000000000001',
   '{"dateTime":"2025-09-14T06:52:00.000Z","location":{"latitude":35.9927,"longitude":139.0857,"source":"exif"},"camera":{"make":"SONY","model":"ILCE-7M3"},"dimensions":{"width":6000,"height":4000},"fileSize":5102334,"mimeType":"image/jpeg"}'::jsonb,
   'time-location', false, false, now(), now()),

  -- ③ time-location：时间上相隔 5 小时 —— 用于验证时间聚类能分出 >1 组
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'seed-03.jpg', 'DSC00003.JPG',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-03.jpg',
   NULL,
   '10000000-0000-0000-0000-000000000002',
   '{"dateTime":"2025-09-14T11:30:00.000Z","location":{"latitude":35.9836,"longitude":139.0942,"source":"location-library"},"dimensions":{"width":4000,"height":3000},"fileSize":3210984,"mimeType":"image/jpeg"}'::jsonb,
   'time-location', false, false, now(), now()),

  -- ④ time-only：有时间无 GPS（关了定位的相机）
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'seed-04.jpg', 'IMG_0004.JPG',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-04.jpg',
   NULL, NULL,
   '{"dateTime":"2025-09-15T02:15:00.000Z","camera":{"make":"FUJIFILM","model":"X-T5"},"dimensions":{"width":5000,"height":3333},"fileSize":2891044,"mimeType":"image/jpeg"}'::jsonb,
   'time-only', false, false, now(), now()),

  -- ⑤ location-only：无时间有 GPS
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'seed-05.png', 'screenshot.png',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-05.png',
   NULL, NULL,
   '{"location":{"latitude":35.9900,"longitude":139.0800,"source":"manual"},"dimensions":{"width":1170,"height":2532},"fileSize":882301,"mimeType":"image/png"}'::jsonb,
   'location-only', false, false, now(), now()),

  -- ⑥ neither：既无时间也无 GPS（下载的图 / 截图）
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'seed-06.webp', 'downloaded.webp',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-06.webp',
   NULL, NULL,
   '{"fileSize":140233,"mimeType":"image/webp"}'::jsonb,
   'neither', false, false, now(), now()),

  -- ⑦ HEIC：Chrome/Firefox 显示不了 —— 边界情况，用于验证前端回退
  ('a0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'seed-07.heic', 'IMG_1234.HEIC',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-07.heic',
   NULL, NULL,
   '{"dateTime":"2025-09-16T01:00:00.000Z","dimensions":{"width":4032,"height":3024},"fileSize":1993002,"mimeType":"image/heic"}'::jsonb,
   'time-only', false, false, now(), now()),

  -- ⑧ 已编辑：originalFileUrl 存着编辑前的版本
  ('a0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'seed-08.jpg', 'edited.jpg',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-08-v2.jpg',
   NULL, NULL,
   '{"dateTime":"2025-09-16T05:00:00.000Z","dimensions":{"width":3000,"height":2000},"fileSize":1500000,"mimeType":"image/jpeg"}'::jsonb,
   'time-only', false, false, now(), now()),

  -- ⑨ 回收站：软删除 —— 不应出现在 Gallery 默认列表里
  ('a0000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
   'seed-09.jpg', 'trashed.jpg',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-09.jpg',
   NULL, NULL,
   '{"dateTime":"2025-09-10T00:00:00.000Z","fileSize":900000,"mimeType":"image/jpeg"}'::jsonb,
   'time-only', false, true, now(), now()),

  -- ⑩ Bob 的照片 —— 用于验证 Alice 查询时看不到它。隔离测试的核心。
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'bob-01.jpg', 'BOB_PRIVATE.jpg',
   'http://127.0.0.1:54321/storage/v1/object/public/photos/22222222-2222-2222-2222-222222222222/gallery/bob-01.jpg',
   NULL,
   '20000000-0000-0000-0000-000000000001',
   '{"dateTime":"2025-10-01T09:00:00.000Z","location":{"latitude":35.6812,"longitude":139.7671,"source":"exif"},"fileSize":2000000,"mimeType":"image/jpeg"}'::jsonb,
   'time-location', false, false, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ⑧ 的编辑前版本（单独 UPDATE，因为 INSERT 里列太多不好读）
UPDATE photos SET
  original_file_url = 'http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-08.jpg',
  edited = true,
  edited_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000000008';

-- ⑨ 的回收站时间
UPDATE photos SET trashed_at = now() - interval '2 days'
WHERE id = 'a0000000-0000-0000-0000-000000000009';

-- ── 文档 ────────────────────────────────────────────────────────────────────
INSERT INTO documents (id, user_id, title, content, images, tags, preview, is_public, created_at, updated_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '秩父：保存与活着',
   '{"type":"doc","content":[
      {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"秩父：保存与活着"}]},
      {"type":"paragraph","content":[{"type":"text","text":"真正让这个地方有生命力的，不是保存完好的建筑，而是居民还在门口晾衣服和交谈。"}]},
      {"type":"image","attrs":{"src":"http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-01.jpg","alt":"秩父神社","align":"center"}}
    ]}'::jsonb,
   ARRAY['seed-01.jpg'], ARRAY['秩父','观察'],
   '真正让这个地方有生命力的，不是保存完好的建筑…', false, now(), now()),

  -- Bob 的文档 —— 隔离测试用
  ('d0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Bob 的私人笔记',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"这是 Bob 的内容，Alice 不应该看到。"}]}]}'::jsonb,
   ARRAY[]::text[], ARRAY[]::text[], 'Bob 的内容', false, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── 画布项目 ────────────────────────────────────────────────────────────────
INSERT INTO canvas_projects (id, user_id, title, pages, is_magazine_mode, current_page_index, created_at, updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '秩父手账',
   '[{"id":"page-1","index":0,"elements":[
       {"id":"el-1","type":"text","x":80,"y":100,"width":640,"height":80,
        "text":"秩父","html":"<p>秩父</p>","fontSize":48,"fontFamily":"ZCOOL XiaoWei","fill":"#1a1a1a"},
       {"id":"el-2","type":"image","x":80,"y":220,"width":640,"height":420,
        "src":"http://127.0.0.1:54321/storage/v1/object/public/photos/11111111-1111-1111-1111-111111111111/gallery/seed-01.jpg"}
     ]}]'::jsonb,
   true, 0, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── AI 生图历史 ─────────────────────────────────────────────────────────────
-- ⚠️ 生产上这一列存的是完整 base64 data URL（实测单条 1.1 MB）。
--    seed 里只放一个 1x1 像素的占位，用于验证「新代码不再写 base64」。
INSERT INTO ai_magic_history (id, user_id, user_prompt, input_image_count, style_image_count,
                              optimized_prompt, reasoning, result_image, model, created_at) VALUES
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '把这张照片变成水彩风格', 1, 0,
   'Transform the photo into a delicate watercolor painting, soft edges, muted palette',
   '用户想要柔和的手绘质感，因此强调 soft edges 和 muted palette',
   'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
   'gemini-2.5-flash-image', now())
ON CONFLICT (id) DO NOTHING;

-- ── 完整性自检 ──────────────────────────────────────────────────────────────
DO $seed$
DECLARE
  n_users int; n_photos int; n_alice int; n_bob int; n_public int;
BEGIN
  SELECT count(*) INTO n_users  FROM users;
  SELECT count(*) INTO n_photos FROM photos;
  SELECT count(*) INTO n_alice  FROM photos WHERE user_id = '11111111-1111-1111-1111-111111111111';
  SELECT count(*) INTO n_bob    FROM photos WHERE user_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO n_public FROM photos WHERE is_public;

  ASSERT n_users  = 2,  format('期望 2 个用户，实际 %s', n_users);
  ASSERT n_photos = 10, format('期望 10 张照片，实际 %s', n_photos);
  ASSERT n_alice  = 9,  format('期望 Alice 有 9 张，实际 %s', n_alice);
  ASSERT n_bob    = 1,  format('期望 Bob 有 1 张，实际 %s', n_bob);
  -- 最重要的一条：009 之后不应该有任何默认公开的素材
  ASSERT n_public = 0,  format('期望 0 张公开照片（素材默认私有），实际 %s', n_public);

  RAISE NOTICE 'seed 自检通过: % 用户 / % 照片（Alice %, Bob %）/ % 张公开',
    n_users, n_photos, n_alice, n_bob, n_public;
END
$seed$;
