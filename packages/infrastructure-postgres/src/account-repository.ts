/**
 * AccountRepository 的 PostgreSQL 实现 —— ADR-007
 *
 * 这个文件是**唯一**允许出现 `DELETE FROM "user"` 的地方。
 * 数据库的 trg_guard_user_delete 触发器会强制这一点：任何没有先
 * `SET LOCAL tc.allow_user_delete = '<user id>'` 的删除语句都会直接报错。
 *
 * ## 关于 actor
 *
 * 这里的方法大多不用 actor 做 user_id 过滤 —— 账号状态的读写要么是
 * 系统操作（停用、定时删除），要么是本人操作（申请、撤销）。
 * 权限判断在用例层，因为它需要区分「本人」和「运维」两种合法调用者，
 * 而 Repository 看不出这个区别。
 *
 * 签名仍然带 actor：一是 check-architecture 的硬规则，
 * 二是它让「这一层没有做授权」在调用处是看得见的。
 */

import {
  NotFoundError,
  isPersistedAccountStatus,
  type Account,
  type AccountEvent,
  type AccountEventType,
  type AccountStatus,
  type Actor,
  type PersistedAccountStatus,
} from '@tc/domain';
import type {
  AccountEventInput,
  AccountRepository,
  AccountTransition,
  Page,
} from '@tc/application';
import { translating, type Queryable } from './queryable';

interface AccountRow {
  id: string;
  email: string;
  status: string;
  status_changed_at: Date | string;
  deletion_requested_at: Date | string | null;
  deletion_effective_at: Date | string | null;
}

interface EventRow {
  id: string;
  user_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_type: string;
  actor_id: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  occurred_at: Date | string;
}

const ACCOUNT_COLUMNS =
  'id, email, status, status_changed_at, deletion_requested_at, deletion_effective_at';

const EVENT_COLUMNS =
  'id, user_id, event_type, from_status, to_status, actor_type, actor_id, reason, detail, occurred_at';

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function mapAccount(row: AccountRow): Account {
  if (row.status === undefined) {
    throw new Error('AccountRow 缺少 status —— SELECT 漏了列');
  }
  if (!isPersistedAccountStatus(row.status)) {
    // 不静默降级成 active。一个读不懂的状态意味着 schema 和代码不同步，
    // 而这里判断错的后果是「本该下架的内容还挂在网上」。
    throw new Error(`未知的账号状态 ${JSON.stringify(row.status)} —— 代码与 schema 不同步`);
  }
  const requestedAt = row.deletion_requested_at;
  const effectiveAt = row.deletion_effective_at;
  return {
    userId: row.id,
    email: row.email,
    status: row.status,
    statusChangedAt: toDate(row.status_changed_at),
    ...(requestedAt && effectiveAt
      ? { deletion: { requestedAt: toDate(requestedAt), effectiveAt: toDate(effectiveAt) } }
      : {}),
  };
}

function mapEvent(row: EventRow): AccountEvent {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.event_type as AccountEventType,
    ...(row.from_status ? { fromStatus: row.from_status as AccountStatus } : {}),
    ...(row.to_status ? { toStatus: row.to_status as AccountStatus } : {}),
    actorType: row.actor_type as AccountEvent['actorType'],
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    detail: row.detail ?? {},
    occurredAt: toDate(row.occurred_at),
  };
}

