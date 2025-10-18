import { v4 as uuidv4 } from "uuid";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import exifr from "exifr";
import type { Photo, PhotoIndex, PhotoCategory, PhotoStats } from "@/types/storage";
import {
  atomicWriteJSON,
  readJSON,
  exists,
  deleteFile,
} from "./file-system";
import { PATHS } from "./init";
import { NotFoundError, UnauthorizedError } from "./errors";
import { indexManager } from "./index-manager";

/**
 * 照片存储类
 * 负责照片的 CRUD 操作和 EXIF 提取
 */
export class PhotoStorage {
  /**
   * 获取照片元数据文件路径
   */
  private getPhotoPath(photoId: string): string {
    return join(PATHS.PHOTOS, `${photoId}.json`);
  }

  /**
   * 获取照片文件存储路径
   */
  private getFilePath(userId: string, fileName: string): string {
    return join(PATHS.IMAGES, userId, "gallery", fileName);
  }

  /**
   * 获取用户的 gallery 目录路径
   */
  private getUserGalleryDir(userId: string): string {
    return join(PATHS.IMAGES, userId, "gallery");
  }

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

    // 创建照片记录
    const photo: Photo = {
      id: uuidv4(),
      userId,
      fileName,
      originalName: file.name,
      metadata,
      category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 确保用户的 gallery 目录存在
    const galleryDir = this.getUserGalleryDir(userId);
    if (!existsSync(galleryDir)) {
      await mkdir(galleryDir, { recursive: true });
    }

    // 保存文件到磁盘
    const filePath = this.getFilePath(userId, fileName);
    await writeFile(filePath, buffer as any);

    // 保存元数据到 JSON
    await atomicWriteJSON(this.getPhotoPath(photo.id), photo);

    // 添加到索引
    const photoIndex: PhotoIndex = {
      id: photo.id,
      fileName: photo.fileName,
      category: photo.category,
      dateTime: photo.metadata.dateTime,
      location: photo.metadata.location
        ? {
            latitude: photo.metadata.location.latitude,
            longitude: photo.metadata.location.longitude,
          }
        : undefined,
      updatedAt: photo.updatedAt,
    };
    await indexManager.addPhoto(userId, photoIndex);

    return photo;
  }

  /**
   * 根据 ID 获取照片
   */
  async findById(photoId: string): Promise<Photo | null> {
    const path = this.getPhotoPath(photoId);
    if (!exists(path)) {
      return null;
    }
    return await readJSON<Photo>(path);
  }

  /**
   * 获取用户的所有照片（返回索引列表）
   */
  async findByUserId(userId: string): Promise<PhotoIndex[]> {
    return await indexManager.getUserPhotos(userId);
  }

  /**
   * 按分类获取照片
   */
  async findByCategory(
    userId: string,
    category: PhotoCategory
  ): Promise<PhotoIndex[]> {
    return await indexManager.getPhotosByCategory(userId, category);
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

    // 删除文件
    const filePath = this.getFilePath(userId, photo.fileName);
    if (exists(filePath)) {
      await deleteFile(filePath);
    }

    // 删除元数据文件
    const metadataPath = this.getPhotoPath(photoId);
    if (exists(metadataPath)) {
      await deleteFile(metadataPath);
    }

    // 从索引中移除
    await indexManager.removePhoto(userId, photoId);
  }

  /**
   * 获取照片统计信息
   */
  async getStats(userId: string): Promise<PhotoStats> {
    return await indexManager.getPhotoStats(userId);
  }

  /**
   * 为照片设置地点（关联地点库）
   * 这会从地点库获取坐标并更新照片的location metadata
   *
   * @param photoId - 照片ID
   * @param userId - 用户ID（用于权限验证）
   * @param locationId - 地点库中的地点ID
   * @returns 更新后的照片
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

    // 获取地点信息（需要导入locationStorage）
    const { locationStorage } = await import("./location-storage");
    const location = await locationStorage.findById(locationId, userId);
    if (!location) {
      throw new NotFoundError("Location");
    }

    // 更新照片
    const updatedPhoto: Photo = {
      ...photo,
      locationId,
      metadata: {
        ...photo.metadata,
        location: {
          latitude: location.coordinates.latitude,
          longitude: location.coordinates.longitude,
          altitude: photo.metadata.location?.altitude,
          source: "location-library",
        },
      },
      updatedAt: new Date().toISOString(),
    };

    // 重新计算分类
    updatedPhoto.category = this.categorize(updatedPhoto.metadata);

    // 保存照片
    await atomicWriteJSON(this.getPhotoPath(photoId), updatedPhoto);

    // 更新索引
    const photoIndex: PhotoIndex = {
      id: updatedPhoto.id,
      fileName: updatedPhoto.fileName,
      category: updatedPhoto.category,
      dateTime: updatedPhoto.metadata.dateTime,
      location: updatedPhoto.metadata.location
        ? {
            latitude: updatedPhoto.metadata.location.latitude,
            longitude: updatedPhoto.metadata.location.longitude,
          }
        : undefined,
      updatedAt: updatedPhoto.updatedAt,
    };
    await indexManager.updatePhoto(userId, photoId, photoIndex);

    // 增加地点的使用计数
    await locationStorage.incrementUsage(locationId, userId);

    return updatedPhoto;
  }

  /**
   * 移除照片的地点关联
   * 这会移除locationId，但保留metadata.location（如果来自EXIF）
   *
   * @param photoId - 照片ID
   * @param userId - 用户ID（用于权限验证）
   * @returns 更新后的照片
   */
  async removeLocation(photoId: string, userId: string): Promise<Photo> {
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

    const oldLocationId = photo.locationId;

    // 更新照片 - 移除地点库关联
    const updatedPhoto: Photo = {
      ...photo,
      locationId: undefined,
      // 如果location来自地点库，则移除；如果来自EXIF，则改回exif标记
      metadata: {
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
      },
      updatedAt: new Date().toISOString(),
    };

    // 重新计算分类
    updatedPhoto.category = this.categorize(updatedPhoto.metadata);

    // 保存照片
    await atomicWriteJSON(this.getPhotoPath(photoId), updatedPhoto);

    // 更新索引
    const photoIndex: PhotoIndex = {
      id: updatedPhoto.id,
      fileName: updatedPhoto.fileName,
      category: updatedPhoto.category,
      dateTime: updatedPhoto.metadata.dateTime,
      location: updatedPhoto.metadata.location
        ? {
            latitude: updatedPhoto.metadata.location.latitude,
            longitude: updatedPhoto.metadata.location.longitude,
          }
        : undefined,
      updatedAt: updatedPhoto.updatedAt,
    };
    await indexManager.updatePhoto(userId, photoId, photoIndex);

    // 减少地点的使用计数
    if (oldLocationId) {
      const { locationStorage } = await import("./location-storage");
      await locationStorage.decrementUsage(oldLocationId, userId);
    }

    return updatedPhoto;
  }

  /**
   * 批量为多张照片设置地点
   * 用于批量操作功能
   *
   * @param photoIds - 照片ID数组
   * @param userId - 用户ID（用于权限验证）
   * @param locationId - 地点库中的地点ID
   * @returns 更新成功的照片数量
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
}

// 导出单例
export const photoStorage = new PhotoStorage();
