/**
 * AI Magic Generate API
 *
 * Step 2: 使用 Gemini 3 Pro Image Preview 生成图像
 * 支持多图输入
 */

import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { aiMagicStorage } from "@/lib/storage/ai-magic-storage";
import type {
  AiMagicGenerateRequest,
  AiMagicGenerateResponse,
} from "@/types/storage";

// 模型配置 - 使用 Nano Banana Pro 高质量模型
// gemini-2.5-flash-image: 快速、低成本（风格转换效果一般）
// gemini-3-pro-image-preview: 高质量、更好的风格转换 (Nano Banana Pro)
const IMAGE_MODEL = "gemini-3-pro-image-preview";

/**
 * 提取 base64 数据（移除 data URL 前缀）
 */
function extractBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
}

/**
 * 检测 MIME 类型
 */
function detectMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,/);
  if (match) {
    const type = match[1];
    return type === "jpg" ? "image/jpeg" : `image/${type}`;
  }
  return "image/png";
}

export async function POST(req: Request) {
  try {
    // 验证用户登录
    const session = await requireAuth(req);
    const userId = session.userId;

    const body: AiMagicGenerateRequest = await req.json();

    if (!body.prompt || body.prompt.trim() === "") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_GENAI_API_KEY is not set");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // 构建内容数组
    const contents: any[] = [];

    // 添加输入图片（用于编辑或合成）
    if (body.inputImages && body.inputImages.length > 0) {
      for (const image of body.inputImages.slice(0, 6)) {
        // 最多 6 张输入图片
        contents.push({
          inlineData: {
            mimeType: detectMimeType(image),
            data: extractBase64(image),
          },
        });
      }
    }

    // 添加风格参考图
    if (body.styleImages && body.styleImages.length > 0) {
      for (const image of body.styleImages.slice(0, 5)) {
        // 最多 5 张风格图
        contents.push({
          inlineData: {
            mimeType: detectMimeType(image),
            data: extractBase64(image),
          },
        });
      }
    }

    // 添加 prompt
    contents.push({
      text: body.prompt,
    });

    console.log("AI Magic Generate - calling model:", IMAGE_MODEL);
    console.log("AI Magic Generate - contents parts:", contents.length);

    // 调用图像生成模型
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: contents,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    console.log("AI Magic Generate - response received");

    const candidate = response.candidates?.[0];
    if (!candidate) {
      return NextResponse.json(
        { error: "No image generated" },
        { status: 500 }
      );
    }

    // 查找生成的图像
    let imageData: string | null = null;
    let mimeType = "image/png";

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
        break;
      }
    }

    if (!imageData) {
      return NextResponse.json(
        { error: "No image data in response" },
        { status: 500 }
      );
    }

    // 构建完整的 data URL
    const resultImage = `data:${mimeType};base64,${imageData}`;

    // 保存到历史记录
    const historyItem = await aiMagicStorage.addHistoryItem(userId, {
      userPrompt: body.userPrompt || body.prompt,
      inputImageCount: body.inputImages?.length || 0,
      styleImageCount: body.styleImages?.length || 0,
      optimizedPrompt: body.prompt,
      reasoning: body.reasoning,
      resultImage,
      model: IMAGE_MODEL,
    });

    const result: AiMagicGenerateResponse = {
      image: imageData,
      mimeType,
      historyId: historyItem.id,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Magic generate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate image",
      },
      { status: 500 }
    );
  }
}
