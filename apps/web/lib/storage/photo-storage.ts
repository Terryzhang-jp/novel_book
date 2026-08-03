/**
 * 遗留 Photo 的**只读**访问 —— Phase 3A / 16D
 *
 * ## 这个文件曾经有 1145 行
 *
 * 里面有 create / replacePhoto / setLocation / batchSetLocation /
 * updateDescription / updateDateTime / trash / restore / emptyTrash /
 * delete / syncLocationCoordinatesToPhotos —— 系统里绝大部分产生遗留
 * 数据的路径都在这一个文件里。
 *
 * 16B 把上传硬切到 `uploadAsset`，16D 在数据库上装了
 * `trg_guard_legacy_photo_write`。写入方法随之全部删除，不是注释掉、
 * 不是抛 not-implemented ——
 *
 *   **留着一个不能用的写入方法，等于留着一个将来会有人再调用的入口。**
 *
 * 数据库触发器会拦住它，但那时候拦下来的是一个已经进了生产的 bug。
 *
 * ## 剩下的读取路径也不是长期状态
 *
 * 下面这几个方法读的仍然是遗留 Supabase 实例（`pnpm verify:legacy-storage`
 * 实测该实例的 DNS 已经解析不到）。旧 Gallery 已经不走它们了 ——
 * 它读的是 Asset 的只读投影（16C）。这里保留的是 profile 统计、
 * 公开照片列表、AI 检索这几处还没迁的读取方，随它们一起退役。
 */

import type { Photo, PhotoCategory, PhotoStats } from "@/types/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mapSupabasePhotoRow } from "./photo-row-mapper";

/**
 * 把数据库里的 metadata JSONB 归一化成 Photo["metadata"]。
 *
 * 数据库列可能是 null 或缺字段（历史数据、迁移中途写入的行），
 * 而 Photo["metadata"] 的 fileSize / mimeType 是必填。
 * 统一在这里兜底，避免每个调用点各写一遍可选链。
 */
