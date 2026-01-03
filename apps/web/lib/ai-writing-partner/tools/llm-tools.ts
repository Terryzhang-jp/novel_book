/**
 * AI Writing Partner - LLM Tools
 * 
 * Tools that require LLM (Gemini) for intelligent analysis:
 * - inferUserIntent: Infer writing goals and themes
 * - extractNarrativeElements: Extract characters, scenes, mood
 * - analyzeWritingStyle: Analyze writing style
 * - generateSummary: Generate document summary
 */

import type {
    IntentInferenceResult,
    NarrativeExtractionResult,
    StyleAnalysisResult,
    SummaryResult,
    Character,
    Scene,
    UserIntent,
} from '../types';

// ============================================================================
// LLM Interface
// ============================================================================

interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
}

/**
 * Get the base URL for API calls (works on both client and server)
 */
function getBaseUrl(): string {
    // Server-side: use environment variable
    if (typeof window === 'undefined') {
        return process.env.NEXT_PUBLIC_APP_URL ||
            process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
            'http://localhost:3000';
    }
    // Client-side: use relative URL
    return '';
}

/**
 * Call the LLM with a prompt and expect JSON output
 */
async function callLLM<T>(
    prompt: string,
    options: LLMOptions = {}
): Promise<T> {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/writing-partner/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt,
            temperature: options.temperature ?? 0.3,
            maxTokens: options.maxTokens ?? 1000,
        }),
    });

    if (!response.ok) {
        throw new Error(`LLM call failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result as T;
}

// ============================================================================
// Tool: Infer User Intent
// ============================================================================

interface InferUserIntentInput {
    documentContent: string;
    documentTitle?: string;
    existingIntent?: UserIntent;
}

/**
 * Infer user's writing goal and themes from content
 */
export async function inferUserIntent(
    input: InferUserIntentInput
): Promise<IntentInferenceResult> {
    const { documentContent, documentTitle, existingIntent } = input;

    // Skip if content is too short
    if (documentContent.length < 100) {
        return {
            inferredGoal: null,
            goalConfidence: 0,
            inferredGenre: null,
            inferredThemes: [],
            shouldAskUser: false,
            suggestedQuestion: null,
        };
    }

    const existingContext = existingIntent?.goal
        ? `现有推测: ${existingIntent.goal} (置信度: ${existingIntent.goalConfidence})`
        : '暂无推测';

    const prompt = `你是一位写作分析专家。请根据以下文档内容，推测用户的写作目标和主题。

## 文档标题
${documentTitle || '(无标题)'}

## 文档内容（前 2000 字）
${documentContent.slice(0, 2000)}

## 已有信息
${existingContext}

## 请分析并返回 JSON：
{
  "inferredGoal": "推测的写作目标，如'记录东京旅行的回忆'",
  "goalConfidence": 0.0-1.0 的置信度,
  "inferredGenre": "文体类型：旅行日记/小说/散文/工作文档/学术/其他",
  "inferredThemes": ["主题1", "主题2"],
  "shouldAskUser": true/false (如果置信度低于0.6应该询问用户),
  "suggestedQuestion": "如果需要询问，给出自然的问题"
}

注意：
- 如果内容太少或太模糊，置信度应该较低
- 问题应该温和友好，不像调查问卷
- 只返回 JSON，不要其他内容`;

    try {
        return await callLLM<IntentInferenceResult>(prompt);
    } catch (error) {
        console.error('Failed to infer user intent:', error);
        return {
            inferredGoal: null,
            goalConfidence: 0,
            inferredGenre: null,
            inferredThemes: [],
            shouldAskUser: false,
            suggestedQuestion: null,
        };
    }
}

// ============================================================================
// Tool: Extract Narrative Elements
// ============================================================================

interface ExtractNarrativeInput {
    recentParagraphs: string[];
    existingCharacters?: Character[];
    existingScenes?: Scene[];
}

/**
 * Extract characters, scenes, and mood from recent content
 */
export async function extractNarrativeElements(
    input: ExtractNarrativeInput
): Promise<NarrativeExtractionResult> {
    const { recentParagraphs, existingCharacters = [], existingScenes = [] } = input;

    if (recentParagraphs.length === 0) {
        return {
            newCharacters: [],
            updatedCharacters: [],
            currentScene: null,
            mood: 'neutral',
            narrativeProgression: '',
        };
    }

    const existingCharsContext = existingCharacters.length > 0
        ? `已知人物: ${existingCharacters.map(c => c.name).join(', ')}`
        : '暂无已知人物';

    const existingScenesContext = existingScenes.length > 0
        ? `已知场景: ${existingScenes.map(s => s.name).join(', ')}`
        : '暂无已知场景';

    const prompt = `你是一位叙事分析专家。请分析以下段落，提取叙事元素。

## 最近的段落
${recentParagraphs.join('\n\n')}

## 上下文
${existingCharsContext}
${existingScenesContext}

## 请分析并返回 JSON：
{
  "newCharacters": [
    {
      "name": "人物名",
      "firstMention": 0,
      "description": "简短描述",
      "relationships": ["与其他人物的关系"]
    }
  ],
  "updatedCharacters": [
    {
      "name": "已知人物名",
      "description": "更新的描述",
      "relationships": ["更新的关系"]
    }
  ],
  "currentScene": {
    "name": "场景名",
    "location": "地点或null",
    "timeOfDay": "时间段或null",
    "mood": "氛围情绪",
    "characters": ["在场人物"]
  },
  "mood": "整体情绪：温馨/紧张/悲伤/欢快/平静/...",
  "narrativeProgression": "简述情节发展"
}

注意：
- 如果没有新人物，newCharacters 应为空数组
- 如果场景不明确，currentScene 可以为 null
- 只返回 JSON，不要其他内容`;

    try {
        return await callLLM<NarrativeExtractionResult>(prompt);
    } catch (error) {
        console.error('Failed to extract narrative elements:', error);
        return {
            newCharacters: [],
            updatedCharacters: [],
            currentScene: null,
            mood: 'neutral',
            narrativeProgression: '',
        };
    }
}

// ============================================================================
// Tool: Analyze Writing Style
// ============================================================================

interface AnalyzeStyleInput {
    sampleText: string;
}

/**
 * Analyze user's writing style characteristics
 */
export async function analyzeWritingStyle(
    input: AnalyzeStyleInput
): Promise<StyleAnalysisResult> {
    const { sampleText } = input;

    // Need at least 300 chars for meaningful analysis
    if (sampleText.length < 300) {
        return {
            tone: 'neutral',
            pacing: 'moderate',
            vocabulary: 'standard',
            sentenceStyle: 'mixed',
            distinctiveFeatures: [],
        };
    }

    const prompt = `你是一位文学风格分析专家。请分析以下文本的写作风格。

## 文本样本
${sampleText.slice(0, 3000)}

## 请分析并返回 JSON：
{
  "tone": "语气风格：温暖/幽默/严肃/轻松/忧郁/neutral",
  "pacing": "节奏：紧凑/舒缓/moderate",
  "vocabulary": "用词：简洁/华丽/口语化/学术/standard",
  "sentenceStyle": "句式：短句为主/长句为主/mixed",
  "distinctiveFeatures": ["独特特征1", "独特特征2", "..."]
}

注意：
- distinctiveFeatures 应该是具体的风格特点
- 如果风格不明显，使用默认值
- 只返回 JSON，不要其他内容`;

    try {
        return await callLLM<StyleAnalysisResult>(prompt);
    } catch (error) {
        console.error('Failed to analyze writing style:', error);
        return {
            tone: 'neutral',
            pacing: 'moderate',
            vocabulary: 'standard',
            sentenceStyle: 'mixed',
            distinctiveFeatures: [],
        };
    }
}

// ============================================================================
// Tool: Generate Summary
// ============================================================================

interface GenerateSummaryInput {
    fullDocument: string;
    previousSummary?: string;
    focusAreas?: string[];
}

/**
 * Generate or update document summary
 */
export async function generateSummary(
    input: GenerateSummaryInput
): Promise<SummaryResult> {
    const { fullDocument, previousSummary, focusAreas = [] } = input;

    if (fullDocument.length < 100) {
        return {
            summary: '',
            keyPoints: [],
            unfinishedThreads: [],
        };
    }

    const previousContext = previousSummary
        ? `之前的摘要: ${previousSummary}`
        : '';

    const focusContext = focusAreas.length > 0
        ? `请特别关注: ${focusAreas.join(', ')}`
        : '';

    const prompt = `你是一位文档分析专家。请为以下文档生成简洁的摘要。

## 文档内容
${fullDocument.slice(0, 5000)}

${previousContext}
${focusContext}

## 请分析并返回 JSON：
{
  "summary": "100-200字的文档摘要",
  "keyPoints": ["关键点1", "关键点2", "..."],
  "unfinishedThreads": ["未完成的情节/话题1", "..."]
}

注意：
- 摘要应该简洁但全面
- unfinishedThreads 是指开始但未结束的内容线索
- 只返回 JSON，不要其他内容`;

    try {
        return await callLLM<SummaryResult>(prompt);
    } catch (error) {
        console.error('Failed to generate summary:', error);
        return {
            summary: '',
            keyPoints: [],
            unfinishedThreads: [],
        };
    }
}
