-- ============================================================================
-- 对象清理队列 —— 让「字节没删干净」成为可重试的工作，而不是一条日志
-- ============================================================================
--
-- Commit 14D 里，永久删除的对象清理是这样做的：
--
--     事务提交 → 循环删对象 → 失败就记一条 storage_cleanup_incomplete 审计
--
-- 那是正确的第一步（失败方向安全：可能残留不可访问的字节，不会残留公开数据），
-- 但它有两个长期问题：
--
--   1. **没有重试。** 存储临时不可用时，那些字节就永远留在磁盘上了，
--      而唯一的线索是一条没人会主动去读的审计记录。
--   2. **进程崩在提交之后、清理之前，工作就彻底丢了。**
--      数据库行已经没了，再也查不到该删哪些 key。
--
-- 队列同时解决这两件事：**要删什么在事务里就写下来**，删不掉就重试。
--
-- ## 为什么不只服务账号删除
--
-- 同样形状的工作还有三种：撤回 Publication 之后那一版的派生副本、
-- 用户永久删除单个 Asset、上传落盘但数据库写失败留下的孤儿。
-- 它们都是「有一个 object key 需要在某个时刻消失」，所以 reason 是个字段，
-- 不是四张表。
-- ============================================================================

CREATE TABLE storage_cleanup_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⚠️ 和 account_events 一样**故意没有外键**。
  -- 这张表最典型的一行就是「账号已经删了，字节还没删」——
  -- 加外键的话，需要它的那一刻它正好被级联删掉。
  owner_id    text NOT NULL,

  object_key  text NOT NULL,
  reason      text NOT NULL CHECK (reason IN (
                'account_deleted',
                'publication_withdrawn',
                'asset_deleted',
                'orphan'
              )),

  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'done', 'abandoned')),

  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,

  -- 终态必须有结束时间，pending 必须没有。
  -- 少了这条，「已完成但没有完成时间」这种行会让任何按时间做的对账失真。
  CONSTRAINT chk_cleanup_finished CHECK (
    (status = 'pending' AND finished_at IS NULL)
    OR (status <> 'pending' AND finished_at IS NOT NULL)
  )
);

-- 同一个 key 不能同时有两条待办。
--
-- 部分唯一索引而不是普通唯一：同一个 key 完全可能被清理两次
-- （内容寻址下，删掉之后同一份字节可以被重新上传，将来又被删）。
-- 约束的是「此刻不要重复排队」，不是「历史上只能出现一次」。
CREATE UNIQUE INDEX uq_cleanup_pending_key
  ON storage_cleanup_jobs (object_key)
  WHERE status = 'pending';

-- 工作进程认领用
CREATE INDEX idx_cleanup_due
  ON storage_cleanup_jobs (next_attempt_at)
  WHERE status = 'pending';

-- 报警和对账用：还有多少没清、放弃了多少
CREATE INDEX idx_cleanup_status ON storage_cleanup_jobs (status, created_at DESC);

COMMENT ON TABLE storage_cleanup_jobs IS
  '对象存储的删除待办。owner_id 无外键 —— 最典型的一行就是「账号已删、字节未删」。';
COMMENT ON COLUMN storage_cleanup_jobs.attempts IS
  '已认领次数。认领即 +1，所以崩溃的工作进程不会让这一行永远卡在 pending。';
COMMENT ON COLUMN storage_cleanup_jobs.reason IS
  '为什么要删。account_deleted 之外的三种由后续提交接入（ADR-002 第 5 节）。';