function actorColumns(actor: Actor): { type: string; id: string | null } {
  if (actor.type === 'user') return { type: 'user', id: actor.userId };
  if (actor.type === 'system') return { type: 'system', id: null };
  return { type: 'anonymous', id: null };
}

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly db: Queryable) {}

  async findById(actor: Actor, userId: string): Promise<Account | null> {
    void actor;
    const { rows } = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM "user" WHERE id = $1`,
      [userId]
    );
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async findStatus(actor: Actor, userId: string): Promise<PersistedAccountStatus | null> {
    void actor;
    const { rows } = await this.db.query<{ status: string }>(
      `SELECT status FROM "user" WHERE id = $1`,
      [userId]
    );
    const status = rows[0]?.status;
    if (status === undefined) return null;
    if (!isPersistedAccountStatus(status)) {
      throw new Error(`未知的账号状态 ${JSON.stringify(status)} —— 代码与 schema 不同步`);
    }
    return status;
  }

  async findByCancelTokenHash(actor: Actor, tokenHash: string): Promise<Account | null> {
    void actor;
    // 空串会匹配不到任何行（列上有 NOT NULL 的部分唯一索引），
    // 但显式挡掉更清楚：空令牌不是「碰巧没匹配」，是调用方传错了。
    if (!tokenHash) return null;
    const { rows } = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM "user" WHERE deletion_cancel_token_hash = $1`,
      [tokenHash]
    );
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  /**
   * compare-and-set。`WHERE status = $2` 是这段代码的全部要点 ——
   * 并发的第二个请求会匹配到 0 行，然后拿到 NotFoundError，
   * 而不是覆盖第一个请求刚写好的等待期。
   */
  async transition(
    actor: Actor,
    userId: string,
    input: AccountTransition
  ): Promise<Account> {
    void actor;
    const d = input.deletion;
    return translating(async () => {
      const { rows } = await this.db.query<AccountRow>(
        `UPDATE "user"
            SET status = $3,
                status_changed_at = $4,
                deletion_requested_at = $5,
                deletion_effective_at = $6,
                deletion_cancel_token_hash = $7,
                updated_at = $4
          WHERE id = $1 AND status = $2
          RETURNING ${ACCOUNT_COLUMNS}`,
        [
          userId,
          input.from,
          input.to,
          input.at,
          d?.requestedAt ?? null,
          d?.effectiveAt ?? null,
          d?.cancelTokenHash ?? null,
        ]
      );
      if (!rows[0]) {
        // 两种情况合并成一种错误：账号不存在，或者它已经不在 from 状态了。
        // 对调用方而言处置相同（重新读一次再决定），区分开只会让
        // 「账号是否存在」从这里泄露出去。
        throw new NotFoundError('Account', 'forbidden');
      }
      return mapAccount(rows[0]);
    });
  }

  async listDueForDeletion(actor: Actor, now: Date, limit = 100): Promise<Account[]> {
    void actor;
    const { rows } = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM "user"
        WHERE status = 'deletion_requested' AND deletion_effective_at <= $1
        ORDER BY deletion_effective_at ASC
        LIMIT $2`,
      [now, limit]
    );
    return rows.map(mapAccount);
  }

  /**
   * 认领一个到期账号。SKIP LOCKED 让并发的工作进程各取各的。
   *
   * 锁只在**当前事务**内有效，所以调用方必须在同一个事务里把删除做完 ——
   * 否则锁一放开，另一个进程就会拿到同一行。
   */
  async claimNextDueForDeletion(actor: Actor, now: Date): Promise<Account | null> {
    void actor;
    const { rows } = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM "user"
        WHERE status = 'deletion_requested' AND deletion_effective_at <= $1
        ORDER BY deletion_effective_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [now]
    );
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  /**
   * 点名锁一个账号。这里**不能**用 SKIP LOCKED —— 调用方指名要删这一个，
   * 跳过它然后返回「没找到」会被误读成「已经删完了」。
   * 阻塞等待才对：前一个事务提交后，这里会看到行已消失并返回 null。
   */
  async lockForDeletion(actor: Actor, userId: string): Promise<Account | null> {
    void actor;
    const { rows } = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM "user" WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async revokeSessions(actor: Actor, userId: string): Promise<number> {
    void actor;
    const result = await this.db.query(`DELETE FROM session WHERE user_id = $1`, [userId]);
    return result.rowCount ?? 0;
  }

  async recordEvent(actor: Actor, input: AccountEventInput): Promise<AccountEvent> {
    const who = actorColumns(actor);
    const reason =
      input.reason ?? (actor.type === 'system' ? actor.reason : undefined) ?? null;
    const { rows } = await this.db.query<EventRow>(
      `INSERT INTO account_events
         (user_id, event_type, from_status, to_status, actor_type, actor_id, reason, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING ${EVENT_COLUMNS}`,
      [
        input.userId,
        input.type,
        input.fromStatus ?? null,
        input.toStatus ?? null,
        who.type,
        who.id,
        reason,
        JSON.stringify(input.detail ?? {}),
      ]
    );
    return mapEvent(rows[0]!);
  }

  async listEvents(actor: Actor, userId: string, page: Page = {}): Promise<AccountEvent[]> {
    void actor;
    const { rows } = await this.db.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM account_events
        WHERE user_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [userId, page.limit ?? 100, page.offset ?? 0]
    );
    return rows.map(mapEvent);
  }

  /**
   * 原始素材 + 发布派生副本的全部 object key。
   *
   * 两张表 UNION 而不是只查 assets：派生副本的 key 是内容寻址算出来的，
   * 和原图不同（尺寸和格式都变了），漏掉它等于把发布过的图片永久留在磁盘上。
   */
  async listStorageKeys(actor: Actor, userId: string): Promise<string[]> {
    void actor;
    const { rows } = await this.db.query<{ object_key: string }>(
      `SELECT object_key FROM assets WHERE user_id = $1
       UNION
       SELECT object_key FROM published_assets WHERE user_id = $1`,
      [userId]
    );
    return rows.map((r) => r.object_key);
  }

  /**
   * 永久删除。**整个系统唯一一处 DELETE FROM "user"。**
   *
   * `SET LOCAL` 只在当前事务内有效 —— 所以这个方法必须在事务里调用，
   * 而且放行的范围精确到这一个 id：即使有人在同一事务里追加一条
   * `DELETE FROM "user"`（不带 WHERE），触发器也会在第二行上拦住它。
   */
  async purge(actor: Actor, userId: string): Promise<void> {
    void actor;

    // ⚠️ 必须先删 works，不能直接指望 CASCADE 一把清完。
    //
    // work_blocks.moment_id 是 ON DELETE SET NULL（作者删掉某个 Moment 时，
    // 引用它的 block 会先被写上墓碑再置空）。而 chk_block_shape 要求每个
    // block 要么有 moment_id 要么有 tombstone。
    //
    // 级联删除时 Postgres 不保证先删哪张表。如果 moments 先走，那些
    // work_blocks 会在同一条语句里变成「既没有 moment 也没有墓碑」，
    // CHECK 立刻报错，整个删除回滚 —— 症状是「删不掉有作品的账号」。
    //
    // 先删 works 就没有这个问题：work_blocks 跟着 works 一起消失，
    // 轮到 moments 时已经没有任何 block 引用它们了。
    await this.db.query(`DELETE FROM works WHERE user_id = $1`, [userId]);

    // `SET LOCAL` 不接受参数占位符，拼字符串又会引入注入面。
    // set_config(name, value, is_local=true) 等价于 SET LOCAL，且可以传参。
    await this.db.query(`SELECT set_config('tc.allow_user_delete', $1, true)`, [userId]);
    const result = await this.db.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
    if (!result.rowCount) {
      throw new NotFoundError('Account');
    }
  }
}
