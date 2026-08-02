/**
 * 遗留 Photo 模型
 *
 * ⚠️ 这个类型**故意不放进 @tc/domain**。
 *
 * 理由（ADR-000 适用范围 / 评审意见）：Photo 是旧系统「以照片为中心」这个
 * 错误产品结构的载体。让它进入 domain，未来的 Asset 和 Moment 就会被它的
 * 形状绑住 —— 那正是这次重构要摆脱的东西。
 *
 * 它待在 legacy-adapters 里，随遗留系统一起淘汰。
 */

export type PhotoCategory = 'time-location' | 'time-only' | 'location-only' | 'neither';

export type LocationSource = 'exif' | 'manual' | 'location-library';

export interface PhotoMetadata {
  readonly dateTime?: string;
  readonly location?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly altitude?: number;
    readonly source?: LocationSource;
  };
  readonly camera?: { readonly make?: string; readonly model?: string };
  readonly dimensions?: { readonly width: number; readonly height: number };
  readonly fileSize: number;
  readonly mimeType: string;
}

export interface Photo {
  readonly id: string;
  readonly userId: string;
  readonly fileName: string;
  readonly originalName: string;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string;
  readonly locationId?: string;
  readonly metadata: PhotoMetadata;
  readonly category: PhotoCategory;
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly isPublic: boolean;
  readonly trashed: boolean;
  readonly trashedAt?: string;
  readonly edited: boolean;
  readonly originalFileUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 映射时发现必要字段缺失。
 *
 * 这个错误存在的唯一目的：让「SELECT 漏了列」在**第一次读取时立刻炸**，
 * 而不是变成 undefined 一路流到 UI，表现为「地点筛选筛不出东西」。
 *
 * 旧系统的 findByUserId 就是用 `as Photo` 把这种缺失强转掉了，
 * 结果 Gallery 的地点筛选和时间聚类静默失效了很久。
 */
export class PhotoMappingError extends Error {
  readonly code = 'PHOTO_MAPPING_ERROR' as const;
  readonly missingFields: readonly string[];

  constructor(missingFields: readonly string[], rowId?: unknown) {
    super(
      `Photo 行映射失败：缺少字段 [${missingFields.join(', ')}]` +
        (rowId ? `（id=${String(rowId)}）` : '') +
        '。多半是 SELECT 没取全列 —— 不要用 `as Photo` 绕过。'
    );
    this.name = 'PhotoMappingError';
    this.missingFields = missingFields;
  }
}

/** 数据库行 → Photo。列名是 snake_case，业务对象是 camelCase。 */
export interface PhotoRow {
  id: unknown;
  user_id: unknown;
  file_name: unknown;
  original_name: unknown;
  file_url: unknown;
  thumbnail_url: unknown;
  location_id: unknown;
  metadata: unknown;
  category: unknown;
  title?: unknown;
  tags?: unknown;
  is_public: unknown;
  trashed: unknown;
  trashed_at?: unknown;
  edited?: unknown;
  original_file_url?: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const REQUIRED_COLUMNS = [
  'id',
  'user_id',
  'file_name',
  'original_name',
  'file_url',
  'category',
  'created_at',
  'updated_at',
] as const;

function normalizeMetadata(raw: unknown): PhotoMetadata {
  const m = (raw ?? {}) as Partial<PhotoMetadata>;
  return {
    dateTime: m.dateTime,
    location: m.location,
    camera: m.camera,
    dimensions: m.dimensions,
    fileSize: typeof m.fileSize === 'number' ? m.fileSize : 0,
    mimeType: typeof m.mimeType === 'string' ? m.mimeType : 'application/octet-stream',
  };
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * 显式映射。**不要用 `as Photo`。**
 *
 * 三个刻意的设计：
 *   1. 必需列缺失 → 抛 PhotoMappingError，不静默产出残缺对象
 *   2. `metadata` 为 undefined 视为缺失（SELECT 漏了），为 null 视为空对象
 *      （数据库里就是 NULL）—— 这两种情况的含义完全不同
 *   3. isPublic / trashed / edited 有明确默认值，不让 undefined 流出去
 */
export function mapPhotoRow(row: PhotoRow): Photo {
  const missing: string[] = [];
  for (const col of REQUIRED_COLUMNS) {
    if (row[col] === undefined || row[col] === null) missing.push(col);
  }
  // metadata 是 Gallery 时间聚类和地图的输入。SELECT 漏了它就是 Bug，
  // 必须区别于「数据库里存的是 NULL」。
  if (row.metadata === undefined) missing.push('metadata');
  // location_id 是 Gallery 地点筛选的输入，同理。
  if (row.location_id === undefined) missing.push('location_id');

  if (missing.length > 0) {
    throw new PhotoMappingError(missing, row.id);
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    fileName: String(row.file_name),
    originalName: String(row.original_name),
    fileUrl: String(row.file_url),
    thumbnailUrl: row.thumbnail_url == null ? undefined : String(row.thumbnail_url),
    locationId: row.location_id == null ? undefined : String(row.location_id),
    metadata: normalizeMetadata(row.metadata),
    category: row.category as PhotoCategory,
    title: row.title == null ? undefined : String(row.title),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    isPublic: row.is_public === true,
    trashed: row.trashed === true,
    trashedAt: row.trashed_at == null ? undefined : iso(row.trashed_at),
    edited: row.edited === true,
    originalFileUrl: row.original_file_url == null ? undefined : String(row.original_file_url),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
