/**
 * AI Writing Partner - Module Index
 */

// Types
export * from './types';

// Memory Management
export {
    createAgentMemory,
    extractPersistedMemory,
    updateMemory,
    addMessage,
    updateRecentParagraphs,
    updateSessionStats,
    upsertCharacter,
    updateCurrentScene,
    confirmUserIntent,
    loadMemoryFromSupabase,
    saveMemoryToSupabase,
    debouncedSaveMemory,
    memoryToContext,
} from './memory';

// Tools
export * from './tools';

// Agent
export { WritingPartnerAgent, createWritingPartnerAgent } from './agent';
