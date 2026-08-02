/**
 * PhotoRepository 的标准 PostgreSQL 实现
 *
 * ADR-000：不依赖 Supabase SDK，只用普通 pg driver。
 * 这让照片相关的业务逻辑可以在「本地 Postgres + 无 Docker」的环境下
 * 完整测试 —— 也是把遗留能力迁进新核心的第一块跳板。
 *
 * 定位：**遗留能力 adapter，不是新领域层的 Repository。**
 * 它服务于旧的 Photo 模型；Phase 2 的 Asset / Moment 会另起。
 */

import type { Pool } from 'pg';
import { type Actor, NotFoundError, requireUser } from '@tc/domain';
import type {
  CreatePhotoInput,
  ListPhotosOptions,
  PhotoRepository,
} from './repository';
import { mapPhotoRow, type Photo, type PhotoRow } from './types';

/**
 * 所有查询共用的列清单。
 *
 * 集中定义的理由：旧系统的 Gallery bug 正是因为某个方法的 SELECT 少取了
 * metadata 和 location_id。写成常量之后，「某个方法漏列」这种错误不可能
 * 再发生 —— 要么都有，要么都没有。
 */
const COLUMNS = `
  id, user_id, file_name, original_name, file_url, thumbnail_url,
  location_id, metadata, category, title, tags,
  is_public, trashed, trashed_at, edited, original_file_url,
  created_at, updated_at
`;

export class PostgresPhotoRepository implements PhotoRepository {
  constructor(private readonly pool: Pool) {}

  // ── 读 ─────────────────────────────────────────────────────────────────────

  async list(actor: Actor, options: ListPhotosOptions = {}): Promise<Photo[]> {
    const { userId } = requireUser(actor);
    const {
      limit = 50,
      offset = 0,
      sortOrder = 'newest',
      category,
      includeTrashed = false,
    } = options;

    const dir = sortOrder === 'oldest' ? 'ASC' : 'DESC';
    const params: unknown[] = [userId];
    const where = ['user_id = $1'];

    if (!includeTrashed) where.push('trashed IS NOT TRUE');
    if (category) {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    params.push(limit, offset);

    // 多级排序：先按拍摄时间，无拍摄时间的排后面，再按创建时间。
    // NULLS LAST 与 DESC/ASC 的组合要显式写出来，不能依赖默认值 ——
    // Postgres 里 DESC 默认 NULLS FIRST，那会让没有 EXIF 时间的照片排到最前。
    const { rows } = await this.pool.query<PhotoRow>(
      `SELECT ${COLUMNS} FROM photos
        WHERE ${where.join(' AND ')}
        ORDER BY (metadata->>'dateTime') ${dir} NULLS LAST, created_at ${dir}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows.map(mapPhotoRow);
  }

  async findById(actor: Actor, id: string): Promise<Photo | null> {
    const { userId } = requireUser(actor);
    // user_id 条件写在 SQL 里，而不是取出来再比对 ——
    // 后者一旦有人删掉那行 if 就是静默的越权。
    const { rows } = await this.pool.query<PhotoRow>(
      `SELECT ${COLUMNS} FROM photos WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    const row = rows[0];
    return row ? mapPhotoRow(row) : null;
  }

  async listPublic(actor: Actor, options: { limit?: number } = {}): Promise<Photo[]> {
    // 唯一接受 anonymous 的方法 —— 不调 requireUser
    void actor;
    const { rows } = await this.pool.query<PhotoRow>(
      `SELECT ${COLUMNS} FROM photos
        WHERE is_public IS TRUE AND trashed IS NOT TRUE
        ORDER BY created_at DESC
        LIMIT $1`,
      [options.limit ?? 100]
    );
    return rows.map(mapPhotoRow);
  }

  // ── 写 ─────────────────────────────────────────────────────────────────────

  async create(actor: Actor, input: CreatePhotoInput): Promise<Photo> {
    const { userId } = requireUser(actor);
    // is_public 不出现在 INSERT 里 —— 走数据库默认值 false。
    // 显式写 false 也可以，但让默认值生效能顺便验证 migration 009 没被改掉。
    const { rows } = await this.pool.query<PhotoRow>(
      `INSERT INTO photos
         (id, user_id, file_name, original_name, file_url, thumbnail_url,
          location_id, metadata, category)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.fileName,
        input.originalName,
        input.fileUrl,
        input.thumbnailUrl ?? null,
        input.locationId ?? null,
        JSON.stringify(input.metadata),
        input.category,
      ]
    );
    return mapPhotoRow(rows[0]!);
  }

  /**
   * 所有写操作共用的形状：UPDATE ... WHERE id AND user_id RETURNING。
   *
   * 关键在于**没有影响行数就抛 NotFound** —— 不去先查再判断。
   * 「先 SELECT 确认所有权、再 UPDATE」有 TOCTOU 窗口，而且多一次往返。
   */
  private async updateOwned(
    actor: Actor,
    id: string,
    setClause: string,
    extraParams: unknown[]
  ): Promise<Photo> {
    const { userId } = requireUser(actor);
    const { rows } = await this.pool.query<PhotoRow>(
      `UPDATE photos SET ${setClause}, updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING ${COLUMNS}`,
      [id, userId, ...extraParams]
    );
    const row = rows[0];
    if (!row) {
      // 分不清「不存在」还是「别人的」—— 这正是我们想要的。
      // internalReason 记 forbidden 只为服务端日志，不进响应体。
      throw new NotFoundError('Photo', 'forbidden');
    }
    return mapPhotoRow(row);
  }

  setLocation(actor: Actor, id: string, locationId: string | null): Promise<Photo> {
    return this.updateOwned(actor, id, 'location_id = $3', [locationId]);
  }

  /** 幂等：已在回收站里再调一次不报错，trashed_at 保持首次的时间 */
  trash(actor: Actor, id: string): Promise<Photo> {
    return this.updateOwned(
      actor,
      id,
      'trashed = TRUE, trashed_at = COALESCE(trashed_at, now())',
      []
    );
  }

  /** 幂等 */
  restore(actor: Actor, id: string): Promise<Photo> {
    return this.updateOwned(actor, id, 'trashed = FALSE, trashed_at = NULL', []);
  }

  setPublic(actor: Actor, id: string, isPublic: boolean): Promise<Photo> {
    return this.updateOwned(actor, id, 'is_public = $3', [isPublic]);
  }

  async purge(actor: Actor, id: string): Promise<void> {
    const { userId } = requireUser(actor);
    const res = await this.pool.query(
      'DELETE FROM photos WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (res.rowCount === 0) {
      throw new NotFoundError('Photo', 'forbidden');
    }
  }
}
