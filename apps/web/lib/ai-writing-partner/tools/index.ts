/**
 * AI Writing Partner - Tools Index
 * 
 * Export all tools from a single entry point
 */

// Local tools (no LLM required)
export {
    analyzeMetrics,
    calculateTypingSpeed,
    detectEditPattern,
} from './analyze-metrics';

export {
    detectWritingState,
    shouldEncourage,
    generateEncouragement,
} from './detect-writing-state';

// LLM-powered tools
export {
    inferUserIntent,
    extractNarrativeElements,
    analyzeWritingStyle,
    generateSummary,
} from './llm-tools';
