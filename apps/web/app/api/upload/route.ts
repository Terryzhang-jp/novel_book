import { uploadFile, getPublicUrl } from "@/lib/supabase/storage";
import {
  requireApiAuth,
  checkUploadedImage,
  sanitizeFileName,
  rateLimit,
} from "@/lib/api/guard";
import { NextResponse } from "next/server";

// Use Node.js runtime for better compatibility with Buffer/Stream handling in Supabase client
export const runtime = "nodejs";

/** 单文件上限 10 MB，与 /api/photos 保持一致 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/upload — 编辑器内嵌图片上传
 *
 * 安全要求（此前全部缺失，见 PERFORMANCE-AUDIT.md 第七组 #3/#7）：
 * 1. 必须登录
 * 2. 按用户限流
 * 3. 大小上限
 * 4. 用 magic bytes 判定真实类型，不信任 Content-Type 请求头
 * 5. 文件名清洗，防止路径穿越进入对象存储 key
 * 6. 上传路径按用户隔离
 */
export async function POST(req: Request) {
  try {
    const guard = await requireApiAuth(req);
    if (guard.response) return guard.response;
    const { userId } = guard.session;

    const limited = rateLimit(`upload:${userId}`, { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    if (!req.body) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 先看声明长度，避免把超大请求整个读进内存
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 10MB)", code: "FILE_TOO_LARGE" },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await req.arrayBuffer());

    // 真实类型校验 —— 返回的 mime 才可信，请求头里的不可信
    const check = checkUploadedImage(buffer, { maxBytes: MAX_UPLOAD_BYTES });
    if (check.response) return check.response;
    const contentType = check.mime;

    const rawName = req.headers.get("x-vercel-filename") ?? "image";
    const safeName = sanitizeFileName(rawName, "image");

    // 按用户隔离，和照片库的路径约定保持一致
    const path = `${userId}/uploads/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const bucket = "documents";

    await uploadFile(bucket, path, buffer, {
      contentType,
      // 内容不可变（路径含 uuid），可以长期缓存
      cacheControl: "public, max-age=31536000, immutable",
      upsert: false,
    });

    return NextResponse.json({ url: getPublicUrl(bucket, path) });
  } catch (error) {
    // 不把内部错误信息回给客户端
    console.error("[POST /api/upload] Upload failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
