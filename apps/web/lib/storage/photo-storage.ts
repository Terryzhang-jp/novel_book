import { v4 as uuidv4 } from "uuid";
import exifr from "exifr";
import sharp from "sharp";
import type { JSONContent } from "novel";
import type { Photo, PhotoIndex, PhotoCategory, PhotoStats } from "@/types/storage";
import { NotFoundError, UnauthorizedError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadFile, deleteFile as deleteStorageFile, getPublicUrl } from "@/lib/supabase/storage";

// Thumbnail configuration
const THUMBNAIL_SIZE = 300; // 300x300 max dimension
const THUMBNAIL_QUALITY = 80; // JPEG quality

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
 * 照片存储类 - Supabase版本
 * 负责照片的 CRUD 操作和 EXIF 提取
 */
export class PhotoStorage {
  /**
   * 从 EXIF 数据中提取元数据
   */
  private async extractEXIF(buffer: Buffer, mimeType: string): Promise<{
    dateTime?: string;
    location?: {
      latitude: number;
      longitude: number;
      altitude?: number;
    };
    camera?: {
      make?: string;
      model?: string;
    };
    dimensions?: {
      width: number;
      height: number;
    };
  }> {
    try {
      const exif = await exifr.parse(buffer);

      if (!exif) {
        return {};
      }

      // 提取时间（优先级：DateTimeOriginal > DateTime > CreateDate）
      let dateTime: string | undefined;
      if (exif.DateTimeOriginal) {
        dateTime = new Date(exif.DateTimeOriginal).toISOString();
      } else if (exif.DateTime) {
        dateTime = new Date(exif.DateTime).toISOString();
      } else if (exif.CreateDate) {
        dateTime = new Date(exif.CreateDate).toISOString();
      }

      // 提取地理位置
      let location:
        | {
            latitude: number;
            longitude: number;
            altitude?: number;
          }
        | undefined;
      if (
        exif.latitude !== undefined &&
        exif.longitude !== undefined &&
        !Number.isNaN(exif.latitude) &&
        !Number.isNaN(exif.longitude)
      ) {
        location = {
          latitude: exif.latitude,
          longitude: exif.longitude,
        };
        if (exif.GPSAltitude !== undefined && !Number.isNaN(exif.GPSAltitude)) {
          location.altitude = exif.GPSAltitude;
        }
      }

      // 提取相机信息
      let camera:
        | {
            make?: string;
            model?: string;
          }
        | undefined;
      if (exif.Make || exif.Model) {
        camera = {
          make: exif.Make,
          model: exif.Model,
        };
      }

      // 提取图片尺寸
      let dimensions:
        | {
            width: number;
            height: number;
          }
        | undefined;
      const width = exif.ImageWidth || exif.ExifImageWidth;
      const height = exif.ImageHeight || exif.ExifImageHeight;
      if (width && height) {
        dimensions = { width, height };
      }

      return {
        dateTime,
        location,
        camera,
        dimensions,
      };
    } catch (error) {
      console.error("EXIF extraction error:", error);
      return {};
    }
  }

  /**
   * 根据元数据确定照片分类
   */
  private categorize(metadata: Photo["metadata"]): PhotoCategory {
    const hasTime = !!metadata.dateTime;
    const hasLocation = !!metadata.location;

    if (hasTime && hasLocation) return "time-location";
    if (hasTime) return "time-only";
    if (hasLocation) return "location-only";
    return "neither";
  }