export function normalizePhotoMetadata(raw: unknown): Photo["metadata"] {
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

/**
 * 遗留 Photo 的只读访问。
 *
 * **不要往这里加写入方法。** 新素材走 uploadAsset → assets + ObjectStorage；
 * 旧形状由 mapAssetToLegacyPhotoDto 投影出来。
 * scripts/check-architecture.mjs 的 no-new-legacy-writes 规则会在 CI 里
 * 挡住新增的写入，数据库触发器会在运行时挡住漏网的那些。
 */
export class PhotoStorage {
  /**
   * 根据 ID 获取照片
   */
  async findById(photoId: string): Promise<Photo | null> {
    const { data, error } = await supabaseAdmin
      .from('photos')
      .select('*')
      .eq('id', photoId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      originalName: data.original_name,
      fileUrl: data.file_url,
      thumbnailUrl: data.thumbnail_url,
      metadata: data.metadata,
      category: data.category,
      locationId: data.location_id,
      title: data.title,
      description: data.description,
      tags: data.tags,
      isPublic: data.is_public,
      trashed: data.trashed,
      trashedAt: data.trashed_at,
      originalFileUrl: data.original_file_url,
      edited: data.edited,
      editedAt: data.edited_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * 获取用户的所有照片（返回完整照片列表）
   * @param userId 用户ID
   * @param options 分页选项 { limit?: number, offset?: number, sortOrder?: 'newest' | 'oldest' }
   */
  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number; sortOrder?: 'newest' | 'oldest' }
  ): Promise<Photo[]> {
    // 确定排序方向
    const ascending = options?.sortOrder === 'oldest';

    // 只取 Gallery 展示需要的字段（比 SELECT * 快很多），但必须包含
    // metadata 和 location_id —— 前端的时间聚类依赖 metadata.dateTime，
    // 地点筛选依赖 locationId。此前这两个字段没被 select 也没被映射，
    // 而返回值用 `as Photo` 强转掩盖了缺失，导致：
    //   · Gallery「全部」视图下地点筛选永远返回 0 张
    //   · Gallery「全部」视图下时间聚类完全失效（全部落进"无时间"桶）
    // 见 PERFORMANCE-AUDIT.md Q9 Bug 1 & 2。
    //
    // 注意：这里取整个 metadata 而不是 metadata->dateTime，因为地图和聚类
    // 还需要 metadata.location。EXIF 里的 camera/dimensions 体积很小，
    // 不值得为省这几十字节再拆一次查询。
    const selectFields =
      'id, file_url, file_name, original_name, category, thumbnail_url, created_at, updated_at, location_id, metadata';

    let query = supabaseAdmin
      .from('photos')
      .select(selectFields)
      .eq('user_id', userId)
      .is('trashed', false); // 过滤掉回收站照片

    // 多级排序：
    // 1. 优先按照片拍摄时间（metadata.dateTime）排序
    // 2. 没有拍摄时间的照片排在后面（nullsFirst: false）
    // 3. 然后按创建时间（created_at）排序
    query = query
      .order('metadata->dateTime', { ascending, nullsFirst: false })
      .order('created_at', { ascending });

    // 添加分页参数
    if (options?.limit !== undefined) {
      query = query.limit(options.limit);
    }
    if (options?.offset !== undefined) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    // 不再用 `as Photo` 断言 —— 那是掩盖字段缺失的元凶。
    // 现在显式构造，让 TypeScript 真正检查字段完整性。
    return data.map((photo): Photo => ({
      id: photo.id,
      userId,
      fileName: photo.file_name,
      originalName: photo.original_name,
      fileUrl: photo.file_url,
      thumbnailUrl: photo.thumbnail_url ?? undefined,
      locationId: photo.location_id ?? undefined,
      metadata: normalizePhotoMetadata(photo.metadata),
      category: photo.category,
      createdAt: photo.created_at,
      updatedAt: photo.updated_at ?? photo.created_at,
    }));
  }

  /**
   * 按分类获取照片（返回完整照片列表）
   * @param userId 用户ID
   * @param category 照片分类
   * @param options 分页选项 { limit?: number, offset?: number, sortOrder?: 'newest' | 'oldest' }
   */
  async findByCategory(
    userId: string,
    category: PhotoCategory,
    options?: { limit?: number; offset?: number; sortOrder?: 'newest' | 'oldest' }
  ): Promise<Photo[]> {
    // 确定排序方向
    const ascending = options?.sortOrder === 'oldest';

    let query = supabaseAdmin
      .from('photos')
      .select('*')
      .eq('user_id', userId)
      .eq('category', category)
      .is('trashed', false); // 过滤掉回收站照片

    // 多级排序：优先按拍摄时间，然后按创建时间
    query = query
      .order('metadata->dateTime', { ascending, nullsFirst: false })
      .order('created_at', { ascending });

    // 添加分页参数
    if (options?.limit !== undefined) {
      query = query.limit(options.limit);
    }
    if (options?.offset !== undefined) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    // 走统一的映射器：Gallery 关键列缺失时立刻抛错，不返回残缺对象。
    // 见 lib/storage/photo-row-mapper.ts —— 两个已知 Gallery bug 就出在这。
    return data.map(mapSupabasePhotoRow);
  }

  /**
   * 获取照片统计信息
   */
  async getStats(userId: string): Promise<PhotoStats> {
    const { data, error } = await supabaseAdmin
      .from('photos')
      .select('category')
      .eq('user_id', userId)
      .is('trashed', false); // 排除回收站照片

    if (error || !data) {
      return {
        total: 0,
        byCategory: {
          'time-location': 0,
          'time-only': 0,
          'location-only': 0,
          'neither': 0,
        },
      };
    }

    const byCategory = {
      'time-location': 0,
      'time-only': 0,
      'location-only': 0,
      'neither': 0,
    };

    data.forEach(photo => {
      byCategory[photo.category]++;
    });

    return {
      total: data.length,
      byCategory,
    };
  }

  /**
   * 获取所有公开的照片（用于公共地图）
   */
  async getAllPublicPhotos(): Promise<Photo[]> {
    const { data, error } = await supabaseAdmin
      .from('photos')
      .select('*')
      .eq('is_public', true)
      .not('metadata->location', 'is', null);

    if (error || !data) {
      return [];
    }

    return data.map(photo => ({
      id: photo.id,
      userId: photo.user_id,
      fileName: photo.file_name,
      originalName: photo.original_name,
      fileUrl: photo.file_url,
      metadata: photo.metadata,
      category: photo.category,
      locationId: photo.location_id,
      title: photo.title,
      description: photo.description,
      tags: photo.tags,
      isPublic: photo.is_public,
      trashed: photo.trashed,
      trashedAt: photo.trashed_at,
      originalFileUrl: photo.original_file_url,
      edited: photo.edited,
      editedAt: photo.edited_at,
      createdAt: photo.created_at,
      updatedAt: photo.updated_at,
    }));
  }

}

// 导出单例
export const photoStorage = new PhotoStorage();
