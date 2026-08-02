/**
 * 遗留 photoStorage 的行映射 —— 提取成纯函数，为了能被测试
 *
 * ## 为什么单独提出来
 *
 * 审计发现的两个 Gallery bug 都发生在这一段：
 *
 *   PostgREST 返回数据库行
 *     → photoStorage 做字段映射     ← metadata / locationId 在这里丢了
 *     → Gallery 拿到残缺对象
 *
 * 表现是「地点筛选永远筛不出东西」「时间聚类完全不生效」，但数据库里
 * 字段都在。根因是 `return incompleteRow as Photo` —— 类型断言把缺失
 * 强转掉了，TypeScript 一声不吭。
 *
 * 修复本身当时没有测试守护。把映射提成纯函数之后，**不需要 Supabase
 * 实例**就能直接保护这两个已知 bug —— 只要用真实形状的 PostgREST row
 * 做 fixture 即可。
 *
 * 它不能证明整条 PostgREST 链路（URL 构造、参数序列化、错误处理），
 * 但能保护真正出过错的那一段。剩余缺口记在 verification-gaps.json。
 */

import type { Photo, PhotoCategory } from "@/types/storage";

/**
 * PostgREST 返回的行。
 *
 * 全部标成可选 + unknown 是刻意的：**这正是 bug 的形状**。
 * SELECT 漏了列时，PostgREST 返回的对象里就是没有那个 key。
 * 如果把类型写成必填，就等于假设「查询一定取全了」—— 那假设一旦不成立，
 * 类型系统反而帮着掩盖问题。
 */
export interface SupabasePhotoRow {
  id?: unknown;
  user_id?: unknown;
  file_name?: unknown;
  original_name?: unknown;
  file_url?: unknown;
  thumbnail_url?: unknown;
  location_id?: unknown;
  metadata?: unknown;
  category?: unknown;
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  is_public?: unknown;
  trashed?: unknown;
  trashed_at?: unknown;
  original_file_url?: unknown;
  edited?: unknown;
  edited_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

/**
 * Gallery 功能真正依赖的列。
 *
 * 这不是「所有列」，是**少了就会出线上 bug** 的那几个：
 *   metadata     → 时间聚类（metadata.dateTime）、地图（metadata.location）
 *   location_id  → 地点筛选
 *
 * 其余列缺失只会让 UI 少显示点东西，不会静默失效。
 */
export const GALLERY_CRITICAL_COLUMNS = [
  "id",
  "user_id",
  "file_url",
  "category",
  "metadata",
  "location_id",
] as const;

export class SupabasePhotoRowError extends Error {
  readonly code = "SUPABASE_PHOTO_ROW_ERROR" as const;
  readonly missingColumns: readonly string[];

  constructor(missingColumns: readonly string[], rowId?: unknown) {
    super(
      `照片行缺少 Gallery 必需的列 [${missingColumns.join(", ")}]` +
        (rowId ? `（id=${String(rowId)}）` : "") +
        "。多半是 SELECT 没取全 —— 见 lib/storage/photo-row-mapper.ts 的说明。"
    );
    this.name = "SupabasePhotoRowError";
    this.missingColumns = missingColumns;
  }
}

/**
 * 归一化 metadata。
 *
 * 区分两种「空」：
 *   undefined  → SELECT 里没这一列，是 Bug（由 assertGalleryColumns 拦截）
 *   null       → 数据库里存的就是 NULL，是数据，正常归一化成默认值
 */
function normalizeMetadata(raw: unknown): Photo["metadata"] {
  const m = (raw ?? {}) as Partial<Photo["metadata"]>;
  return {
    dateTime: m.dateTime,
    location: m.location,
    camera: m.camera,
    dimensions: m.dimensions,
    fileSize: typeof m.fileSize === "number" ? m.fileSize : 0,
    mimeType: typeof m.mimeType === "string" ? m.mimeType : "application/octet-stream",
  };
}

/** 列是否存在于返回行里。注意 `null` 算存在（数据库值），`undefined` 算缺失（没 SELECT）。 */
function hasColumn(row: SupabasePhotoRow, col: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, col) && row[col as keyof SupabasePhotoRow] !== undefined;
}

/**
 * 检查 Gallery 关键列是否齐全。缺了就抛，不返回残缺对象。
 *
 * 这是这个模块存在的核心意义：让「SELECT 漏列」在**读取时立刻炸**，
 * 而不是变成 undefined 一路流到 UI 表现为「筛选筛不出东西」。
 */
export function assertGalleryColumns(row: SupabasePhotoRow): void {
  const missing = GALLERY_CRITICAL_COLUMNS.filter((c) => !hasColumn(row, c));
  if (missing.length > 0) {
    throw new SupabasePhotoRowError(missing, row.id);
  }
}

/**
 * PostgREST 行 → Photo。
 *
 * **不要用 `as Photo`。** 那正是两个线上 bug 的成因。
 */
export function mapSupabasePhotoRow(row: SupabasePhotoRow): Photo {
  assertGalleryColumns(row);

  return {
    id: String(row.id),
    userId: String(row.user_id),
    fileName: row.file_name == null ? "" : String(row.file_name),
    originalName: row.original_name == null ? "" : String(row.original_name),
    fileUrl: String(row.file_url),
    thumbnailUrl: row.thumbnail_url == null ? undefined : String(row.thumbnail_url),
    locationId: row.location_id == null ? undefined : String(row.location_id),
    metadata: normalizeMetadata(row.metadata),
    category: row.category as PhotoCategory,
    title: row.title == null ? undefined : String(row.title),
    description: (row.description ?? undefined) as Photo["description"],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    isPublic: row.is_public === true,
    trashed: row.trashed === true,
    trashedAt: row.trashed_at == null ? undefined : String(row.trashed_at),
    originalFileUrl: row.original_file_url == null ? undefined : String(row.original_file_url),
    edited: row.edited === true,
    editedAt: row.edited_at == null ? undefined : String(row.edited_at),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}
