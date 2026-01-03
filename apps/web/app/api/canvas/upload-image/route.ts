/**
 * Canvas Image Upload API
 *
 * POST /api/canvas/upload-image
 * - 需要认证
 * - 使用 FormData 接收图片（避免 JSON 序列化大型 base64 导致栈溢出）
 * - 立即上传图片到 Supabase Storage
 * - 返回公开 URL
 *
 * 用于解决保存时 payload 过大的问题
 * 图片在添加到 canvas 时立即上传，而非保存时批量处理
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { canvasStorage } from "@/lib/storage/canvas-storage";

export async function POST(req: Request) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;

    // 解析 FormData
    const formData = await req.formData();
    const projectId = formData.get("projectId") as string;
    const imageFile = formData.get("image") as File | null;

    // 验证参数
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    if (!imageFile) {
      return NextResponse.json(
        { error: "image file is required" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!imageFile.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Invalid file type, must be an image" },
        { status: 400 }
      );
    }

    // 验证 projectId 属于当前用户
    const project = await canvasStorage.findById(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (project.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // 将 File 转换为 Buffer 并上传
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传图片到 Supabase Storage
    const url = await canvasStorage.uploadImageBuffer(
      userId,
      projectId,
      buffer,
      imageFile.type
    );

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[Canvas Upload Image] Error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Invalid image")) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image" },
      { status: 500 }
    );
  }
}
