import {
  requireUser,
  type Actor,
  type CreateJourneyInput,
  type Journey,
  type JourneyId,
} from '@tc/domain';
import type { JourneyRepository, Page } from '@tc/application';
import { assertAffected, translating, type Queryable } from './queryable';
import { JOURNEY_COLUMNS, mapJourney, type JourneyRow } from './rows';

export class PostgresJourneyRepository implements JourneyRepository {
  constructor(private readonly db: Queryable) {}

  async create(actor: Actor, input: CreateJourneyInput): Promise<Journey> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<JourneyRow>(
        `INSERT INTO journeys (user_id, title, type, intent, started_at, ended_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
         RETURNING ${JOURNEY_COLUMNS}`,
        [
          userId,
          input.title,
          input.type,
          input.intent ?? null,
          input.startedAt,
          input.endedAt ?? null,
        ]
      );
      return mapJourney(rows[0]!);
    });
  }

  async findById(actor: Actor, id: JourneyId): Promise<Journey | null> {
    const { userId } = requireUser(actor);
    // user_id 写在 SQL 里而不是取出来再比对 —— 后者一旦有人删掉那行 if
    // 就是静默的越权，而且没有任何测试会变红。
    const { rows } = await this.db.query<JourneyRow>(
      `SELECT ${JOURNEY_COLUMNS} FROM journeys WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] ? mapJourney(rows[0]) : null;
  }

  async listByUser(actor: Actor, page: Page = {}): Promise<Journey[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<JourneyRow>(
      `SELECT ${JOURNEY_COLUMNS} FROM journeys
        WHERE user_id = $1
        ORDER BY started_at DESC, created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, page.limit ?? 100, page.offset ?? 0]
    );
    return rows.map(mapJourney);
  }

  /**
   * 删除 Journey。Moment 不跟着删 —— moments.journey_id 是 ON DELETE SET NULL，
   * 它们变成「未归类」，留在用户的素材里（J-2）。
   */
  async delete(actor: Actor, id: JourneyId): Promise<void> {
    const { userId } = requireUser(actor);
    const res = await this.db.query('DELETE FROM journeys WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ]);
    assertAffected(res.rowCount, 'Journey');
  }
}
