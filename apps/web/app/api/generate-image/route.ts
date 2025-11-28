import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { prompt } = await req.json();

        if (!prompt) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        const apiKey = process.env.GOOGLE_GENAI_API_KEY;
        if (!apiKey) {
            console.error("GOOGLE_GENAI_API_KEY is not set");
            return NextResponse.json({ error: "API key not configured" }, { status: 500 });
        }

        // Initialize GoogleGenAI with the API key
        // Note: The SDK might expect { apiKey: ... } or just the key depending on version, 
        // but based on standard Google Cloud SDKs, passing auth options is common.
        // The user's example used new GoogleGenAI({}), implying an options object.
        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: prompt,
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
        console.error("Image generation error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate image" },
            { status: 500 }
        );
    }
}
