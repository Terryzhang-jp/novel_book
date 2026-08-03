-- ============================================================================
-- 非 active 账号不能再产生新内容 —— ADR-007 的一条缺口
-- ============================================================================
--
-- Commit 14C 在三处拦住了非 active 账号：建立 session、读取 session、
-- 发布页读取。那三处覆盖的都是**用户自己发起的请求**。
--
-- 覆盖不到的是「已经在路上的写入」：
--
--   队列任务          用户申请删除的前一秒提交的转写请求
--   后台批处理        导入、补全、AI 生成
--   Actor.system      任何越过用户边界的系统操作
--   已开始的上传      HTTP 请求已进来，用例跑到一半
--
-- 这些路径没有 session，所以前两道拦截对它们完全不起作用。
-- 结果是用户点了「删除我的账号」，几秒之后系统又给他写了一条新 Asset ——
-- 而那条记录会安安静静地活到 30 天后被一起删掉，或者在撤销之后
-- 变成一条来历不明的数据。
--
-- ## 为什么放在数据库而不是 Application Service
--
-- 「每个新增内容的用例都要先检查 owner.status」是对的，但它是**约定**：
-- 十几个用例，将来还会更多，漏掉一个不会有任何编译错误或测试失败 ——
-- 而漏掉的那个恰恰是新写的、没人想起来的那个。
--
-- 触发器装在写入的那一刻，覆盖所有调用方：用例、迁移脚本、运维手工 SQL、
-- 将来任何新增的后台任务。代价是每次 INSERT 多一次主键查询。
--
-- 应用层仍然应该提前检查以给出好的错误信息，但**正确性不依赖它**。
-- ============================================================================

CREATE OR REPLACE FUNCTION require_active_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_status text;
BEGIN
  SELECT status INTO owner_status FROM "user" WHERE id = NEW.user_id;

  -- 行不存在交给外键去报错。在这里抢着报会把「用户不存在」说成
  -- 「用户被停用了」，那是两件事。
  IF owner_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF owner_status <> 'active' THEN
    RAISE EXCEPTION
      '账号当前状态是 %，不能新增内容（ADR-007）。'
      '停用与待删除期间系统不再为这个账号写入任何东西 —— '
      '包括队列任务和后台作业。', owner_status
      USING ERRCODE = 'check_violation',
            -- 用例层靠这个前缀把它翻成人话，而不是比对整句消息
            CONSTRAINT = 'require_active_owner';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION require_active_owner() IS
  'ADR-007：非 active 账号不能新增内容。装在写入那一刻，覆盖所有调用方（含无 session 的后台任务）。';

-- ── 装到所有「用户内容」表上 ────────────────────────────────────────────────
--
-- 只装 INSERT。UPDATE 不装是刻意的：
--   · 删除流程本身要 UPDATE "user"（状态迁移）
--   · 撤回 Publication、写墓碑这些「减少可见内容」的操作在停用期间
--     仍然应该可以由系统执行
-- 我们要挡住的是**新增**。
--
-- moment_assets / work_blocks 不在列表里：它们没有 user_id，
-- 归属由父行（moments / works）决定，而父行已经被挡住了。

DO $do$
DECLARE
  t text;
  content_tables text[] := ARRAY[
    -- 新核心
    'journeys', 'moments', 'observations', 'interpretation_revisions',
    'works', 'work_versions', 'publications',
    'assets', 'asset_metadata_corrections', 'published_assets',
    -- 遗留（Strangler 期间仍在写入，同样不该给停用账号新增内容）
    'photos', 'documents', 'locations', 'canvas_projects'
  ];
BEGIN
  FOREACH t IN ARRAY content_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_require_active_owner
           BEFORE INSERT ON %I
           FOR EACH ROW EXECUTE FUNCTION require_active_owner()', t
      );
    ELSE
      -- 表不存在就明确报错，而不是静默跳过。
      -- 静默跳过意味着某天有人改了表名，保护会悄悄消失。
      RAISE EXCEPTION '内容表 % 不存在 —— require_active_owner 装不上去', t;
    END IF;
  END LOOP;
END $do$;
