import {
  requireUser,
  userProvenance,
  type Actor,
  type CreateMomentInput,
  type JourneyId,
  type Moment,
  type MomentId,
} from '@tc/domain';
import type { MomentFilter, MomentRepository } from '@tc/application';
import { assertAffected, translating, type Queryable } from './queryable';
import { MOMENT_COLUMNS, mapMoment, type MomentRow } from './rows';

export class PostgresMomentRepository implements MomentRepository {
  constructor(private readonly db: Queryable) {}

  /**
   * 建一个 Moment。
   *
   * **不要求照片。** 全部字段都可空 —— 一句观察就足以构成一个 Moment。
   *
   * provenance 在这里就写上 `source: 'user'`，而不是等接入 EXIF / AI 再补：
   * 补的那天没人分得清哪些历史数据是用户亲手填的，整列就退化成装饰。
   */
  async create(actor: Actor, input: CreateMomentInput): Promise<Moment> {
    const { userId } = requireUser(actor);
    const provenance = userProvenance(
      { title: input.title, occurredAt: input.occurredAt, placeLabel: input.placeLabel },
      new Date().toISOString()
    );

    return translating(async () => {
      // journey_id 的所有权由用例层校验（跨用户归类必须失败）。
      // 这里不重复查 —— 重复的检查会让「到底谁负责」变模糊。
      const { rows } = await this.db.query<MomentRow>(
        `INSERT INTO moments (user_id, journey_id, title, occurred_at, place_label, provenance)
         VALUES ($1, $2, $3, $4::timestamptz, $5, $6::jsonb)
         RETURNING ${MOMENT_COLUMNS}`,
        [
          userId,
          input.journeyId ?? null,
          input.title ?? null,
          input.occurredAt ?? null,
          input.placeLabel ?? null,
          JSON.stringify(provenance),
        ]
      );
      return mapMoment(rows[0]!);
    });
  }

  async findById(actor: Actor, id: MomentId): Promise<Moment | null> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<MomentRow>(
      `SELECT ${MOMENT_COLUMNS} FROM moments WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] ? mapMoment(rows[0]) : null;
  }

  async listByUser(actor: Actor, filter: MomentFilter = {}): Promise<Moment[]> {
    const { userId } = requireUser(actor);
    const params: unknown[] = [userId];
    const where = ['user_id = $1'];

    // null 和 undefined 是两种不同的意思，不能合并：
    //   null      只要未归类的
    //   undefined 全部
    if (filter.journeyId === null) {
      where.push('journey_id IS NULL');
    } else if (filter.journeyId !== undefined) {
      params.push(filter.journeyId);
      where.push(`journey_id = $${params.length}`);
    }

    params.push(filter.limit ?? 200, filter.offset ?? 0);
    const { rows } = await this.db.query<MomentRow>(
      `SELECT ${MOMENT_COLUMNS} FROM moments
        WHERE ${where.join(' AND ')}
        ORDER BY occurred_at DESC NULLS LAST, created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows.map(mapMoment);
  }

  async assignToJourney(
    actor: Actor,
    id: MomentId,
    journeyId: JourneyId | null
  ): Promise<Moment> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<MomentRow>(
        `UPDATE moments SET journey_id = $3
          WHERE id = $1 AND user_id = $2
          RETURNING ${MOMENT_COLUMNS}`,
        [id, userId, journeyId]
      );
      if (!rows[0]) assertAffected(0, 'Moment');
      return mapMoment(rows[0]!);
    });
  }

  /**
   * 删除 Moment。
   *
   * ⚠️ 引用它的 work_blocks 必须**先**拿到墓碑，否则 chk_block_shape 会让
   * 这条 DELETE 失败（moment_id 被置空后 block 既没有 Moment 也没有墓碑）。
   * 编排见 use-cases/moment.ts 的 deleteMoment。
   */
  async delete(actor: Actor, id: MomentId): Promise<void> {
    const { userId } = requireUser(actor);
    await translating(async () => {
      const res = await this.db.query('DELETE FROM moments WHERE id = $1 AND user_id = $2', [
        id,
        userId,
      ]);
      assertAffected(res.rowCount, 'Moment');
    });
  }
}
