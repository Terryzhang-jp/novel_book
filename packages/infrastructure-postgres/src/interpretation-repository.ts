import {
  InvariantViolation,
  NotFoundError,
  requireUser,
  type Actor,
  type InterpretationRevision,
  type MomentId,
} from '@tc/domain';
import type { AppendInterpretationInput, InterpretationRepository } from '@tc/application';
import { translating, type Queryable } from './queryable';
import { INTERPRETATION_COLUMNS, mapInterpretation, type InterpretationRow } from './rows';

export class PostgresInterpretationRepository implements InterpretationRepository {
  constructor(private readonly db: Queryable) {}

  async listByMoment(actor: Actor, momentId: MomentId): Promise<InterpretationRevision[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<InterpretationRow>(
      `SELECT ${INTERPRETATION_COLUMNS} FROM interpretation_revisions
        WHERE moment_id = $1 AND user_id = $2
        ORDER BY created_at ASC`,
      [momentId, userId]
    );
    return rows.map(mapInterpretation);
  }

  async findCurrent(actor: Actor, momentId: MomentId): Promise<InterpretationRevision | null> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<InterpretationRow>(
      `SELECT ${INTERPRETATION_COLUMNS} FROM interpretation_revisions
        WHERE moment_id = $1 AND user_id = $2 AND status = 'current'`,
      [momentId, userId]
    );
    // uq_interpretation_current 保证最多一条。多于一条说明索引被人删了。
    if (rows.length > 1) {
      throw new InvariantViolation(
        'I-1',
        `Moment ${momentId} 有 ${rows.length} 条 current —— uq_interpretation_current 可能已失效`
      );
    }
    return rows[0] ? mapInterpretation(rows[0]) : null;
  }

  async listCurrentByMoments(
    actor: Actor,
    momentIds: readonly MomentId[]
  ): Promise<InterpretationRevision[]> {
    const { userId } = requireUser(actor);
    if (momentIds.length === 0) return [];
    const { rows } = await this.db.query<InterpretationRow>(
      `SELECT ${INTERPRETATION_COLUMNS} FROM interpretation_revisions
        WHERE moment_id = ANY($1::uuid[]) AND user_id = $2 AND status = 'current'`,
      [momentIds, userId]
    );
    return rows.map(mapInterpretation);
  }

  /**
   * 追加一版理解。**必须在事务里调用。**
   *
   * ## 顺序不能反
   *
   *   1. 把被取代的那版标记成 superseded
   *   2. 插入新的 current
   *
   * 反过来做会撞上 `uq_interpretation_current`（一个 Moment 只能有一条
   * current）。这个报错是好事 —— 它说明约束在工作。
   *
   * ## 第 1 步影响 0 行意味着什么
   *
   * 说明在我们读到 current 和执行 UPDATE 之间，**别人已经取代过它了**。
   * 这时如果继续插入，两条 revision 会同时 supersede 同一版 ——
   * 理解链分叉，「我现在的理解是哪条」将无法回答。
   * 所以这里直接失败，让用户刷新后基于最新版本再写。
   */
  async append(
    actor: Actor,
    momentId: MomentId,
    input: AppendInterpretationInput
  ): Promise<InterpretationRevision> {
    const { userId } = requireUser(actor);

    return translating(async () => {
      if (input.supersedesId) {
        const res = await this.db.query(
          `UPDATE interpretation_revisions
              SET status = 'superseded'
            WHERE id = $1 AND moment_id = $2 AND user_id = $3 AND status = 'current'`,
          [input.supersedesId, momentId, userId]
        );
        if (!res.rowCount) {
          throw new InvariantViolation(
            'I-5',
            `${input.supersedesId} 已经不是当前理解了 —— 请刷新后基于最新一版再写，` +
              '否则理解链会分叉'
          );
        }
      }

      const { rows } = await this.db.query<InterpretationRow>(
        `INSERT INTO interpretation_revisions
           (moment_id, user_id, content, supersedes_id, based_on_observation_ids, status)
         SELECT m.id, m.user_id, $3, $4, $5::uuid[], 'current'
           FROM moments m
          WHERE m.id = $1 AND m.user_id = $2
         RETURNING ${INTERPRETATION_COLUMNS}`,
        [
          momentId,
          userId,
          input.content,
          input.supersedesId ?? null,
          input.basedOnObservationIds,
        ]
      );
      if (!rows[0]) throw new NotFoundError('Moment', 'forbidden');
      return mapInterpretation(rows[0]);
    });
  }
}