  /**
   * 生成缩略图
   */
  private async generateThumbnail(buffer: Buffer): Promise<Buffer> {
    try {
      // limitInputPixels 防「图片炸弹」：压缩后只有几十 KB、但解压后
      // 有数十亿像素的 PNG 会直接把 Serverless 函数的内存打爆。
      // 1 亿像素 ≈ 10000×10000，远超任何真实照片。
      // 见 PERFORMANCE-AUDIT.md 第七组 #8。
      return await sharp(buffer, { limitInputPixels: 100_000_000 })
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'centre',
        })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toBuffer();
    } catch (error) {
      console.error('Thumbnail generation error:', error);
      throw error;
    }
  }

  /**
   * 创建新照片记录（上传照片）
   */
  async create(
    userId: string,
    file: File
  ): Promise<Photo> {
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileExtension = file.name.split(".").pop();
    const fileName = `${timestamp}-${randomString}.${fileExtension}`;

    // 提取 EXIF 元数据
    const exifData = await this.extractEXIF(buffer, file.type);

    // 创建完整的元数据
    const metadata: Photo["metadata"] = {
      ...exifData,
      fileSize: buffer.length,
      mimeType: file.type,
    };

    // 确定分类
    const category = this.categorize(metadata);

    // 上传原图到 Supabase Storage
    const storagePath = `${userId}/gallery/${fileName}`;
    await uploadFile('photos', storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

    // 获取公开 URL
    const fileUrl = getPublicUrl('photos', storagePath);

    // 生成并上传缩略图
    let thumbnailUrl: string | undefined;
    try {
      const thumbnailBuffer = await this.generateThumbnail(buffer);
      const thumbnailFileName = `thumb_${fileName.replace(/\.[^.]+$/, '.jpg')}`;
      const thumbnailPath = `${userId}/thumbnails/${thumbnailFileName}`;

      await uploadFile('photos', thumbnailPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

      thumbnailUrl = getPublicUrl('photos', thumbnailPath);
    } catch (error) {
      console.error('Failed to generate thumbnail, using original:', error);
      // 如果缩略图生成失败，继续使用原图
    }

    // 创建照片记录
    const photoId = uuidv4();
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('photos')
      .insert({
        id: photoId,
        user_id: userId,
        file_name: fileName,
        original_name: file.name,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl,
        metadata,
        category,
        is_public: true,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create photo: ${error.message}`);
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

    return data.map(photo => ({
      id: photo.id,
      userId: photo.user_id,
      fileName: photo.file_name,
      originalName: photo.original_name,
      fileUrl: photo.file_url,
      thumbnailUrl: photo.thumbnail_url,
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

  /**
   * 删除照片
   */
  async delete(photoId: string, userId: string): Promise<void> {
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    // 权限检查
    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to delete this photo"
      );
    }

    // 删除 Storage 中的文件
    const storagePath = `${userId}/gallery/${photo.fileName}`;
    try {
      await deleteStorageFile('photos', storagePath);
    } catch (error) {
      console.error('Failed to delete file from storage:', error);
    }

    // 删除数据库记录
    const { error } = await supabaseAdmin
      .from('photos')
      .delete()
      .eq('id', photoId);

    if (error) {
      throw new Error(`Failed to delete photo: ${error.message}`);
    }
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
   * 为照片设置地点（关联地点库）
   */
  async setLocation(
    photoId: string,
    userId: string,
    locationId: string
  ): Promise<Photo> {
    // 获取照片
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    // 权限检查
    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to update this photo"
      );
    }

    // 获取地点信息
    const { data: location, error: locationError } = await supabaseAdmin
      .from('locations')
      .select('*')
      .eq('id', locationId)
      .eq('user_id', userId)
      .single();

    if (locationError || !location) {
      throw new NotFoundError("Location");
    }

    // 更新照片的元数据
    const updatedMetadata = {
      ...photo.metadata,
      location: {
        latitude: location.coordinates.latitude,
        longitude: location.coordinates.longitude,
        altitude: photo.metadata.location?.altitude,
        source: "location-library" as const,
      },
    };

    // 重新计算分类
    const category = this.categorize(updatedMetadata);

    // 更新照片
    const { data, error } = await supabaseAdmin
      .from('photos')
      .update({
        location_id: locationId,
        metadata: updatedMetadata,
        category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', photoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update photo: ${error.message}`);
    }

    // 增加地点的使用计数
    await supabaseAdmin
      .from('locations')
      .update({
        usage_count: location.usage_count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', locationId);

    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      originalName: data.original_name,
      fileUrl: data.file_url,
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
   * 移除照片的地点关联
   */
  async removeLocation(photoId: string, userId: string): Promise<Photo> {
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to update this photo"
      );
    }

    const oldLocationId = photo.locationId;

    // 更新元数据
    const updatedMetadata = {
      ...photo.metadata,
      location:
        photo.metadata.location?.source === "location-library"
          ? undefined
          : photo.metadata.location
          ? {
              ...photo.metadata.location,
              source: "exif" as const,
            }
          : undefined,
    };

    const category = this.categorize(updatedMetadata);

    const { data, error } = await supabaseAdmin
      .from('photos')
      .update({
        location_id: null,
        metadata: updatedMetadata,
        category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', photoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update photo: ${error.message}`);
    }

    // 减少地点的使用计数
    if (oldLocationId) {
      const { data: location } = await supabaseAdmin
        .from('locations')
        .select('usage_count')
        .eq('id', oldLocationId)
        .single();

      if (location && location.usage_count > 0) {
        await supabaseAdmin
          .from('locations')
          .update({
            usage_count: location.usage_count - 1,
          })
          .eq('id', oldLocationId);
      }
    }

    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      originalName: data.original_name,
      fileUrl: data.file_url,
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
   * 批量为多张照片设置地点
   */
  async batchSetLocation(
    photoIds: string[],
    userId: string,
    locationId: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const photoId of photoIds) {
      try {
        await this.setLocation(photoId, userId, locationId);
        success++;
      } catch (error) {
        console.error(`Failed to set location for photo ${photoId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 更新照片的描述（用于旅行日记功能）
   */
  async updateDescription(
    photoId: string,
    userId: string,
    description: JSONContent
  ): Promise<Photo> {
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to update this photo"
      );
    }

    const { data, error } = await supabaseAdmin
      .from('photos')
      .update({
        description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', photoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update photo: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      originalName: data.original_name,
      fileUrl: data.file_url,
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
   * 更新照片的时间
   */
  async updateDateTime(
    photoId: string,
    userId: string,
    dateTime: string | null
  ): Promise<Photo> {
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to update this photo"
      );
    }

    // 更新元数据
    const updatedMetadata = {
      ...photo.metadata,
      dateTime: dateTime || undefined,
    };

    const category = this.categorize(updatedMetadata);

    const { data, error } = await supabaseAdmin
      .from('photos')
      .update({
        metadata: updatedMetadata,
        category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', photoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update photo: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      originalName: data.original_name,
      fileUrl: data.file_url,
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
   * 替换照片文件（编辑照片）
   * 保留原始照片，上传编辑后的新版本
   */
  async replacePhoto(
    photoId: string,
    userId: string,
    editedFile: File
  ): Promise<Photo> {
    // 获取现有照片记录
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    // 权限检查
    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to edit this photo"
      );
    }

    // 读取编辑后的文件
    const arrayBuffer = await editedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 生成新文件名（保持相同扩展名）
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileExtension = photo.fileName.split(".").pop();
    const newFileName = `${timestamp}-${randomString}.${fileExtension}`;

    // 如果是第一次编辑，保存原始文件URL
    const originalFileUrl = photo.originalFileUrl || photo.fileUrl;
    const wasEdited = photo.edited || false;

    // 上传新文件到 Supabase Storage
    const newStoragePath = `${userId}/gallery/${newFileName}`;
    await uploadFile('photos', newStoragePath, buffer, {
      contentType: editedFile.type,
      upsert: false,
    });

    // 获取新文件的公开 URL
    const newFileUrl = getPublicUrl('photos', newStoragePath);

    // 如果之前已经编辑过，删除旧的编辑版本文件
    if (wasEdited && photo.fileName !== photo.originalFileUrl?.split('/').pop()) {
      const oldEditedPath = `${userId}/gallery/${photo.fileName}`;
      try {
        await deleteStorageFile('photos', oldEditedPath);
      } catch (error) {
        console.error(`Failed to delete old edited file: ${error}`);
        // 继续执行，不阻塞流程
      }
    }

    // 更新数据库记录
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('photos')
      .update({
        file_name: newFileName,
        file_url: newFileUrl,
        original_file_url: originalFileUrl,
        edited: true,
        edited_at: now,
        updated_at: now,
      })
      .eq('id', photoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update photo: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      originalName: data.original_name,
      fileUrl: data.file_url,
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
   * 同步 location 坐标到所有关联的照片
   * 当 location 的坐标被更新时调用
   */
  async syncLocationCoordinatesToPhotos(
    locationId: string,
    newCoordinates: { latitude: number; longitude: number }
  ): Promise<number> {
    // 获取所有引用这个 locationId 的照片
    const { data: photos, error: fetchError } = await supabaseAdmin
      .from('photos')
      .select('*')
      .eq('location_id', locationId);

    if (fetchError || !photos || photos.length === 0) {
      return 0; // 没有照片需要更新
    }

    // 批量更新所有照片的坐标
    let updatedCount = 0;
    for (const photo of photos) {
      const updatedMetadata = {
        ...photo.metadata,
        location: {
          latitude: newCoordinates.latitude,
          longitude: newCoordinates.longitude,
          altitude: photo.metadata?.location?.altitude,
          source: photo.metadata?.location?.source || "location-library",
        },
      };

      // 重新计算分类
      const category = this.categorize(updatedMetadata);

      const { error: updateError } = await supabaseAdmin
        .from('photos')
        .update({
          metadata: updatedMetadata,
          category,
          updated_at: new Date().toISOString(),
        })
        .eq('id', photo.id);

      if (!updateError) {
        updatedCount++;
      }
    }

    return updatedCount;
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

  /**
   * 移入回收站
   */
  async trash(photoId: string, userId: string): Promise<void> {
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    // 权限检查
    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to trash this photo"
      );
    }

    // 更新数据库记录
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('photos')
      .update({
        trashed: true,
        trashed_at: now,
        updated_at: now,
      })
      .eq('id', photoId);

    if (error) {
      throw new Error(`Failed to trash photo: ${error.message}`);
    }
  }

  /**
   * 从回收站恢复
   */
  async restore(photoId: string, userId: string): Promise<void> {
    const photo = await this.findById(photoId);
    if (!photo) {
      throw new NotFoundError("Photo");
    }

    // 权限检查
    if (photo.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to restore this photo"
      );
    }

    // 更新数据库记录
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('photos')
      .update({
        trashed: false,
        trashed_at: null,
        updated_at: now,
      })
      .eq('id', photoId);

    if (error) {
      throw new Error(`Failed to restore photo: ${error.message}`);
    }
  }

  /**
   * 获取回收站照片列表
   */
  async getTrashedPhotos(userId: string): Promise<Photo[]> {
    const { data, error } = await supabaseAdmin
      .from('photos')
      .select('*')
      .eq('user_id', userId)
      .eq('trashed', true)
      .order('trashed_at', { ascending: false });

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
      createdAt: photo.created_at,
      updatedAt: photo.updated_at,
    }));
  }

  /**
   * 清空回收站（永久删除所有回收站照片）
   */
  async emptyTrash(userId: string): Promise<void> {
    // 获取所有回收站照片
    const trashedPhotos = await this.getTrashedPhotos(userId);

    // 逐个永久删除
    for (const photo of trashedPhotos) {
      await this.delete(photo.id, userId);
    }
  }
}

// 导出单例
export const photoStorage = new PhotoStorage();
