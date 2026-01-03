/**
 * AI Writing Partner - Memory Management
 * 
 * Handles:
 * - Creating and initializing memory
 * - Updating memory (short-term and long-term)
 * - Syncing with Supabase for persistence
 */

import { supabase } from '@/lib/supabase/client';
import type {
    AgentMemory,
    PersistedMemory,
    Message,
    UserIntent,
    ContentUnderstanding,
    WritingStyle,
    Character,
    Scene,
} from './types';
import {
    DEFAULT_PERSISTED_MEMORY,
    DEFAULT_CONVERSATION_STATE,
    DEFAULT_RECENT_CONTENT,
    createDefaultSessionState,
} from './types';

// ============================================================================
// Memory Initialization
// ============================================================================

/**
 * Create a fresh agent memory with default values
 */
export function createAgentMemory(persisted?: Partial<PersistedMemory>): AgentMemory {
    const persistedMemory = {
        ...DEFAULT_PERSISTED_MEMORY,
        ...persisted,
    };

    return {
        userIntent: persistedMemory.userIntent,
        contentUnderstanding: persistedMemory.contentUnderstanding,
        writingStyle: persistedMemory.writingStyle,
        session: createDefaultSessionState(),
        conversation: {
            ...DEFAULT_CONVERSATION_STATE,
            messages: persistedMemory.conversationHistory.slice(-20), // Keep last 20
        },
        recentContent: DEFAULT_RECENT_CONTENT,
    };
}

/**
 * Extract persisted memory from full agent memory
 */
export function extractPersistedMemory(memory: AgentMemory): PersistedMemory {
    return {
        userIntent: memory.userIntent,
        contentUnderstanding: memory.contentUnderstanding,
        writingStyle: memory.writingStyle,
        conversationHistory: memory.conversation.messages,
    };
}

// ============================================================================
// Memory Updates
// ============================================================================

/**
 * Apply partial updates to agent memory
 */
export function updateMemory(
    current: AgentMemory,
    updates: Partial<AgentMemory>
): AgentMemory {
    return {
        ...current,
        ...updates,
        // Deep merge for nested objects
        userIntent: updates.userIntent
            ? { ...current.userIntent, ...updates.userIntent }
            : current.userIntent,
        contentUnderstanding: updates.contentUnderstanding
            ? { ...current.contentUnderstanding, ...updates.contentUnderstanding }
            : current.contentUnderstanding,
        writingStyle: updates.writingStyle
            ? { ...current.writingStyle, ...updates.writingStyle }
            : current.writingStyle,
        session: updates.session
            ? { ...current.session, ...updates.session }
            : current.session,
        conversation: updates.conversation
            ? { ...current.conversation, ...updates.conversation }
            : current.conversation,
        recentContent: updates.recentContent
            ? { ...current.recentContent, ...updates.recentContent }
            : current.recentContent,
    };
}

/**
 * Add a message to conversation history
 */
export function addMessage(memory: AgentMemory, message: Omit<Message, 'id' | 'timestamp'>): AgentMemory {
    const newMessage: Message = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: new Date(),
    };

    const updatedMessages = [...memory.conversation.messages, newMessage].slice(-20); // Keep last 20

    return updateMemory(memory, {
        conversation: {
            ...memory.conversation,
            messages: updatedMessages,
            lastAgentPrompt: message.role === 'agent' ? message.content : memory.conversation.lastAgentPrompt,
            userResponsePending: message.type === 'confirmation' || message.type === 'prompt',
        },
    });
}

/**
 * Update recent paragraphs from document content
 */
export function updateRecentParagraphs(memory: AgentMemory, content: string): AgentMemory {
    // Split content into paragraphs and get last 5
    const paragraphs = content
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .slice(-5);

    return updateMemory(memory, {
        recentContent: {
            ...memory.recentContent,
            paragraphs,
        },
    });
}

/**
 * Add or update a character in content understanding
 */
export function upsertCharacter(memory: AgentMemory, character: Character): AgentMemory {
    const existingIndex = memory.contentUnderstanding.characters.findIndex(
        c => c.name === character.name
    );

    let updatedCharacters: Character[];
    if (existingIndex >= 0) {
        updatedCharacters = [...memory.contentUnderstanding.characters];
        updatedCharacters[existingIndex] = {
            ...updatedCharacters[existingIndex],
            ...character,
        };
    } else {
        updatedCharacters = [...memory.contentUnderstanding.characters, character];
    }

    return updateMemory(memory, {
        contentUnderstanding: {
            ...memory.contentUnderstanding,
            characters: updatedCharacters,
        },
    });
}

/**
 * Update current scene
 */
export function updateCurrentScene(memory: AgentMemory, scene: Scene): AgentMemory {
    // Add to scenes list if not already present
    const existingSceneIndex = memory.contentUnderstanding.scenes.findIndex(
        s => s.name === scene.name
    );

    let updatedScenes: Scene[];
    if (existingSceneIndex >= 0) {
        updatedScenes = [...memory.contentUnderstanding.scenes];
        updatedScenes[existingSceneIndex] = scene;
    } else {
        updatedScenes = [...memory.contentUnderstanding.scenes, scene];
    }

    return updateMemory(memory, {
        contentUnderstanding: {
            ...memory.contentUnderstanding,
            scenes: updatedScenes,
        },
    });
}

