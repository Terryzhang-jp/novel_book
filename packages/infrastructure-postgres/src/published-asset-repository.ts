import { NotFoundError, requireUser, type Actor, type WorkVersionId } from '@tc/domain';
import type {
  CreatePublishedAssetInput,
  PublishedAsset,
  PublishedAssetRepository,
} from '@tc/application';
import { translating, type Queryable } from './queryable';
import {
  mapPublishedAsset,
  PUBLISHED_ASSET_COLUMNS,
  type PublishedAssetRow,
} from './rows';

/**
 * 发布派生副本的账本。
 *
 * ⚠️ **不在读取路径上**（ADR-008 A10）。发布页渲染和 `/p/{slug}/a/{hash}`
 * 都只读 publications + work_versions —— 需要的一切都在快照里。
 *
 * 这个 Repository 只服务三件事：账号删除时清理派生对象、对账、
 * 避免同一版本对同一份字节重复派生。
 */
export class PostgresPublishedAssetRepository implements PublishedAssetRepository {
  constructor(private readonly db: Queryable) {}

  async create(actor: Actor, input: CreatePublishedAssetInput): Promise<PublishedAsset> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      // user_id 取自 work_versions 而不是参数：少一个可以传错的值，
      // 同时天然保证「只能给自己的版本登记派生副本」
      const { rows } = await this.db.query<PublishedAssetRow>(
        `INSERT INTO published_assets
           (work_version_id, source_asset_id, user_id, object_key, sha256,
            mime_type, width, height, byte_size, preset)
         SELECT v.id, $3, v.user_id, $4, $5, $6, $7, $8, $9, $10
           FROM work_versions v WHERE v.id = $1 AND v.user_id = $2
         RETURNING ${PUBLISHED_ASSET_COLUMNS}`,
        [
          input.workVersionId,
          userId,
          input.sourceAssetId ?? null,
          input.objectKey,
          input.sha256,
          input.mimeType,
          input.width,
          input.height,
          input.byteSize,
          input.preset,
        ]
      );
      if (!rows[0]) throw new NotFoundError('WorkVersion', 'forbidden');
      return mapPublishedAsset(rows[0]);
    });
  }

  async listByVersion(
    actor: Actor,
    workVersionId: WorkVersionId
  ): Promise<PublishedAsset[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<PublishedAssetRow>(
      `SELECT ${PUBLISHED_ASSET_COLUMNS} FROM published_assets
        WHERE work_version_id = $1 AND user_id = $2
        ORDER BY created_at ASC`,
      [workVersionId, userId]
    );
    return rows.map(mapPublishedAsset);
  }
}
