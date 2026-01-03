/**
 * AI Writing Partner - Agent Core
 * 
 * The main agent class that orchestrates:
 * - Observing editor events
 * - Making decisions using tools
 * - Generating responses
 */

import type {
    AgentMemory,
    AgentDecision,
    EditorEvent,
    WritingState,
    PersistedMemory,
} from './types';
import {
    updateMemory,
    addMessage,
    updateRecentParagraphs,
    updateSessionStats,
    upsertCharacter,
    updateCurrentScene,
    confirmUserIntent,
    memoryToContext,
} from './memory';
import {
    analyzeMetrics,
    calculateTypingSpeed,
    detectEditPattern,
    detectWritingState,
    shouldEncourage,
    generateEncouragement,
    inferUserIntent,
    extractNarrativeElements,
} from './tools';
import { callGemini } from './llm';

// ============================================================================
// Agent Configuration
// ============================================================================

const CONFIG = {
    // Minimum content before asking about intent
    MIN_PARAGRAPHS_FOR_INTENT: 3,
    // Confidence threshold for asking user
    INTENT_CONFIDENCE_THRESHOLD: 0.6,
    // Analysis intervals
    METRICS_UPDATE_INTERVAL_MS: 5000,    // 5 seconds
    NARRATIVE_ANALYSIS_INTERVAL_MS: 60000, // 1 minute
    SUMMARY_UPDATE_INTERVAL_MS: 300000,   // 5 minutes
    // Pause thresholds
    THINKING_PAUSE_MS: 3000,
    STUCK_PAUSE_MS: 10000,
};

// ============================================================================
// Agent Class
// ============================================================================

export class WritingPartnerAgent {
    private memory: AgentMemory;
    private documentId: string;
    private lastMetricsUpdate: number = 0;
    private lastNarrativeAnalysis: number = 0;
    private previousContent: string = '';
    private previousWordCount: number = 0;

    constructor(documentId: string, initialMemory: AgentMemory) {
        this.documentId = documentId;
        this.memory = initialMemory;
    }

    /**
     * Get current memory state
     */
    getMemory(): AgentMemory {
        return this.memory;
    }

    /**
     * Get persisted memory for saving
     */
    getPersistedMemory(): PersistedMemory {
        return {
            userIntent: this.memory.userIntent,
            contentUnderstanding: this.memory.contentUnderstanding,
            writingStyle: this.memory.writingStyle,
            conversationHistory: this.memory.conversation.messages,
        };
    }

    /**
     * Main entry point: process an editor event and return decision
     */
    async processEvent(event: EditorEvent): Promise<AgentDecision> {
        const now = Date.now();

        // Step 1: Update memory based on event type
        this.observe(event);

        // Step 2: Decide what action to take
        const decision = await this.decide(event, now);

        // Step 3: Apply any memory updates from the decision
        if (decision.memoryUpdate) {
            this.memory = updateMemory(this.memory, decision.memoryUpdate);
        }

        return decision;
    }

    /**
     * Handle user chat message
     */
    async handleUserMessage(message: string): Promise<AgentDecision> {
        // Add user message to conversation
        this.memory = addMessage(this.memory, {
            role: 'user',
            content: message,
            type: 'chat',
        });

        // Check if this is a response to an intent question
        if (this.memory.conversation.userResponsePending) {
            return this.handleIntentConfirmation(message);
        }

        // Otherwise, generate a contextual response
        return this.generateChatResponse(message);
    }

    // ============================================================================
    // Private Methods
    // ============================================================================

    /**
     * Observe: Update memory based on editor event
     */
    private observe(event: EditorEvent): void {
        if (!event.content) return;

        // Update recent paragraphs
        this.memory = updateRecentParagraphs(this.memory, event.content);

        // Calculate metrics
        const metrics = analyzeMetrics(event.content);

        // Calculate typing speed
        const typingSpeed = event.typingSpeed ?? calculateTypingSpeed(
            this.previousWordCount,
            metrics.wordCount,
            5000 // Approximate interval
        );

        // Detect edit pattern
        const editPattern = detectEditPattern(this.previousContent, event.content);

        // Update session stats
        this.memory = updateSessionStats(this.memory, {
            wordsWritten: metrics.wordCount,
            typingSpeed,
            isPaused: event.type === 'pause',
        });

        // Store for next comparison
        this.previousContent = event.content;
        this.previousWordCount = metrics.wordCount;
    }

