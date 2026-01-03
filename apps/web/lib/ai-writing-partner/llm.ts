/**
 * AI Writing Partner - Gemini LLM Client
 * 
 * Direct access to Gemini for server-side use
 */

import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client
const genAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY || '',
});

interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
}

/**
 * Call Gemini LLM directly (for server-side use)
 */
export async function callGemini(
    prompt: string,
    options: LLMOptions = {}
): Promise<string> {
    const { temperature = 0.7, maxTokens = 500 } = options;

    // Check API key
    if (!process.env.GOOGLE_GENAI_API_KEY) {
        console.error('GOOGLE_GENAI_API_KEY not configured');
        throw new Error('LLM not configured');
    }

    try {
        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        });

        return result.text || '';
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

/**
 * Call Gemini and parse JSON response
 */
export async function callGeminiJSON<T>(
    prompt: string,
    options: LLMOptions = {}
): Promise<T | null> {
    const text = await callGemini(prompt, options);

    try {
        // Remove markdown code blocks if present
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : text;
        return JSON.parse(jsonText.trim()) as T;
    } catch {
        console.error('Failed to parse JSON from LLM response:', text);
        return null;
    }
}
