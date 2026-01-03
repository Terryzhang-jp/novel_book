/**
 * AI Writing Partner - Tool: Analyze Metrics
 * 
 * Pure local tool (no LLM) that calculates writing statistics
 */

import type { WritingMetrics } from '../types';

/**
 * Analyze document metrics
 * This is a pure function that runs locally without LLM
 */
export function analyzeMetrics(documentContent: string): WritingMetrics {
    if (!documentContent || documentContent.trim().length === 0) {
        return {
            charCount: 0,
            wordCount: 0,
            paragraphCount: 0,
            sentenceCount: 0,
            estimatedReadTime: '0 分钟',
            averageSentenceLength: 0,
        };
    }

    // Character count (excluding spaces for CJK-friendly count)
    const charCount = documentContent.replace(/\s/g, '').length;

    // Word count - handle both CJK and Western text
    // For CJK: count characters as words
    // For Western: count space-separated words
    const cjkChars = documentContent.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || [];
    const cjkWordCount = cjkChars.length;

    // Remove CJK characters and count remaining words
    const nonCjkText = documentContent.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, ' ');
    const westernWords = nonCjkText.split(/\s+/).filter(word => word.length > 0);
    const westernWordCount = westernWords.length;

    const wordCount = cjkWordCount + westernWordCount;

    // Paragraph count
    const paragraphs = documentContent
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
    const paragraphCount = paragraphs.length || 1;

    // Sentence count - handle both CJK and Western punctuation
    const sentences = documentContent
        .split(/[。！？.!?]+/)
        .filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length || 1;

    // Average sentence length
    const averageSentenceLength = Math.round(charCount / sentenceCount);

    // Estimated read time (assuming ~300 CJK chars/min or ~200 Western words/min)
    const cjkReadTime = cjkWordCount / 300;
    const westernReadTime = westernWordCount / 200;
    const totalMinutes = cjkReadTime + westernReadTime;

    let estimatedReadTime: string;
    if (totalMinutes < 1) {
        estimatedReadTime = '不到 1 分钟';
    } else if (totalMinutes < 60) {
        estimatedReadTime = `${Math.ceil(totalMinutes)} 分钟`;
    } else {
        const hours = Math.floor(totalMinutes / 60);
        const mins = Math.round(totalMinutes % 60);
        estimatedReadTime = `${hours} 小时 ${mins} 分钟`;
    }

    return {
        charCount,
        wordCount,
        paragraphCount,
        sentenceCount,
        estimatedReadTime,
        averageSentenceLength,
    };
}

/**
 * Calculate typing speed based on recent activity
 */
export function calculateTypingSpeed(
    charsBefore: number,
    charsAfter: number,
    durationMs: number
): number {
    if (durationMs <= 0) return 0;

    const charsAdded = Math.max(0, charsAfter - charsBefore);
    const minutes = durationMs / 60000;

    return Math.round(charsAdded / minutes);
}

/**
 * Detect edit pattern based on content changes
 */
export function detectEditPattern(
    previousContent: string,
    currentContent: string
): 'adding_new' | 'deleting' | 'revising' | 'idle' {
    if (previousContent === currentContent) {
        return 'idle';
    }

    const prevLen = previousContent.length;
    const currLen = currentContent.length;

    // Significant addition
    if (currLen > prevLen + 10) {
        return 'adding_new';
    }

    // Significant deletion
    if (currLen < prevLen - 10) {
        return 'deleting';
    }

    // Small changes suggest revision
    return 'revising';
}
