import {
  InvariantViolation,
  NotFoundError,
  requireUser,
  type Actor,
  type MomentId,
  type MomentTombstone,
  type PresentationConfig,
  type RendererType,
  type Work,
  type WorkBlock,
  type WorkBlockId,
  type WorkId,
  type WorkPresentation,
} from '@tc/domain';
import type { AppendBlockInput, Page, WorkRepository } from '@tc/application';
import { assertAffected, translating, type Queryable } from './queryable';
import {
  mapWork,
  mapWorkBlock,
  mapWorkPresentation,
  prefixed,
  WORK_BLOCK_COLUMNS,
  WORK_COLUMNS,
  WORK_PRESENTATION_COLUMNS,
  type WorkBlockRow,
  type WorkPresentationRow,
  type WorkRow,
} from './rows';

export class PostgresWorkRepository implements WorkRepository {
  constructor(private readonly db: Queryable) {}

  // ── Work ───────────────────────────────────────────────────────────────────

  async create(actor: Actor, input: { title: string }): Promise<Work> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<WorkRow>(
        `INSERT INTO works (user_id, title) VALUES ($1, $2) RETURNING ${WORK_COLUMNS}`,
        [userId, input.title]
      );
      return mapWork(rows[0]!);
    });
  }

  async findById(actor: Actor, id: WorkId): Promise<Work | null> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<WorkRow>(
      `SELECT ${WORK_COLUMNS} FROM works WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] ? mapWork(rows[0]) : null;
  }

  async listByUser(actor: Actor, page: Page = {}): Promise<Work[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<WorkRow>(
      `SELECT ${WORK_COLUMNS} FROM works
        WHERE user_id = $1 ORDER BY updated_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, page.limit ?? 100, page.offset ?? 0]
    );
    return rows.map(mapWork);
  }

  /**
   * 删除 Work。已发布的版本不跟着删 —— work_versions.work_id 是
   * ON DELETE SET NULL，Publication 照样能渲染（P-5）。
   */
  async delete(actor: Actor, id: WorkId): Promise<void> {
    const { userId } = requireUser(actor);
    const res = await this.db.query('DELETE FROM works WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ]);
    assertAffected(res.rowCount, 'Work');
  }

  // ── Block ──────────────────────────────────────────────────────────────────

  async listBlocks(actor: Actor, workId: WorkId): Promise<WorkBlock[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<WorkBlockRow>(
      `SELECT ${prefixed(WORK_BLOCK_COLUMNS, 'b')}
         FROM work_blocks b
         JOIN works w ON w.id = b.work_id
        WHERE b.work_id = $1 AND w.user_id = $2
        ORDER BY b.position ASC`,
      [workId, userId]
    );
    return rows.map(mapWorkBlock);
  }

  /**
   * 追加一个 block。
   *
   * position 由数据库算（MAX+1），不由客户端传 —— 客户端算的位置在并发下
   * 必然会撞 uq_work_block_position，而且它凭什么知道当前有几个 block。
   */
  async appendBlock(
    actor: Actor,
    workId: WorkId,
    input: AppendBlockInput
  ): Promise<WorkBlock> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<WorkBlockRow>(
        `INSERT INTO work_blocks (work_id, position, type, text_content, moment_id)
         SELECT w.id,
                COALESCE((SELECT MAX(position) + 1 FROM work_blocks WHERE work_id = w.id), 0),
                $3, $4, $5
           FROM works w
          WHERE w.id = $1 AND w.user_id = $2
         RETURNING ${WORK_BLOCK_COLUMNS}`,
        [workId, userId, input.type, input.textContent ?? null, input.momentId ?? null]
      );
      if (!rows[0]) throw new NotFoundError('Work', 'forbidden');
      return mapWorkBlock(rows[0]);
    });
  }

  async removeBlock(actor: Actor, workId: WorkId, blockId: WorkBlockId): Promise<void> {
    const { userId } = requireUser(actor);
    const res = await this.db.query(
      `DELETE FROM work_blocks b
        USING works w
        WHERE b.id = $1 AND b.work_id = $2 AND w.id = b.work_id AND w.user_id = $3`,
      [blockId, workId, userId]
    );
    assertAffected(res.rowCount, 'WorkBlock');
  }

  /**
   * 按给定顺序重排。
   *
   * orderedIds 必须是该 Work **全部** block 的一个排列 —— 少一个就会留下
   * 位置空洞或重复。这里显式校验，而不是让 uq_work_block_position 去挡：
   * 约束报错说的是「position 撞了」，用户需要知道的是「你漏了一个段落」。
   *
   * 一条 UPDATE ... FROM (VALUES ...) 改完全部行。
   * uq_work_block_position 是 DEFERRABLE INITIALLY DEFERRED，所以中间状态
   * （两行短暂同号）不会被判违规。
   */
  async reorderBlocks(
    actor: Actor,
    workId: WorkId,
    orderedIds: readonly WorkBlockId[]
  ): Promise<WorkBlock[]> {
    const { userId } = requireUser(actor);
    const existing = await this.listBlocks(actor, workId);
    if (existing.length === 0 && orderedIds.length === 0) return [];

    const existingIds = new Set(existing.map((b) => b.id));
    const givenIds = new Set(orderedIds);
    if (
      givenIds.size !== orderedIds.length ||
      existingIds.size !== givenIds.size ||
      [...existingIds].some((id) => !givenIds.has(id))
    ) {
      throw new InvariantViolation(
        'W-3',
        `重排必须给出全部 ${existingIds.size} 个 block 的顺序，且不能重复（收到 ${orderedIds.length} 个）`
      );
    }

    const values = orderedIds.map((_, i) => `($${i + 3}::uuid, ${i})`).join(', ');
    await translating(() =>
      this.db.query(
        `UPDATE work_blocks b
            SET position = v.pos, updated_at = now()
           FROM (VALUES ${values}) AS v(id, pos), works w
          WHERE b.id = v.id AND b.work_id = $1 AND w.id = b.work_id AND w.user_id = $2`,
        [workId, userId, ...orderedIds]
      )
    );

    return this.listBlocks(actor, workId);
  }

  /**
   * 给所有引用某 Moment 的 block 写墓碑。
   *
   * 刻意**不按 actor 过滤 block** —— 这是数据库完整性操作。
   * 漏掉任何一行，接下来的 DELETE moments 都会撞上 chk_block_shape 而失败。
   * 跨用户引用在 addMomentToWork 处已被禁止（并有触发器兜底），
   * 所以正常情况下这里只会命中 actor 自己的 block。
   *
   * 已经有墓碑的不覆盖 —— 墓碑记录的是「删除那一刻的样子」，不该被改写。
   */
  async tombstoneBlocksReferencing(
    actor: Actor,
    momentId: MomentId,
    tombstone: MomentTombstone
  ): Promise<number> {
    requireUser(actor);
    const res = await translating(() =>
      this.db.query(
        `UPDATE work_blocks SET tombstone = $2::jsonb, updated_at = now()
          WHERE moment_id = $1 AND tombstone IS NULL`,
        [momentId, JSON.stringify(tombstone)]
      )
    );
    return res.rowCount ?? 0;
  }

  // ── Presentation ───────────────────────────────────────────────────────────

  async listPresentations(actor: Actor, workId: WorkId): Promise<WorkPresentation[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<WorkPresentationRow>(
      `SELECT ${prefixed(WORK_PRESENTATION_COLUMNS, 'p')}
         FROM work_presentations p
         JOIN works w ON w.id = p.work_id
        WHERE p.work_id = $1 AND w.user_id = $2
        ORDER BY p.renderer_type`,
      [workId, userId]
    );
    return rows.map(mapWorkPresentation);
  }

  async findPresentation(
    actor: Actor,
    workId: WorkId,
    rendererType: RendererType
  ): Promise<WorkPresentation | null> {
    const all = await this.listPresentations(actor, workId);
    return all.find((p) => p.rendererType === rendererType) ?? null;
  }

  /**
   * 删除一种表现方式。已发布的 Publication 不受影响 ——
   * 它引用的是 work_versions.snapshot，那里已经冻了完整的 presentation。
   */
  async deletePresentation(
    actor: Actor,
    workId: WorkId,
    rendererType: RendererType
  ): Promise<void> {
    const { userId } = requireUser(actor);
    const res = await this.db.query(
      `DELETE FROM work_presentations p
        USING works w
        WHERE p.work_id = $1 AND p.renderer_type = $2
          AND w.id = p.work_id AND w.user_id = $3`,
      [workId, rendererType, userId]
    );
    assertAffected(res.rowCount, 'WorkPresentation');
  }

  /**
   * 每种输出各一套配置，互不覆盖（ADR-005 修正）。
   *
   * 原方案把 presentation 做成 Work 上的一个字段，后果是调完杂志排版，
   * 网页版式就没了 —— 同一个 Work 的两种输出在抢同一块存储。
   */
  async upsertPresentation(
    actor: Actor,
    workId: WorkId,
    rendererType: RendererType,
    config: PresentationConfig
  ): Promise<WorkPresentation> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<WorkPresentationRow>(
        `INSERT INTO work_presentations (work_id, renderer_type, config)
         SELECT w.id, $3, $4::jsonb FROM works w WHERE w.id = $1 AND w.user_id = $2
         ON CONFLICT (work_id, renderer_type)
           DO UPDATE SET config = EXCLUDED.config, updated_at = now()
         RETURNING ${WORK_PRESENTATION_COLUMNS}`,
        [workId, userId, rendererType, JSON.stringify(config)]
      );
      if (!rows[0]) throw new NotFoundError('Work', 'forbidden');
      return mapWorkPresentation(rows[0]);
    });
  }
}
