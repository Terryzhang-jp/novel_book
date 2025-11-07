import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";
import sharp from "sharp";

export const runtime = "nodejs";

// 配置
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;
const CACHE_MAX_AGE = 60 * 60 * 24 * 7; // 7天缓存

/**
 * GET /api/photos/[id]/optimized - 获取优化后的图片
 * 用于编辑器加载，减少带宽和内存占用
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);
    const { id: photoId } = await params;

    // 获取照片信息
    const photo = await photoStorage.findById(photoId);

    if (!photo) {
      return NextResponse.json(
        { error: "Photo not found" },
        { status: 404 }
      );
    }

    // 权限检查
    if (photo.userId !== session.userId) {
      return NextResponse.json(
        { error: "You don't have permission to access this photo" },
        { status: 403 }
      );
    }

    // 从Supabase获取原始图片
    const response = await fetch(photo.fileUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image from Supabase: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 获取原始尺寸
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    console.log(`[Optimized API] Original size: ${originalWidth}x${originalHeight}`);

    // 如果图片已经很小，直接返回
    if (originalWidth <= MAX_WIDTH && originalHeight <= MAX_HEIGHT) {
      console.log(`[Optimized API] Image already small enough, returning original`);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
          "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
          "X-Image-Optimized": "false",
          "X-Original-Size": `${originalWidth}x${originalHeight}`,
        },
      });
    }

    // 计算优化后的尺寸（保持宽高比）
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (originalWidth > MAX_WIDTH || originalHeight > MAX_HEIGHT) {
      const aspectRatio = originalWidth / originalHeight;

      if (originalWidth > originalHeight) {
        targetWidth = MAX_WIDTH;
        targetHeight = Math.round(MAX_WIDTH / aspectRatio);
      } else {
        targetHeight = MAX_HEIGHT;
        targetWidth = Math.round(MAX_HEIGHT * aspectRatio);
      }
    }

    console.log(`[Optimized API] Resizing to: ${targetWidth}x${targetHeight}`);

    // 使用Sharp处理图片
    const optimizedBuffer = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3, // 高质量缩放
      })
      .jpeg({
        quality: 85, // 平衡质量和文件大小
        progressive: true,
        mozjpeg: true, // 使用mozjpeg优化
      })
      .toBuffer();

    console.log(
      `[Optimized API] Original: ${buffer.length} bytes, Optimized: ${optimizedBuffer.length} bytes, Saved: ${Math.round((1 - optimizedBuffer.length / buffer.length) * 100)}%`
    );

    return new NextResponse(optimizedBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
        "X-Image-Optimized": "true",
        "X-Original-Size": `${originalWidth}x${originalHeight}`,
        "X-Optimized-Size": `${targetWidth}x${targetHeight}`,
      },
    });
  } catch (error) {
    console.error("[Optimized API] Error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to optimize image" },
      { status: 500 }
    );
  }
}
