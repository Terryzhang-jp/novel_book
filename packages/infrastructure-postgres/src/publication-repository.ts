import {
  NotFoundError,
  requireUser,
  type Actor,
  type Publication,
  type PublicationId,
  type Visibility,
  type WorkId,
  type WorkSnapshot,
  type WorkVersion,
  type WorkVersionId,
} from '@tc/domain';
import type { Page, PublicationRepository, PublishedPage } from '@tc/application';
import { assertAffected, translating, type Queryable } from './queryable';
import {
  mapPublication,
  mapWorkVersion,
  prefixed,
  PUBLICATION_COLUMNS,
  WORK_VERSION_COLUMNS,
  type PublicationRow,
  type WorkVersionRow,
} from './rows';

/**
 * JOIN 查询取整行。
 *
 * publications 和 work_versions 都有 id / user_id / created_at，直接 JOIN
 * 会互相覆盖。逐列起别名要写二十几个 AS，改一列就得记得改两处；
 * `to_jsonb(表别名)` 一次拿整行，列变了不用改这里。
 *
 * 代价是时间戳变成 ISO 字符串而不是 Date —— 已在 rows.ts 的行类型里承认。
 */
interface JoinedRow {
  publication: PublicationRow;
  version: WorkVersionRow;
}

const JOINED_SELECT = 'to_jsonb(p) AS publication, to_jsonb(v) AS version';

function mapJoined(row: JoinedRow): PublishedPage {
  return { publication: mapPublication(row.publication), version: mapWorkVersion(row.version) };
}

export class PostgresPublicationRepository implements PublicationRepository {
  constructor(private readonly db: Queryable) {}

  // ── Version ────────────────────────────────────────────────────────────────

