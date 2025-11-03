import { NextResponse } from "next/server";
import { photoStorage } from "@/lib/storage/photo-storage";
import { userStorage } from "@/lib/storage/user-storage";
import type { Photo, PhotoIndex } from "@/types/storage";

export const runtime = "nodejs";

/**
 * PublicPhotoData - 公共照片数据（包含用户信息）
 * 使用 PhotoIndex 格式（location 在根级别）以便与 PhotoMap 组件兼容
 */
interface PublicPhotoData extends Omit<Photo, 'metadata'> {
  userName: string; // 上传者姓名
  metadata: Photo['metadata'];
  // PhotoIndex 格式的字段
  dateTime?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * GET /api/public/photos - 获取所有公开的照片（用于公共地图）
 *
 * 特点：
 * - 无需认证（公开访问）
 * - 返回所有用户的公开照片
 * - 只返回有位置信息的照片
 * - JOIN 用户信息（姓名）
 */
export async function GET() {
  try {
    console.log('[GET /api/public/photos] Fetching all public photos...');

    // 1. 获取所有公开的照片（已过滤：isPublic !== false && 有位置）
    const photos = await photoStorage.getAllPublicPhotos();
    console.log(`[GET /api/public/photos] Found ${photos.length} public photos`);

    // 2. 读取所有用户信息（用于 JOIN）
    const users = await userStorage.findAll();
    const userMap = new Map(users.map(user => [user.id, user]));
    console.log(`[GET /api/public/photos] Loaded ${users.length} users`);

    // 3. JOIN 用户信息并转换为 PhotoIndex 格式
    const photosWithUserInfo: PublicPhotoData[] = photos.map(photo => {
      const user = userMap.get(photo.userId);
      return {
        ...photo,
        userName: user?.name || 'Anonymous',
        // 将 metadata.location 提升到根级别（PhotoIndex 格式）
        dateTime: photo.metadata.dateTime,
        location: photo.metadata.location ? {
          latitude: photo.metadata.location.latitude,
          longitude: photo.metadata.location.longitude,
        } : undefined,
      };
    });

    console.log('[GET /api/public/photos] Successfully prepared response');
    console.log('[GET /api/public/photos] Photos with root location field:', photosWithUserInfo.filter(p => p.location).length);

    return NextResponse.json({
      photos: photosWithUserInfo,
      count: photosWithUserInfo.length,
    });
  } catch (error) {
    console.error('[GET /api/public/photos] Error occurred:', error);
    console.error('[GET /api/public/photos] Error stack:', error instanceof Error ? error.stack : 'No stack');

    return NextResponse.json(
      {
        error: 'Failed to get public photos',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
