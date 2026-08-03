-- ============================================================================
-- 账号生命周期 —— ADR-007
-- ============================================================================
--
-- migration 20260802010000 把所有业务外键改成
-- `REFERENCES "user"(id) ON DELETE CASCADE`。那是**数据库物理行为**，
-- 在此之前它同时也是唯一的产品语义：系统里只有「删 user 行」这一个动作。
--
-- 于是这四件完全不同的事共用同一条代码路径：
--
--     退出登录        当前 session 失效，别的什么都不该变
--     禁用账号        内容全部保留，公开页下架，可恢复
--     用户申请删除    立即下架，30 天内可撤销
--     最终永久删除    真的没了，不可逆
--
-- 这个 migration 把它们拆开。三部分：
--
--   1. "user" 上的状态字段（active / disabled / deletion_requested）
--   2. account_events 审计表 —— 它**故意没有外键**，理由见下
--   3. 一个 BEFORE DELETE 触发器：把 CASCADE 锁进删除流程内部
--
-- ## 为什么表里没有 'deleted'
--
-- ADR-007 的状态机以 `deleted` 结束，但那个状态**不存在于这张表里** ——
-- 最终删除会真的把行删掉，CASCADE 随即清空全部业务数据。ADR-007 实现要求
-- 第 3 条说得很明确：CASCADE 保留，因为它就是最终删除那一步的执行手段。
--
-- 所以 `deleted` 由「行不存在」+ account_events 里的记录共同表达。
-- 在 CHECK 里列一个永远不会出现的值，只会让读者以为存在这样的行。
-- ============================================================================

-- ── 1. 状态字段 ─────────────────────────────────────────────────────────────

ALTER TABLE "user"
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'deletion_requested')),
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN deletion_requested_at timestamptz,
  ADD COLUMN deletion_effective_at timestamptz,
  -- 撤销令牌只存哈希。明文只在申请的那一刻出现在响应里一次。
  ADD COLUMN deletion_cancel_token_hash text;

-- AC-2：删除相关的三个字段与 deletion_requested 状态**同生共死**。
--
-- 少了这条约束，「status 回到 active 了但 deletion_effective_at 还留着」
-- 是完全合法的行，而定时任务扫的正是 deletion_effective_at ——
-- 一个已经撤销的账号会在 30 天后被删掉。
ALTER TABLE "user" ADD CONSTRAINT chk_deletion_fields CHECK (
  (status = 'deletion_requested'
     AND deletion_requested_at IS NOT NULL
     AND deletion_effective_at IS NOT NULL
     AND deletion_cancel_token_hash IS NOT NULL)
  OR
  (status <> 'deletion_requested'
     AND deletion_requested_at IS NULL
     AND deletion_effective_at IS NULL
     AND deletion_cancel_token_hash IS NULL)
);

-- AC-3：等待期必须是正的。`effective_at <= requested_at` 意味着
-- 「申请的瞬间就可以永久删除」—— 那不是 30 天冷静期，那是立即删除。
ALTER TABLE "user" ADD CONSTRAINT chk_deletion_window CHECK (
  deletion_effective_at IS NULL OR deletion_effective_at > deletion_requested_at
);

-- 令牌哈希必须唯一：撤销是按令牌反查账号的，撞车会让一个令牌能撤销别人的删除。
CREATE UNIQUE INDEX uq_user_deletion_cancel_token
  ON "user" (deletion_cancel_token_hash)
  WHERE deletion_cancel_token_hash IS NOT NULL;

-- 定时任务扫「到期可删」用。部分索引 —— 绝大多数行不在这个状态。
CREATE INDEX idx_user_deletion_due
  ON "user" (deletion_effective_at)
  WHERE status = 'deletion_requested';

COMMENT ON COLUMN "user".status IS
  'active | disabled | deletion_requested。deleted 不在这里 —— 那一步会删掉整行（ADR-007）。';
COMMENT ON COLUMN "user".deletion_effective_at IS
  '最早可以执行永久删除的时刻。存下来而不是每次用 requested_at + 30 天算 —— 保留期改了不该动到已经在等待中的账号。';
COMMENT ON COLUMN "user".deletion_cancel_token_hash IS
  '撤销令牌的 sha256。明文不落库，只在申请时返回一次。';

-- ── 2. 审计 ─────────────────────────────────────────────────────────────────
--
-- ⚠️ user_id 上**故意没有外键**。
--
-- 加了外键就得跟着 CASCADE 走，于是「这个账号在何时被永久删除」这条记录
-- 会在删除的瞬间和它记录的事件一起消失 —— 审计日志唯一不能缺席的时刻，
-- 恰好就是它被删掉的那一刻。
--
-- 代价是这里会留下已删除用户的 id。那是个不透明的 UUID，不含个人信息；
-- 而「删除确实发生过」这件事必须留下证据。

CREATE TABLE account_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  event_type   text NOT NULL CHECK (event_type IN (
                 'disabled',
                 'reactivated',
                 'deletion_requested',
                 'deletion_cancelled',
                 'deletion_finalized',
                 'sessions_revoked',
                 'storage_cleanup_incomplete'
               )),
  from_status  text,
  to_status    text,
  -- 谁做的。system 必须带 reason（domain 的 systemActor 已经强制）。
  actor_type   text NOT NULL CHECK (actor_type IN ('user', 'system', 'anonymous')),
  actor_id     text,
  reason       text,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_events_user ON account_events (user_id, occurred_at DESC);
CREATE INDEX idx_account_events_type ON account_events (event_type, occurred_at DESC);

COMMENT ON TABLE account_events IS
  '账号状态变更审计。user_id 无外键 —— 审计必须比被审计对象活得久（ADR-007）。';

-- ── 3. 把 CASCADE 锁进删除流程 ──────────────────────────────────────────────
--
-- ADR-007 实现要求 3：CASCADE 保留，但「只能由删除流程触发，
-- 不能被任何常规操作路径调用」。
--
-- 光靠约定做不到这一点 —— 任何一处 `DELETE FROM "user" WHERE ...` 都能
-- 悄悄抹掉一个人的全部数据，而它看起来和普通的清理代码没有区别。
--
-- 所以在数据库这一层拦住：删除必须先在**当前事务里**声明
-- `SET LOCAL tc.allow_user_delete = '<那一个 user id>'`。
--
-- 为什么是 user id 而不是布尔开关：布尔开关一旦打开，
-- `DELETE FROM "user"` 不带 WHERE 就能删光所有人。要求逐个点名之后，
-- 一条语句最多只能删掉一个账号。

CREATE OR REPLACE FUNCTION guard_user_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- current_setting(..., true) 在没设置时返回 NULL 而不是报错
  IF current_setting('tc.allow_user_delete', true) IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION
      '禁止直接删除 user 行（id=%）。删除账号必须走 finalizeAccountDeletion —— '
      '它会先收集对象存储的 key、写审计、再在同一事务里 SET LOCAL '
      'tc.allow_user_delete 放行。见 ADR-007。', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_guard_user_delete
  BEFORE DELETE ON "user"
  FOR EACH ROW EXECUTE FUNCTION guard_user_delete();

COMMENT ON FUNCTION guard_user_delete() IS
  'ADR-007：CASCADE 是最终删除的执行手段，不是任何常规路径可以触发的东西。';