    /**
     * Decide: Determine what action to take
     */
    private async decide(event: EditorEvent, now: number): Promise<AgentDecision> {
        // Priority 1: Check if we need to understand user intent
        if (await this.shouldAskAboutIntent()) {
            return this.createIntentQuestion();
        }

        // Priority 2: Detect writing state and respond accordingly
        const stateResult = detectWritingState({
            pauseDuration: event.pauseDuration ?? 0,
            recentEditPattern: event.editPattern ?? 'idle',
            recentTypingSpeed: event.typingSpeed,
            averageSpeed: this.memory.session.averageSpeed,
        });

        // Update writing state in memory
        this.memory = updateMemory(this.memory, {
            session: {
                ...this.memory.session,
                currentWritingState: stateResult.state,
            },
        });

        // Priority 3: Check for milestones
        if (shouldEncourage([], this.memory.session.wordsWrittenThisSession)) {
            const encouragement = generateEncouragement(
                this.memory.session.wordsWrittenThisSession,
                stateResult.state
            );
            return this.createPromptResponse(encouragement);
        }

        // Priority 4: Offer help if stuck
        if (stateResult.suggestedAction === 'offer_help') {
            return this.createHelpOffer(stateResult.state);
        }

        // Priority 5: Run background analysis if needed
        if (now - this.lastNarrativeAnalysis > CONFIG.NARRATIVE_ANALYSIS_INTERVAL_MS) {
            this.lastNarrativeAnalysis = now;
            this.runBackgroundAnalysis();
        }

        // Default: Just observe
        return {
            action: 'observe',
            memoryUpdate: {
                session: this.memory.session,
            },
        };
    }

    /**
     * Check if we should ask about user intent
     */
    private async shouldAskAboutIntent(): Promise<boolean> {
        // Already confirmed
        if (this.memory.userIntent.goalConfirmedByUser) {
            return false;
        }

        // Already waiting for response
        if (this.memory.conversation.userResponsePending) {
            return false;
        }

        // Not enough content yet
        if (this.memory.recentContent.paragraphs.length < CONFIG.MIN_PARAGRAPHS_FOR_INTENT) {
            return false;
        }

        // If we haven't inferred yet or confidence is low
        if (this.memory.userIntent.goalConfidence < CONFIG.INTENT_CONFIDENCE_THRESHOLD) {
            // Try to infer
            const result = await inferUserIntent({
                documentContent: this.memory.recentContent.paragraphs.join('\n\n'),
                existingIntent: this.memory.userIntent,
            });

            // Update memory with inference
            this.memory = updateMemory(this.memory, {
                userIntent: {
                    ...this.memory.userIntent,
                    goal: result.inferredGoal,
                    goalConfidence: result.goalConfidence,
                    genre: result.inferredGenre,
                    themes: result.inferredThemes,
                },
            });

            return result.shouldAskUser;
        }

        return false;
    }

    /**
     * Create a question about user intent
     */
    private createIntentQuestion(): AgentDecision {
        const question = this.memory.userIntent.goal
            ? `我注意到你在写关于"${this.memory.userIntent.goal}"的内容，对吗？或者你想告诉我更多关于这篇文章的目标？`
            : `你好！为了更好地陪伴你写作，能告诉我这篇文章的主题或目标吗？比如是旅行日记、小说创作、还是其他什么？`;

        this.memory = addMessage(this.memory, {
            role: 'agent',
            content: question,
            type: 'confirmation',
        });

        this.memory = updateMemory(this.memory, {
            conversation: {
                ...this.memory.conversation,
                userResponsePending: true,
                lastAgentPrompt: question,
            },
        });

        return {
            action: 'ask_user',
            message: question,
            showPrompt: true,
            memoryUpdate: {
                conversation: this.memory.conversation,
            },
        };
    }

    /**
     * Handle user's response to intent question
     */
    private handleIntentConfirmation(message: string): AgentDecision {
        // Simple confirmation detection
        const isConfirmation = /^(是的?|对|没错|正确|嗯|yes|yeah|yep|right)/i.test(message.trim());

        if (isConfirmation && this.memory.userIntent.goal) {
            // User confirmed our inference
            this.memory = confirmUserIntent(this.memory, {
                goalConfirmedByUser: true,
            });

            const response = `太好了！我会在你写作过程中陪伴你。如果需要帮助，随时告诉我！`;

            this.memory = addMessage(this.memory, {
                role: 'agent',
                content: response,
                type: 'chat',
            });

            return {
                action: 'respond',
                message: response,
                showPrompt: false,
                memoryUpdate: {
                    userIntent: this.memory.userIntent,
                    conversation: this.memory.conversation,
                },
            };
        } else {
            // User provided new information
            this.memory = confirmUserIntent(this.memory, {
                goal: message,
                goalConfidence: 1.0,
                goalConfirmedByUser: true,
            });

            const response = `明白了！我会记住这个目标，在你写作过程中为你提供帮助。`;

            this.memory = addMessage(this.memory, {
                role: 'agent',
                content: response,
                type: 'chat',
            });

            return {
                action: 'respond',
                message: response,
                showPrompt: false,
                memoryUpdate: {
                    userIntent: this.memory.userIntent,
                    conversation: this.memory.conversation,
                },
            };
        }
    }

