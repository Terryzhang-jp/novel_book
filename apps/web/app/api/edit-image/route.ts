import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

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
        const response = await fetch(image);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        // Get mime type from response headers or URL
        const contentType = response.headers.get('content-type') || 'image/png';
        const mimeType = contentType.split(';')[0].trim();

        return { data: base64, mimeType };
    }

    // Assume it's already base64
    return { data: image, mimeType: 'image/png' };
}

export async function POST(req: Request) {
    try {
        const { image, prompt } = await req.json();

        if (!image) {
            return NextResponse.json({ error: "Image is required" }, { status: 400 });
        }

        if (!prompt) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
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
