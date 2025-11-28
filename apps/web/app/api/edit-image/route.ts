import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

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

        // Remove data URL prefix if present (e.g., "data:image/png;base64,")
        const base64Image = image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [
                {
                    inlineData: {
                        mimeType: "image/png",
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
