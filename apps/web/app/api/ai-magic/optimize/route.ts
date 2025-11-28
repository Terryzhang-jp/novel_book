/**
 * AI Magic Optimize API
 *
 * Step 1: 使用 Gemini 文本模型分析用户需求，生成优化的 prompt
 * 应用 Nano Banana Pro prompt 写作技巧
 */

import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import type {
  AiMagicOptimizeRequest,
  AiMagicOptimizeResponse,
} from "@/types/storage";

/**
 * 系统提示词：Prompt 优化专家
 */
const SYSTEM_PROMPT = `You are an expert prompt engineer specializing in Gemini 3 Pro Image (Nano Banana Pro) prompts.

Your task is to analyze the user's request and create the BEST possible prompt for image generation/editing.

## CRITICAL RULES:

1. **ALWAYS OUTPUT THE PROMPT IN ENGLISH** - Even if the user's request is in Chinese, Japanese, or other languages, the optimizedPrompt MUST be in English.

2. **CHOOSE THE RIGHT STRATEGY** - When input images are provided, decide the best approach:

   **Strategy A: STYLE TRANSFER** (for artistic style changes)
   - Use when: user wants to change the visual style (e.g., "make it hand-drawn", "watercolor style")
   - Start with: "Apply [style] to this image" or "Render this image in [style]"
   - Be AGGRESSIVE about the style change: "Completely reimagine and redraw this image as a [style], with [specific artistic details]"
   - Example: "Completely reimagine and redraw this map as a hand-drawn watercolor illustration. Use soft, flowing brushstrokes, warm earth-tone washes, hand-lettered text labels in a casual script style, and artistic imperfections typical of traditional watercolor paintings. The roads should look like they were drawn with a fine brush, mountains should have soft gradients, and the overall feel should be like a vintage travel journal illustration."

   **Strategy B: CONTENT EDITING** (for changing specific elements)
   - Use when: user wants to modify content (e.g., "add a tree", "remove the car", "change the color")
   - Start with: "Edit this image to..." or "Modify the image by..."

   **Strategy C: INSPIRED GENERATION** (for creating new content based on reference)
   - Use when: the input is just reference/inspiration for a NEW creation
   - Start with: "Create a new [type] inspired by the reference image but..."
   - Example: "Create a new hand-drawn travel map inspired by this reference, featuring the same locations but rendered in a charming illustrated style with whimsical details"

3. **BE EXTREMELY SPECIFIC FOR STYLE CHANGES**:
   - Describe the EXACT artistic medium: watercolor, ink, pencil, crayon, oil paint
   - Describe texture: rough paper, smooth canvas, aged parchment
   - Describe line quality: bold strokes, delicate lines, sketchy, precise
   - Describe color palette: muted earth tones, vibrant saturated colors, monochrome
   - Describe imperfections: hand-drawn wobbles, paint bleeds, pencil smudges

## Response Format:

Return a JSON object with:
- "optimizedPrompt": A detailed, aggressive prompt that will produce VISIBLE changes. Be specific and descriptive. IN ENGLISH.
- "reasoning": Brief explanation including which strategy you chose and why
- "suggestions": Array of optional tips for better results

Always respond in valid JSON format only.`;

/**
 * 构建用户消息
 */
function buildUserMessage(request: AiMagicOptimizeRequest): string {
  const hasInputImages = request.inputImages && request.inputImages.length > 0;
  const hasStyleImages = request.styleImages && request.styleImages.length > 0;

  let message = `User's request (may be in any language, but your output MUST be in English): "${request.userPrompt}"`;

  if (hasInputImages) {
    message += `\n\n📷 INPUT IMAGES PROVIDED: ${request.inputImages!.length} image(s)

⚠️ CRITICAL: The user uploaded images for editing/transformation. Analyze the user's intent and choose the RIGHT strategy:
- If they want STYLE CHANGE (e.g., "手绘风格", "watercolor", "cartoon"): Use Strategy A - be AGGRESSIVE about the transformation
- If they want CONTENT EDIT (e.g., "add", "remove", "change"): Use Strategy B
- If the input is just REFERENCE for new creation: Use Strategy C

The prompt MUST produce a result that is VISIBLY DIFFERENT from the original. Don't just upscale or slightly modify - create a genuine transformation!`;
  }

  if (hasStyleImages) {
    message += `\n\n🎨 STYLE REFERENCE PROVIDED: ${request.styleImages!.length} image(s). Apply this visual style to the output.`;
  }

  if (!hasInputImages && !hasStyleImages) {
    message += `\n\n✨ PURE GENERATION: No input images. Create a detailed prompt describing the desired image from scratch.`;
  }

  message += `\n\n📝 Requirements:
- Output optimizedPrompt in ENGLISH
- Be extremely specific and descriptive
- The prompt should produce DRAMATIC, VISIBLE results
- Respond in JSON format only`;

  return message;
}

/**
 * 解析 AI 响应
 */
function parseResponse(text: string): AiMagicOptimizeResponse {
  // 尝试提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    optimizedPrompt: parsed.optimizedPrompt || parsed.prompt || text,
    reasoning: parsed.reasoning || "Prompt optimized using Nano Banana Pro best practices.",
    suggestions: parsed.suggestions || [],
  };
}

export async function POST(req: Request) {
  try {
    // 验证用户登录
    await requireAuth(req);

    const body: AiMagicOptimizeRequest = await req.json();

    if (!body.userPrompt || body.userPrompt.trim() === "") {
      return NextResponse.json(
        { error: "User prompt is required" },
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

    // 构建完整提示文本
    const combinedPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${buildUserMessage(body)}`;

    // 检测 MIME 类型
    function detectMimeType(dataUrl: string): string {
      const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,/);
      if (match) {
        const type = match[1];
        return type === "jpg" ? "image/jpeg" : `image/${type}`;
      }
      return "image/png";
    }

    // 提取 base64 数据
    function extractBase64(dataUrl: string): string {
      return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    }

    // 判断是否有图片
    const hasInputImages = body.inputImages && body.inputImages.length > 0;
    const hasStyleImages = body.styleImages && body.styleImages.length > 0;
    const hasImages = hasInputImages || hasStyleImages;

    let contents: string | any[];

    if (hasImages) {
      // 有图片时使用数组格式
      const parts: any[] = [];

      // 添加输入图片
      if (hasInputImages) {
        for (const image of body.inputImages!.slice(0, 3)) {
          parts.push({
            inlineData: {
              mimeType: detectMimeType(image),
              data: extractBase64(image),
            },
          });
        }
      }

      // 添加风格图片
      if (hasStyleImages) {
        for (const image of body.styleImages!.slice(0, 2)) {
          parts.push({
            inlineData: {
              mimeType: detectMimeType(image),
              data: extractBase64(image),
            },
          });
        }
      }

      // 添加文本提示
      parts.push({ text: combinedPrompt });

      contents = parts;
    } else {
      // 没有图片时直接使用字符串
      contents = combinedPrompt;
    }

    console.log("Calling Gemini with contents type:", typeof contents, Array.isArray(contents) ? `array length: ${contents.length}` : "string");

    // 调用 Gemini 多模态模型进行分析
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
    });

    const candidate = response.candidates?.[0];
    if (!candidate) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // 提取文本响应
    let responseText = "";
    for (const part of candidate.content.parts) {
      if (part.text) {
        responseText += part.text;
      }
    }

    if (!responseText) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 500 }
      );
    }

    // 解析响应
    const result = parseResponse(responseText);

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Magic optimize error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to optimize prompt",
      },
      { status: 500 }
    );
  }
}