  /**
   * 下一个版本号。
   *
   * 从 works 起手 JOIN 而不是直接查 work_versions —— 后者在 Work 不属于
   * actor（或不存在）时会返回 1，让调用方以为「这是第一次发布」。
   */
  async nextVersionNumber(actor: Actor, workId: WorkId): Promise<number> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<{ next: string }>(
      `SELECT COALESCE(MAX(v.version_number), 0) + 1 AS next
         FROM works w
         LEFT JOIN work_versions v ON v.work_id = w.id
        WHERE w.id = $1 AND w.user_id = $2
        GROUP BY w.id`,
      [workId, userId]
    );
    if (!rows[0]) throw new NotFoundError('Work', 'forbidden');
    return Number(rows[0].next);
  }

  async createVersion(
    actor: Actor,
    input: { workId: WorkId; versionNumber: number; snapshot: WorkSnapshot }
  ): Promise<WorkVersion> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<WorkVersionRow>(
        `INSERT INTO work_versions (work_id, user_id, version_number, snapshot)
         SELECT w.id, w.user_id, $3, $4::jsonb
           FROM works w WHERE w.id = $1 AND w.user_id = $2
         RETURNING ${WORK_VERSION_COLUMNS}`,
        [input.workId, userId, input.versionNumber, JSON.stringify(input.snapshot)]
      );
      if (!rows[0]) throw new NotFoundError('Work', 'forbidden');
      return mapWorkVersion(rows[0]);
    });
  }

  async listVersions(actor: Actor, workId: WorkId): Promise<WorkVersion[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<WorkVersionRow>(
      `SELECT ${WORK_VERSION_COLUMNS} FROM work_versions
        WHERE work_id = $1 AND user_id = $2
        ORDER BY version_number DESC`,
      [workId, userId]
    );
    return rows.map(mapWorkVersion);
  }

  // ── Publication ────────────────────────────────────────────────────────────

  async create(
    actor: Actor,
    input: { workVersionId: WorkVersionId; slug: string; visibility: Visibility }
  ): Promise<Publication> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<PublicationRow>(
        `INSERT INTO publications (work_version_id, user_id, slug, visibility)
         SELECT v.id, v.user_id, $3, $4
           FROM work_versions v WHERE v.id = $1 AND v.user_id = $2
         RETURNING ${PUBLICATION_COLUMNS}`,
        [input.workVersionId, userId, input.slug, input.visibility]
      );
      if (!rows[0]) throw new NotFoundError('WorkVersion', 'forbidden');
      return mapPublication(rows[0]);
    });
  }

  /**
   * 重新发布：同一个 slug 指向新版本。
   *
   * 顺带清掉 withdrawn_at —— 「再次发布」本身就是一个明确的上线动作，
   * 要求用户先「取消下架」再「发布」是多此一举的仪式。
   */
  async repoint(
    actor: Actor,
    id: PublicationId,
    workVersionId: WorkVersionId
  ): Promise<Publication> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<PublicationRow>(
        `UPDATE publications p
            SET work_version_id = v.id, withdrawn_at = NULL
           FROM work_versions v
          WHERE p.id = $1 AND p.user_id = $2 AND v.id = $3 AND v.user_id = $2
          RETURNING ${prefixed(PUBLICATION_COLUMNS, 'p')}`,
        [id, userId, workVersionId]
      );
      if (!rows[0]) throw new NotFoundError('Publication', 'forbidden');
      return mapPublication(rows[0]);
    });
  }

  /**
   * 撤回。**不删记录**（P-4）。
   *
   * 幂等：已下架的再撤一次不报错，withdrawn_at 保持首次的时间 ——
   * 下架时间是个有意义的事实，不该被重复点击改写。
   */
  async withdraw(actor: Actor, id: PublicationId): Promise<Publication> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<PublicationRow>(
      `UPDATE publications SET withdrawn_at = COALESCE(withdrawn_at, now())
        WHERE id = $1 AND user_id = $2
        RETURNING ${PUBLICATION_COLUMNS}`,
      [id, userId]
    );
    if (!rows[0]) assertAffected(0, 'Publication');
    return mapPublication(rows[0]!);
  }

  async findByWork(actor: Actor, workId: WorkId): Promise<PublishedPage | null> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<JoinedRow>(
      `SELECT ${JOINED_SELECT}
         FROM publications p
         JOIN work_versions v ON v.id = p.work_version_id
        WHERE v.work_id = $1 AND p.user_id = $2
        ORDER BY p.published_at ASC
        LIMIT 1`,
      [workId, userId]
    );
    return rows[0] ? mapJoined(rows[0]) : null;
  }

  async listByUser(actor: Actor, page: Page = {}): Promise<PublishedPage[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<JoinedRow>(
      `SELECT ${JOINED_SELECT}
         FROM publications p
         JOIN work_versions v ON v.id = p.work_version_id
        WHERE p.user_id = $1
        ORDER BY p.published_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, page.limit ?? 100, page.offset ?? 0]
    );
    return rows.map(mapJoined);
  }

  /**
   * 按 slug 读取。**允许 anonymous** —— 这是唯一不调 requireUser 的方法。
   *
   * ## ADR-006 判定标准就落在这条 SQL 上
   *
   * 只有 publications 和 work_versions 两张表。**没有** moments、
   * observations、interpretation_revisions、work_blocks、work_presentations。
   * 渲染发布页所需的一切都在 v.snapshot 里。
   *
   * test/integration/publication-snapshot.test.ts 会把那五张实时表全部改名，
   * 然后要求这个方法照样返回可渲染的结果 —— 少了这条测试，
   * 「快照自洽」就只是一句注释。
   */
  async findBySlug(actor: Actor, slug: string): Promise<PublishedPage | null> {
    // 可见性判断在用例层（viewPublication）——「已下架」和「不存在」
    // 在产品上是两种不同的页面，Repository 不该替它做决定。
    void actor;
    const { rows } = await this.db.query<JoinedRow>(
      `SELECT ${JOINED_SELECT}
         FROM publications p
         JOIN work_versions v ON v.id = p.work_version_id
        WHERE p.slug = $1`,
      [slug]
    );
    return rows[0] ? mapJoined(rows[0]) : null;
  }
}
