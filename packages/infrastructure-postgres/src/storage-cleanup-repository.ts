/**
 * StorageCleanupRepository 的 PostgreSQL 实现
 *
 * ## 认领用的是 `FOR UPDATE SKIP LOCKED`
 *
 * 这是 Postgres 做工作队列的标准手法，值得写清楚为什么：
 *
 *   不加 FOR UPDATE      两个进程会取到同一批行，同一个对象被删两次
 *                        （删本身幂等，但 attempts 和报警会重复）
 *   只加 FOR UPDATE      第二个进程会**阻塞**等第一个提交，
 *                        并发度退化成串行
 *   FOR UPDATE SKIP LOCKED
 *                        第二个进程直接跳过被锁的行去拿下一批 —— 各干各的
 *
 * ## 认领即计数
 *
 * `attempts` 在**认领**时就 +1，并把 next_attempt_at 推到退避之后。
 * 所以工作进程死在删除中途时，这一行不会永远停在「已认领但没结果」——
 * 退避时间一到它就能被重新认领。
 *
 * 代价是「尝试次数」会把崩溃也算进去。这正是想要的：一个总是让进程崩溃的
 * 对象，就该在若干次之后被放弃并报警，而不是无限拖住队列。
 */

import type { Actor } from '@tc/domain';
import type {
  CleanupReason,
  CleanupStats,
  StorageCleanupJob,
  StorageCleanupRepository,
} from '@tc/application';
import type { Queryable } from './queryable';

interface JobRow {
  id: string;
  owner_id: string;
  object_key: string;
  reason: string;
  attempts: number;
  last_error: string | null;
}

const JOB_COLUMNS = 'id, owner_id, object_key, reason, attempts, last_error';

function mapJob(row: JobRow): StorageCleanupJob {
  return {
    id: row.id,
    ownerId: row.owner_id,
    objectKey: row.object_key,
    reason: row.reason as CleanupReason,
    attempts: row.attempts,
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}

export class PostgresStorageCleanupRepository implements StorageCleanupRepository {
  constructor(private readonly db: Queryable) {}

  /**
   * 幂等入队。
   *
   * `ON CONFLICT ... WHERE status = 'pending'` 里的 WHERE 是用来**指明部分索引**的
   * （推断 uq_cleanup_pending_key），不是过滤条件。写错的话 Postgres 会说
   * 「没有匹配的唯一约束」，而不是静默插入重复行。
   */
  async enqueue(
    actor: Actor,
    jobs: readonly { ownerId: string; objectKey: string; reason: CleanupReason }[]
  ): Promise<number> {
    void actor;
    if (jobs.length === 0) return 0;

    // 一次性插入。逐条 INSERT 在删一个有几百张图的账号时会变成几百次往返，
    // 而这段代码跑在删除事务里 —— 事务开着的时间越长，锁持有得越久。
    const result = await this.db.query(
      `INSERT INTO storage_cleanup_jobs (owner_id, object_key, reason)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
       ON CONFLICT (object_key) WHERE status = 'pending' DO NOTHING`,
      [jobs.map((j) => j.ownerId), jobs.map((j) => j.objectKey), jobs.map((j) => j.reason)]
    );
    return result.rowCount ?? 0;
  }

  /**
   * 退避：1 分钟起，每次翻倍，封顶 1 小时。**只有这一处实现**（写在 SQL 里）——
   * 再写一个 TypeScript 版本用于「校验」，两边迟早会不一致。
   *
   * SET 子句里的 `j.attempts` 取的是**更新前**的值，所以第一次认领是 60 秒。
   */
  async claimBatch(actor: Actor, now: Date, limit: number): Promise<StorageCleanupJob[]> {
    void actor;
    const { rows } = await this.db.query<JobRow>(
      `UPDATE storage_cleanup_jobs j
          SET attempts = j.attempts + 1,
              next_attempt_at = $1::timestamptz
                + make_interval(secs => LEAST(60 * power(2, j.attempts)::int, 3600))
        WHERE j.id IN (
          SELECT id FROM storage_cleanup_jobs
           WHERE status = 'pending' AND next_attempt_at <= $1
           ORDER BY next_attempt_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )
        RETURNING ${JOB_COLUMNS}`,
      [now, limit]
    );
    return rows.map(mapJob);
  }

  async markDone(actor: Actor, id: string, at: Date): Promise<void> {
    void actor;
    await this.db.query(
      `UPDATE storage_cleanup_jobs
          SET status = 'done', finished_at = $2, last_error = NULL
        WHERE id = $1 AND status = 'pending'`,
      [id, at]
    );
  }

  async markFailed(
    actor: Actor,
    id: string,
    error: string,
    at: Date,
    maxAttempts: number
  ): Promise<void> {
    void actor;
    // 达到上限就放弃。无限重试等于无限报警 —— 一个永远删不掉的对象会把
    // 队列的告警噪音拉满，让真正的问题淹没在里面。
    await this.db.query(
      `UPDATE storage_cleanup_jobs
          SET last_error = $2,
              status = CASE WHEN attempts >= $4 THEN 'abandoned' ELSE 'pending' END,
              finished_at = CASE WHEN attempts >= $4 THEN $3::timestamptz ELSE NULL END
        WHERE id = $1 AND status = 'pending'`,
      [id, error.slice(0, 2000), at, maxAttempts]
    );
  }

  async stats(actor: Actor): Promise<CleanupStats> {
    void actor;
    const { rows } = await this.db.query<{ pending: string; abandoned: string }>(
      `SELECT count(*) FILTER (WHERE status = 'pending')::text   AS pending,
              count(*) FILTER (WHERE status = 'abandoned')::text AS abandoned
         FROM storage_cleanup_jobs`
    );
    return {
      pending: Number(rows[0]?.pending ?? 0),
      abandoned: Number(rows[0]?.abandoned ?? 0),
    };
  }

  async listPendingFor(actor: Actor, ownerId: string): Promise<StorageCleanupJob[]> {
    void actor;
    const { rows } = await this.db.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM storage_cleanup_jobs
        WHERE owner_id = $1 AND status = 'pending'
        ORDER BY created_at`,
      [ownerId]
    );
    return rows.map(mapJob);
  }
}
