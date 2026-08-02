import {
  NotFoundError,
  requireUser,
  type Actor,
  type MomentId,
  type Observation,
} from '@tc/domain';
import type { AddObservationInput, ObservationRepository } from '@tc/application';
import { translating, type Queryable } from './queryable';
import { OBSERVATION_COLUMNS, mapObservation, type ObservationRow } from './rows';

export class PostgresObservationRepository implements ObservationRepository {
  constructor(private readonly db: Queryable) {}

  /**
   * 追加一条观察。
   *
   * ## 为什么是 INSERT ... SELECT 而不是「先查所有权再插入」
   *
   * 先 SELECT 确认 Moment 属于自己、再 INSERT，中间有一个 TOCTOU 窗口，
   * 而且多一次往返。这里让**同一条语句**既做所有权判断又做写入：
   * Moment 不属于 actor，SELECT 就是空集，什么都不会插进去。
   *
   * user_id 取的是 `m.user_id` 而不是参数 —— 少一个可以传错的值。
   */
  async add(
    actor: Actor,
    momentId: MomentId,
    input: AddObservationInput
  ): Promise<Observation> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<ObservationRow>(
        `INSERT INTO observations (moment_id, user_id, content, recorded_at)
         SELECT m.id, m.user_id, $3, COALESCE($4::timestamptz, now())
           FROM moments m
          WHERE m.id = $1 AND m.user_id = $2
         RETURNING ${OBSERVATION_COLUMNS}`,
        [momentId, userId, input.content, input.recordedAt ?? null]
      );
      // 空集 = Moment 不存在，或者是别人的。对外是同一个错误。
      if (!rows[0]) throw new NotFoundError('Moment', 'forbidden');
      return mapObservation(rows[0]);
    });
  }

  async listByMoment(actor: Actor, momentId: MomentId): Promise<Observation[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<ObservationRow>(
      `SELECT ${OBSERVATION_COLUMNS} FROM observations
        WHERE moment_id = $1 AND user_id = $2
        ORDER BY recorded_at ASC, created_at ASC`,
      [momentId, userId]
    );
    return rows.map(mapObservation);
  }

  /** 批量版本 —— 发布快照要读十几个 Moment，逐个查就是 N+1 */
  async listByMoments(actor: Actor, momentIds: readonly MomentId[]): Promise<Observation[]> {
    const { userId } = requireUser(actor);
    if (momentIds.length === 0) return [];
    const { rows } = await this.db.query<ObservationRow>(
      `SELECT ${OBSERVATION_COLUMNS} FROM observations
        WHERE moment_id = ANY($1::uuid[]) AND user_id = $2
        ORDER BY moment_id, recorded_at ASC, created_at ASC`,
      [momentIds, userId]
    );
    return rows.map(mapObservation);
  }
}
