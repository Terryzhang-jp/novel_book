/**
 * AI Writing Partner - LLM API Route
 * 
 * POST /api/writing-partner/llm
 * 
 * Internal API for LLM-powered tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { requireAuthWithRateLimit } from '@/lib/api/guard';

/**
 * ⚠️ 此前这个路由完全没有鉴权，是一个开放的 Gemini 代理：
 * 任何人都能用本站的 API key 无限次调用任意 prompt。
 * 见 PERFORMANCE-AUDIT.md 第七组 #1。
 */

/** prompt 长度上限，防止有人用超长上下文烧 token */
const MAX_PROMPT_CHARS = 20_000;
/** 单次输出上限，覆盖客户端传入的任意值 */
const MAX_OUTPUT_TOKENS = 2_000;

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
        // 必须登录 + 按用户限流（每分钟 20 次）
        const guard = await requireAuthWithRateLimit(request, 'wp-llm', {
            limit: 20,
            windowMs: 60_000,
        });
        if (guard.response) return guard.response;

        const body: LLMRequest = await request.json();
        const { prompt, temperature = 0.3, maxTokens = 1000 } = body;

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Missing prompt' },
                { status: 400 }
            );
        }

        if (prompt.length > MAX_PROMPT_CHARS) {
            return NextResponse.json(
                { error: `Prompt too long (max ${MAX_PROMPT_CHARS} chars)`, code: 'PROMPT_TOO_LONG' },
                { status: 413 }
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

        // Call Gemini —— 客户端传入的 maxTokens 只能调低，不能调高
        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                temperature: Math.min(Math.max(temperature, 0), 1),
                maxOutputTokens: Math.min(maxTokens, MAX_OUTPUT_TOKENS),
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
