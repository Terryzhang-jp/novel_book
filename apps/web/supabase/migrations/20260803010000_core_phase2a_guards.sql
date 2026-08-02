-- ============================================================================
-- Phase 2A 补充约束：跨用户引用的第二道防线
-- ============================================================================
--
-- 20260803000000 建的九张表里，work_blocks.moment_id 只有一个外键 ——
-- 它保证「这个 Moment 存在」，**不保证「这个 Moment 和 Work 属于同一个人」**。
--
-- 也就是说，Alice 能不能把 Bob 的 Moment 引进自己的作品，
-- 在上一版 migration 之后完全取决于应用层那三行代码
-- （use-cases/work.ts 的 addMomentToWork）。
--
-- 这不够。应用层的检查会被绕过：写迁移脚本的人、修 bug 时顺手加的新入口、
-- 未来的批量导入功能 —— 它们都不会经过那三行。
-- 而这类越权一旦发生，用户是看不见的：Bob 只会某天发现自己没公开过的
-- 内容出现在别人的作品里。
--
-- 所以这里加一个触发器，把「同属一人」变成数据库级别的事实。
--
-- ⚠️ 这不改变 ADR-001 的立场：授权边界仍然是应用层的 Actor + Repository。
--    触发器是**兜底**，不是授权机制 —— 它只回答「这行数据是否自相矛盾」。
-- ============================================================================

CREATE OR REPLACE FUNCTION assert_work_block_same_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  work_owner   text;
  moment_owner text;
BEGIN
  IF NEW.moment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO work_owner   FROM works   WHERE id = NEW.work_id;
  SELECT user_id INTO moment_owner FROM moments WHERE id = NEW.moment_id;

  IF work_owner IS DISTINCT FROM moment_owner THEN
    RAISE EXCEPTION
      '违反不变量 W-2：Work 与被引用的 Moment 不属于同一个用户（% vs %）',
      work_owner, moment_owner;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION assert_work_block_same_owner() IS
  'W-2 兜底：work_blocks 只能引用同一所有者的 Moment。授权仍由应用层负责（ADR-001）。';

CREATE TRIGGER trg_work_block_same_owner
  BEFORE INSERT OR UPDATE OF moment_id, work_id ON work_blocks
  FOR EACH ROW EXECUTE FUNCTION assert_work_block_same_owner();

-- ── moments.journey_id 同理 ─────────────────────────────────────────────────
-- 把自己的 Moment 归到别人的 Journey 里同样只有应用层在拦。

CREATE OR REPLACE FUNCTION assert_moment_journey_same_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  journey_owner text;
BEGIN
  IF NEW.journey_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO journey_owner FROM journeys WHERE id = NEW.journey_id;

  IF journey_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION
      '违反不变量 J-3：Moment 与 Journey 不属于同一个用户（% vs %）',
      NEW.user_id, journey_owner;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION assert_moment_journey_same_owner() IS
  'J-3 兜底：Moment 只能归入同一所有者的 Journey。';

CREATE TRIGGER trg_moment_journey_same_owner
  BEFORE INSERT OR UPDATE OF journey_id, user_id ON moments
  FOR EACH ROW EXECUTE FUNCTION assert_moment_journey_same_owner();
