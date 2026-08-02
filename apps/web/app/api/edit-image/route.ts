import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { requireAuthWithRateLimit, sniffImageMime } from "@/lib/api/guard";

/**
 * ⚠️ 此前无鉴权，且 getBase64FromImage() 会 fetch 任意 URL 并把内容返回，
 * 构成完整读取型 SSRF（可读内网服务、云元数据端点）。
 * 见 PERFORMANCE-AUDIT.md 第七组 #2/#9。
 */
const MAX_PROMPT_CHARS = 5_000;
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 只允许从本项目自己的 Supabase Storage 拉图。
 *
 * 用 URL 解析后精确比对 hostname —— 不能用 includes()，
 * 因为 `http://169.254.169.254/?x=supabase.co` 也包含目标子串。
 */
function assertAllowedImageHost(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("Invalid image URL");
    }

    if (url.protocol !== "https:") {
        throw new Error("Only https image URLs are allowed");
    }

    const supabaseHost = (() => {
        try {
            return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
        } catch {
            return null;
        }
    })();

    if (!supabaseHost || url.hostname !== supabaseHost) {
        throw new Error("Image host not allowed");
    }

    return url;
}

/**
 * Convert image URL or data URL to base64
 */
async function getBase64FromImage(image: string): Promise<{ data: string; mimeType: string }> {
    // Check if it's a data URL
    const dataUrlMatch = image.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    if (dataUrlMatch) {
        const type = dataUrlMatch[1] === 'jpg' ? 'jpeg' : dataUrlMatch[1];
        return {
            data: dataUrlMatch[2],
            mimeType: `image/${type}`
        };
    }

    // Check if it's a URL (http/https)
    if (image.startsWith('http://') || image.startsWith('https://')) {
        // 只允许本项目的 Supabase Storage，且不跟随重定向（防止绕过 host 校验）
        const url = assertAllowedImageHost(image);

        const response = await fetch(url, { redirect: 'error' });
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const declared = Number(response.headers.get('content-length') ?? '0');
        if (declared > MAX_REMOTE_IMAGE_BYTES) {
            throw new Error('Remote image too large');
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
            throw new Error('Remote image too large');
        }

        const buf = Buffer.from(arrayBuffer);

        // 用 magic bytes 判定真实类型，不信任响应头
        const mimeType = sniffImageMime(buf);
        if (!mimeType) {
            throw new Error('Remote resource is not a supported image');
        }

        return { data: buf.toString('base64'), mimeType };
    }

    // Assume it's already base64
    return { data: image, mimeType: 'image/png' };
}

export async function POST(req: Request) {
    try {
        const guard = await requireAuthWithRateLimit(req, "edit-image", {
            limit: 10,
            windowMs: 60_000,
        });
        if (guard.response) return guard.response;

        const { image, prompt } = await req.json();

        if (!image || typeof image !== "string") {
            return NextResponse.json({ error: "Image is required" }, { status: 400 });
        }

        if (!prompt || typeof prompt !== "string") {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        if (prompt.length > MAX_PROMPT_CHARS) {
            return NextResponse.json(
                { error: `Prompt too long (max ${MAX_PROMPT_CHARS} chars)`, code: "PROMPT_TOO_LONG" },
                { status: 413 }
            );
        }

        const apiKey = process.env.GOOGLE_GENAI_API_KEY;
        if (!apiKey) {
            console.error("GOOGLE_GENAI_API_KEY is not set");
            return NextResponse.json({ error: "API key not configured" }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        // Convert image to base64 (handles URLs and data URLs)
        const { data: base64Image, mimeType } = await getBase64FromImage(image);

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                },
                {
                    text: prompt
                }
            ],
        });

        const candidate = response.candidates?.[0];
        if (!candidate) {
            return NextResponse.json({ error: "No image generated" }, { status: 500 });
        }

        // Iterate through parts to find the image data
        for (const part of candidate.content.parts) {
            if (part.inlineData) {
                return NextResponse.json({
                    image: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || "image/png"
                });
            }
        }

        return NextResponse.json({ error: "No image data found in response" }, { status: 500 });

    } catch (error) {
        console.error("Image editing error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to edit image" },
            { status: 500 }
        );
    }
}