/**
 * Update session statistics
 */
export function updateSessionStats(
    memory: AgentMemory,
    stats: {
        wordsWritten?: number;
        typingSpeed?: number;
        isPaused?: boolean;
    }
): AgentMemory {
    const now = new Date();

    return updateMemory(memory, {
        session: {
            ...memory.session,
            lastActiveTime: now,
            wordsWrittenThisSession: stats.wordsWritten ?? memory.session.wordsWrittenThisSession,
            averageSpeed: stats.typingSpeed ?? memory.session.averageSpeed,
            pauseCount: stats.isPaused
                ? memory.session.pauseCount + 1
                : memory.session.pauseCount,
        },
    });
}

/**
 * Update user intent with confirmation
 */
export function confirmUserIntent(
    memory: AgentMemory,
    updates: Partial<UserIntent>
): AgentMemory {
    return updateMemory(memory, {
        userIntent: {
            ...memory.userIntent,
            ...updates,
            goalConfirmedByUser: true,
        },
        conversation: {
            ...memory.conversation,
            userResponsePending: false,
        },
    });
}

// ============================================================================
// Supabase Persistence
// ============================================================================

/**
 * Load persisted memory from Supabase
 */
export async function loadMemoryFromSupabase(documentId: string): Promise<PersistedMemory | null> {
    const { data, error } = await supabase
        .from('documents')
        .select('ai_partner_memory')
        .eq('id', documentId)
        .single();

    if (error || !data?.ai_partner_memory) {
        console.log('No existing memory found for document:', documentId);
        return null;
    }

    // Parse dates from JSON
    const memory = data.ai_partner_memory as PersistedMemory;
    if (memory.conversationHistory) {
        memory.conversationHistory = memory.conversationHistory.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
        }));
    }

    return memory;
}

/**
 * Save persisted memory to Supabase
 */
export async function saveMemoryToSupabase(
    documentId: string,
    memory: PersistedMemory
): Promise<boolean> {
    const { error } = await supabase
        .from('documents')
        .update({ ai_partner_memory: memory })
        .eq('id', documentId);

    if (error) {
        console.error('Failed to save memory:', error);
        return false;
    }

    return true;
}

/**
 * Debounced save - to avoid too frequent database writes
 */
let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 5000; // 5 seconds

export function debouncedSaveMemory(
    documentId: string,
    memory: PersistedMemory,
    immediate = false
): void {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    if (immediate) {
        saveMemoryToSupabase(documentId, memory);
        return;
    }

    saveTimeout = setTimeout(() => {
        saveMemoryToSupabase(documentId, memory);
        saveTimeout = null;
    }, SAVE_DEBOUNCE_MS);
}

// ============================================================================
// Memory Serialization Helpers
// ============================================================================

/**
 * Convert memory to a concise string for LLM context
 */
export function memoryToContext(memory: AgentMemory): string {
    const parts: string[] = [];

    // User Intent
    if (memory.userIntent.goal) {
        parts.push(`## 用户写作目标\n${memory.userIntent.goal}`);
        if (!memory.userIntent.goalConfirmedByUser) {
            parts.push(`(置信度: ${(memory.userIntent.goalConfidence * 100).toFixed(0)}%, 未确认)`);
        }
    }
    if (memory.userIntent.genre) {
        parts.push(`类型: ${memory.userIntent.genre}`);
    }
    if (memory.userIntent.themes.length > 0) {
        parts.push(`主题: ${memory.userIntent.themes.join(', ')}`);
    }

    // Content Understanding
    if (memory.contentUnderstanding.documentSummary) {
        parts.push(`\n## 文档摘要\n${memory.contentUnderstanding.documentSummary}`);
    }
    if (memory.contentUnderstanding.characters.length > 0) {
        const chars = memory.contentUnderstanding.characters
            .map(c => `- ${c.name}: ${c.description}`)
            .join('\n');
        parts.push(`\n## 人物\n${chars}`);
    }
    if (memory.contentUnderstanding.scenes.length > 0) {
        const lastScene = memory.contentUnderstanding.scenes[memory.contentUnderstanding.scenes.length - 1];
        parts.push(`\n## 当前场景\n${lastScene.name} (${lastScene.mood})`);
    }

    // Session Stats
    parts.push(`\n## 本次写作\n- 已写 ${memory.session.wordsWrittenThisSession} 字`);
    parts.push(`- 速度 ${memory.session.averageSpeed.toFixed(0)} 字/分`);
    parts.push(`- 状态: ${memory.session.currentWritingState}`);

    // Recent Content
    if (memory.recentContent.paragraphs.length > 0) {
        const recentText = memory.recentContent.paragraphs.slice(-2).join('\n\n');
        parts.push(`\n## 最近写的内容\n${recentText.slice(0, 500)}${recentText.length > 500 ? '...' : ''}`);
    }

    return parts.join('\n');
}
