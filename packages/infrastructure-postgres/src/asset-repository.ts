import {
  InvariantViolation,
  NotFoundError,
  requireUser,
  type Actor,
  type Asset,
  type AssetId,
  type AssetMetadataCorrection,
  type CreateAssetInput,
  type MomentAsset,
  type MomentId,
} from '@tc/domain';
import type {
  AppendCorrectionInput,
  AssetRepository,
  AttachAssetInput,
  MomentAssetView,
  Page,
} from '@tc/application';
import { assertAffected, translating, type Queryable } from './queryable';
import {
  ASSET_COLUMNS,
  CORRECTION_COLUMNS,
  mapAsset,
  mapCorrection,
  mapMomentAsset,
  MOMENT_ASSET_COLUMNS,
  prefixed,
  type AssetRow,
  type CorrectionRow,
  type MomentAssetRow,
} from './rows';

/** JOIN 时取整行，避免二十几个 AS 别名。理由同 publication-repository。 */
interface MomentAssetJoinRow {
  link: MomentAssetRow;
  asset: AssetRow;
}

const JOINED_SELECT = 'to_jsonb(ma) AS link, to_jsonb(a) AS asset';

function mapJoined(row: MomentAssetJoinRow): MomentAssetView {
  return { link: mapMomentAsset(row.link), asset: mapAsset(row.asset) };
}

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly db: Queryable) {}

  // ── Asset ──────────────────────────────────────────────────────────────────

  async create(actor: Actor, input: CreateAssetInput): Promise<Asset> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<AssetRow>(
        `INSERT INTO assets (
           user_id, type, object_key, sha256, mime_type, byte_size,
           width, height, duration_ms,
           captured_local_at, captured_at, timezone, timezone_source, timezone_confidence,
           original_metadata, derived_from_asset_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10::timestamp, $11::timestamptz, $12, $13, $14,
           $15::jsonb, $16
         )
         RETURNING ${ASSET_COLUMNS}`,
        [
          userId,
          input.type,
          input.objectKey,
          input.sha256,
          input.mimeType,
          input.byteSize,
          input.width ?? null,
          input.height ?? null,
          input.durationMs ?? null,
          // 字符串原样交给 ::timestamp。**不要**先 new Date() 再转 ——
          // 那会按进程时区解释一个本来就没有时区的墙上时间（ADR-009 T1）。
          input.capturedLocalAt ?? null,
          input.capturedAt ?? null,
          input.timezone ?? null,
          input.timezoneSource ?? 'unknown',
          input.timezoneConfidence ?? null,
          JSON.stringify(input.originalMetadata ?? { _v: 1 }),
          input.derivedFromAssetId ?? null,
        ]
      );
      return mapAsset(rows[0]!);
    });
  }

  async findById(actor: Actor, id: AssetId): Promise<Asset | null> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] ? mapAsset(rows[0]) : null;
  }

  /**
   * 去重查询。**包含软删除的行** —— 重新上传一份删掉的素材应该恢复它，
   * 而不是撞上 uq_assets_user_sha256 报「已存在」。
   */
  async findBySha256(actor: Actor, sha256: string): Promise<Asset | null> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE user_id = $1 AND sha256 = $2`,
      [userId, sha256]
    );
    return rows[0] ? mapAsset(rows[0]) : null;
  }

  async listByUser(actor: Actor, page: Page = {}): Promise<Asset[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, page.limit ?? 100, page.offset ?? 0]
    );
    return rows.map(mapAsset);
  }

  /** 幂等：已删的再删一次不报错，deleted_at 保持首次的时间 */
  async softDelete(actor: Actor, id: AssetId): Promise<Asset> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<AssetRow>(
      `UPDATE assets SET deleted_at = COALESCE(deleted_at, now())
        WHERE id = $1 AND user_id = $2
        RETURNING ${ASSET_COLUMNS}`,
      [id, userId]
    );
    if (!rows[0]) assertAffected(0, 'Asset');
    return mapAsset(rows[0]!);
  }

  async restore(actor: Actor, id: AssetId): Promise<Asset> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<AssetRow>(
      `UPDATE assets SET deleted_at = NULL
        WHERE id = $1 AND user_id = $2
        RETURNING ${ASSET_COLUMNS}`,
      [id, userId]
    );
    if (!rows[0]) assertAffected(0, 'Asset');
    return mapAsset(rows[0]!);
  }

  // ── 证据关系 ───────────────────────────────────────────────────────────────

  async listByMoment(actor: Actor, momentId: MomentId): Promise<MomentAssetView[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<MomentAssetJoinRow>(
      `SELECT ${JOINED_SELECT}
         FROM moment_assets ma
         JOIN assets a  ON a.id = ma.asset_id
         JOIN moments m ON m.id = ma.moment_id
        WHERE ma.moment_id = $1 AND m.user_id = $2
        ORDER BY ma.sort_order ASC`,
      [momentId, userId]
    );
    return rows.map(mapJoined);
  }

  async listByMoments(
    actor: Actor,
    momentIds: readonly MomentId[]
  ): Promise<MomentAssetView[]> {
    const { userId } = requireUser(actor);
    if (momentIds.length === 0) return [];
    const { rows } = await this.db.query<MomentAssetJoinRow>(
      `SELECT ${JOINED_SELECT}
         FROM moment_assets ma
         JOIN assets a  ON a.id = ma.asset_id
         JOIN moments m ON m.id = ma.moment_id
        WHERE ma.moment_id = ANY($1::uuid[]) AND m.user_id = $2
        ORDER BY ma.moment_id, ma.sort_order ASC`,
      [momentIds, userId]
    );
    return rows.map(mapJoined);
  }

  /**
   * 挂载证据。
   *
   * 所有权判断写进 SQL：`m.user_id = a.user_id AND m.user_id = $actor`。
   * Moment 或 Asset 任何一个不属于调用者，SELECT 就是空集，什么都不会插。
   * 数据库的 MA-3 触发器是第二道。
   */
  async attach(
    actor: Actor,
    momentId: MomentId,
    assetId: AssetId,
    input: AttachAssetInput = {}
  ): Promise<MomentAsset> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<MomentAssetRow>(
        `INSERT INTO moment_assets (moment_id, asset_id, role, sort_order, note)
         SELECT m.id, a.id, $4,
                COALESCE((SELECT MAX(sort_order) + 1 FROM moment_assets WHERE moment_id = m.id), 0),
                $5
           FROM moments m
           JOIN assets a ON a.user_id = m.user_id
          WHERE m.id = $1 AND a.id = $2 AND m.user_id = $3
         RETURNING ${MOMENT_ASSET_COLUMNS}`,
        [momentId, assetId, userId, input.role ?? 'supporting', input.note ?? null]
      );
      if (!rows[0]) throw new NotFoundError('Asset', 'forbidden');
      return mapMomentAsset(rows[0]);
    });
  }

  async detach(actor: Actor, momentId: MomentId, assetId: AssetId): Promise<void> {
    const { userId } = requireUser(actor);
    const res = await this.db.query(
      `DELETE FROM moment_assets ma
        USING moments m
        WHERE ma.moment_id = $1 AND ma.asset_id = $2
          AND m.id = ma.moment_id AND m.user_id = $3`,
      [momentId, assetId, userId]
    );
    assertAffected(res.rowCount, 'MomentAsset');
  }

  /**
   * 重排证据顺序。
   *
   * 与 work_blocks 的重排同款：要求给出全部 id 的一个排列，
   * 一条 UPDATE 改完。uq_moment_asset_order 是 DEFERRABLE，
   * 中间状态不会被判违规。
   */
  async reorder(
    actor: Actor,
    momentId: MomentId,
    orderedAssetIds: readonly AssetId[]
  ): Promise<MomentAsset[]> {
    const { userId } = requireUser(actor);
    const existing = await this.listByMoment(actor, momentId);
    if (existing.length === 0 && orderedAssetIds.length === 0) return [];

    const existingIds = new Set(existing.map((v) => v.asset.id));
    const givenIds = new Set(orderedAssetIds);
    if (
      givenIds.size !== orderedAssetIds.length ||
      existingIds.size !== givenIds.size ||
      [...existingIds].some((id) => !givenIds.has(id))
    ) {
      throw new InvariantViolation(
        'MA-2',
        `重排必须给出全部 ${existingIds.size} 份证据的顺序，且不能重复（收到 ${orderedAssetIds.length} 个）`
      );
    }

    const values = orderedAssetIds.map((_, i) => `($${i + 3}::uuid, ${i})`).join(', ');
    await translating(() =>
      this.db.query(
        `UPDATE moment_assets ma
            SET sort_order = v.pos
           FROM (VALUES ${values}) AS v(asset_id, pos), moments m
          WHERE ma.asset_id = v.asset_id AND ma.moment_id = $1
            AND m.id = ma.moment_id AND m.user_id = $2`,
        [momentId, userId, ...orderedAssetIds]
      )
    );
    return (await this.listByMoment(actor, momentId)).map((v) => v.link);
  }

  // ── 元数据修正 ─────────────────────────────────────────────────────────────

  async listCorrections(
    actor: Actor,
    assetId: AssetId
  ): Promise<AssetMetadataCorrection[]> {
    const { userId } = requireUser(actor);
    const { rows } = await this.db.query<CorrectionRow>(
      `SELECT ${prefixed(CORRECTION_COLUMNS, 'c')}
         FROM asset_metadata_corrections c
         JOIN assets a ON a.id = c.asset_id
        WHERE c.asset_id = $1 AND a.user_id = $2
        ORDER BY c.created_at ASC`,
      [assetId, userId]
    );
    return rows.map(mapCorrection);
  }

  /**
   * 追加一次修正。
   *
   * 和 interpretation_revisions 一样是 append-only —— 原值和历史修正
   * 一律不动。C-1（防分叉）、C-2（同 asset 同 field）、C-4（推断带置信度）
   * 都由数据库守着；C-5（推断不覆盖用户修正）在用例层。
   */
  async appendCorrection(
    actor: Actor,
    assetId: AssetId,
    input: AppendCorrectionInput
  ): Promise<AssetMetadataCorrection> {
    const { userId } = requireUser(actor);
    return translating(async () => {
      const { rows } = await this.db.query<CorrectionRow>(
        `INSERT INTO asset_metadata_corrections
           (asset_id, user_id, field, value, source, confidence, supersedes_id)
         SELECT a.id, a.user_id, $3, $4::jsonb, $5, $6, $7
           FROM assets a WHERE a.id = $1 AND a.user_id = $2
         RETURNING ${CORRECTION_COLUMNS}`,
        [
          assetId,
          userId,
          input.field,
          JSON.stringify(input.value),
          input.source,
          input.confidence ?? null,
          input.supersedesId ?? null,
        ]
      );
      if (!rows[0]) throw new NotFoundError('Asset', 'forbidden');
      return mapCorrection(rows[0]);
    });
  }
}
