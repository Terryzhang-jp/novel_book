-- ============================================================================
-- 发布派生副本支持音频 —— 关闭 audio-derivation-not-implemented 缺口
-- ============================================================================
--
-- 在这之前，挂了音频证据的 Moment 发布出去会**少掉那份证据**：
-- publishWork 返回 skippedAssets 计数并在界面上说明，所以不是静默丢失，
-- 但它造成了一个语义断裂 —— 作者在草稿里看到的和读者在发布页看到的不是
-- 同一份内容。
--
-- 而「Moment 可以只有一段录音」正是这个产品降低现场记录摩擦的方式
-- （ADR-004）。长期停在「能上传、能私下听、发布时消失」，等于告诉用户
-- 语音记录是二等公民。
--
-- ## width/height 变成可空
--
-- 它们是**图片**的属性。音频没有宽高，有的是时长。
-- 原来的 NOT NULL + CHECK(>0) 逼着音频行填一个假的 1×1，
-- 那种「为了让字段有值而编一个值」正是 ADR-009 反对的做法。
--
-- 改成按 preset 分别要求：图片必须有宽高，音频必须有时长。
-- ============================================================================

ALTER TABLE published_assets ALTER COLUMN width  DROP NOT NULL;
ALTER TABLE published_assets ALTER COLUMN height DROP NOT NULL;
ALTER TABLE published_assets ADD COLUMN duration_ms integer CHECK (duration_ms > 0);

-- 第二个预设。名字里带参数（opus / 64kbps）——
-- 将来改码率就是一个新预设，旧的发布副本不会被追溯解释成新参数。
ALTER TABLE published_assets DROP CONSTRAINT published_assets_preset_check;
ALTER TABLE published_assets
  ADD CONSTRAINT published_assets_preset_check
  CHECK (preset IN ('web1600', 'audio_opus64'));

-- PA-5：每种预设各自的必填项。
--
-- 没有这条的话，「音频行带着宽高」和「图片行没有宽高」都是合法的，
-- 而渲染端只能靠 mime_type 去猜自己该读哪几列 —— 那正是 timezone 那次
-- 教训的形状（一列装两种语义，读取方靠猜）。
ALTER TABLE published_assets ADD CONSTRAINT chk_published_asset_shape CHECK (
  (preset = 'web1600'
     AND width IS NOT NULL AND height IS NOT NULL
     AND width > 0 AND height > 0
     AND duration_ms IS NULL)
  OR
  (preset = 'audio_opus64'
     AND width IS NULL AND height IS NULL
     AND duration_ms IS NOT NULL)
);

COMMENT ON COLUMN published_assets.duration_ms IS
  '音频派生副本的时长。图片行必须为 NULL —— 见 chk_published_asset_shape。';
