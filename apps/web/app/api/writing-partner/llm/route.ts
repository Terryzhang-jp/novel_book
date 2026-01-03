/**
 * AI Writing Partner - LLM API Route
 * 
 * POST /api/writing-partner/llm
 * 
 * Internal API for LLM-powered tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const genAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY || '',
});

interface LLMRequest {
    prompt: string;
    temperature?: number;
    maxTokens?: number;
}

export async function POST(request: NextRequest) {
    try {
        const body: LLMRequest = await request.json();
        const { prompt, temperature = 0.3, maxTokens = 1000 } = body;

        if (!prompt) {
            return NextResponse.json(
                { error: 'Missing prompt' },
                { status: 400 }
            );
        }

        // Check API key
        if (!process.env.GOOGLE_GENAI_API_KEY) {
            console.error('GOOGLE_GENAI_API_KEY not configured');
            return NextResponse.json(
                { error: 'API not configured' },
                { status: 500 }
            );
        }

        // Call Gemini
        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        });

        // Extract text
        const text = result.text || '';

        // Try to parse as JSON
        let parsedResult;
        try {
            // Remove markdown code blocks if present
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            const jsonText = jsonMatch ? jsonMatch[1] : text;
            parsedResult = JSON.parse(jsonText.trim());
        } catch {
            // If not valid JSON, return as is
            parsedResult = { text };
        }

        return NextResponse.json({ result: parsedResult });

    } catch (error) {
        console.error('LLM API error:', error);
        return NextResponse.json(
            { error: 'LLM call failed' },
            { status: 500 }
        );
    }
}