    /**
     * Create a prompt response (for milestones, etc.)
     */
    private createPromptResponse(message: string): AgentDecision {
        this.memory = addMessage(this.memory, {
            role: 'agent',
            content: message,
            type: 'prompt',
        });

        return {
            action: 'respond',
            message,
            showPrompt: true,
            memoryUpdate: {
                conversation: this.memory.conversation,
            },
        };
    }

    /**
     * Create a help offer when user seems stuck
     */
    private createHelpOffer(state: WritingState): AgentDecision {
        const messages = [
            '看起来你在思考中...需要我帮忙吗？',
            '写作有时候需要停下来整理思路，这很正常。如果卡住了，可以告诉我。',
            '我注意到你停顿了一会儿。需要聊聊当前的场景吗？',
        ];

        const message = messages[Math.floor(Math.random() * messages.length)];

        this.memory = addMessage(this.memory, {
            role: 'agent',
            content: message,
            type: 'prompt',
        });

        return {
            action: 'respond',
            message,
            showPrompt: true,
            memoryUpdate: {
                conversation: this.memory.conversation,
            },
        };
    }

    /**
     * Generate a chat response (for user-initiated conversation)
     */
    private async generateChatResponse(message: string): Promise<AgentDecision> {
        // Build context for LLM
        const context = memoryToContext(this.memory);

        // Get recent conversation for context
        const recentMessages = this.memory.conversation.messages.slice(-6);
        const conversationHistory = recentMessages.map(m =>
            `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`
        ).join('\n');

        // Call LLM for response
        try {
            const prompt = `你是一位友好、专业的写作伙伴。你的角色是陪伴用户写作，提供鼓励和帮助。

## 当前写作上下文
${context}

## 最近对话
${conversationHistory}

## 用户刚才说
${message}

## 请回复用户
根据上下文和用户的消息，给出一个自然、友好的回复。
- 如果用户在闲聊，就轻松地聊天
- 如果用户问写作相关的问题，给出有帮助的建议
- 保持简洁（1-3句话）
- 使用友好的语气

只返回你的回复，不要其他内容。`;

            const aiResponse = await callGemini(prompt, { temperature: 0.7, maxTokens: 200 });

            if (aiResponse) {
                this.memory = addMessage(this.memory, {
                    role: 'agent',
                    content: aiResponse,
                    type: 'chat',
                });

                return {
                    action: 'respond',
                    message: aiResponse,
                    showPrompt: false,
                    memoryUpdate: {
                        conversation: this.memory.conversation,
                    },
                };
            }
        } catch (error) {
            console.error('LLM call failed:', error);
        }

        // Fallback response if LLM fails
        const fallbackResponse = '你好！我在这里陪你写作。有什么问题可以问我~';

        this.memory = addMessage(this.memory, {
            role: 'agent',
            content: fallbackResponse,
            type: 'chat',
        });

        return {
            action: 'respond',
            message: fallbackResponse,
            showPrompt: false,
            memoryUpdate: {
                conversation: this.memory.conversation,
            },
        };
    }

    /**
     * Run background analysis (non-blocking)
     */
    private async runBackgroundAnalysis(): Promise<void> {
        try {
            // Extract narrative elements
            const narrativeResult = await extractNarrativeElements({
                recentParagraphs: this.memory.recentContent.paragraphs,
                existingCharacters: this.memory.contentUnderstanding.characters,
                existingScenes: this.memory.contentUnderstanding.scenes,
            });

            // Update characters
            for (const char of narrativeResult.newCharacters) {
                this.memory = upsertCharacter(this.memory, char);
            }
            for (const char of narrativeResult.updatedCharacters) {
                this.memory = upsertCharacter(this.memory, {
                    ...char,
                    firstMention: this.memory.contentUnderstanding.characters.find(c => c.name === char.name)?.firstMention ?? 0,
                });
            }

            // Update current scene
            if (narrativeResult.currentScene) {
                this.memory = updateCurrentScene(this.memory, narrativeResult.currentScene);
            }
        } catch (error) {
            console.error('Background analysis failed:', error);
        }
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new agent instance
 */
export function createWritingPartnerAgent(
    documentId: string,
    initialMemory: AgentMemory
): WritingPartnerAgent {
    return new WritingPartnerAgent(documentId, initialMemory);
}
