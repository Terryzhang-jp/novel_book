import { v4 as uuidv4 } from "uuid";
import exifr from "exifr";
import type { JSONContent } from "novel";
import type { Photo, PhotoIndex, PhotoCategory, PhotoStats } from "@/types/storage";
import { NotFoundError, UnauthorizedError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadFile, deleteFile as deleteStorageFile, getPublicUrl } from "@/lib/supabase/storage";

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

    // 上传到 Supabase Storage
    const storagePath = `${userId}/gallery/${fileName}`;
    await uploadFile('photos', storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

    // 获取公开 URL
    const fileUrl = getPublicUrl('photos', storagePath);

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
      metadata: data.metadata,
      category: data.category,
      locationId: data.location_id,
      title: data.title,
      description: data.description,
      tags: data.tags,
      isPublic: data.is_public,
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
      metadata: data.metadata,
      category: data.category,
      locationId: data.location_id,
      title: data.title,
      description: data.description,
      tags: data.tags,
      isPublic: data.is_public,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * 获取用户的所有照片（返回完整照片列表）
   */
  async findByUserId(userId: string): Promise<Photo[]> {
    const { data, error } = await supabaseAdmin
      .from('photos')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

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
      createdAt: photo.created_at,
      updatedAt: photo.updated_at,
    }));
  }

  /**
   * 按分类获取照片（返回完整照片列表）
   */
  async findByCategory(
    userId: string,
    category: PhotoCategory
  ): Promise<Photo[]> {
    const { data, error } = await supabaseAdmin
      .from('photos')
      .select('*')
      .eq('user_id', userId)
      .eq('category', category)
      .order('updated_at', { ascending: false });

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
      .eq('user_id', userId);

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
      createdAt: photo.created_at,
      updatedAt: photo.updated_at,
    }));
  }
}

// 导出单例
export const photoStorage = new PhotoStorage();
