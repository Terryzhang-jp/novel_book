/**
 * AI Writing Partner - React Hook
 * 
 * Manages:
 * - Agent state and memory
 * - Communication with backend API
 * - Event handling from editor
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
    AgentMemory,
    EditorEvent,
    WritingPartnerResponse,
    WritingMetrics,
    WritingState,
    Message,
} from '@/lib/ai-writing-partner';
import {
    createAgentMemory,
} from '@/lib/ai-writing-partner';

interface UseWritingPartnerOptions {
    documentId: string;
    enabled?: boolean;
    onMessage?: (message: string, type: 'prompt' | 'chat') => void;
}

interface UseWritingPartnerReturn {
    // State
    isEnabled: boolean;
    isLoading: boolean;
    memory: AgentMemory | null;
    metrics: WritingMetrics | null;
    writingState: WritingState;
    messages: Message[];
    hasUnreadPrompt: boolean;

    // Actions
    sendMessage: (message: string) => Promise<void>;
    onContentUpdate: (content: string) => void;
    onPause: (duration: number) => void;
    dismissPrompt: () => void;
    toggleEnabled: () => void;
}

export function useWritingPartner({
    documentId,
    enabled = true,
    onMessage,
}: UseWritingPartnerOptions): UseWritingPartnerReturn {
    // State
    const [isEnabled, setIsEnabled] = useState(enabled);
    const [isLoading, setIsLoading] = useState(false);
    const [memory, setMemory] = useState<AgentMemory | null>(null);
    const [metrics, setMetrics] = useState<WritingMetrics | null>(null);
    const [writingState, setWritingState] = useState<WritingState>('flowing');
    const [hasUnreadPrompt, setHasUnreadPrompt] = useState(false);

    // Refs for debouncing
    const lastContentRef = useRef<string>('');
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastUpdateTimeRef = useRef<number>(0);

    // Initialize memory
    useEffect(() => {
        if (!isEnabled) return;

        const initMemory = async () => {
            try {
                const response = await fetch('/api/writing-partner', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        documentId,
                        event: { type: 'session_start' },
                    }),
                });

                if (response.ok) {
                    const data: WritingPartnerResponse = await response.json();
                    const initialMemory = createAgentMemory(data.memoryUpdate ?? undefined);
                    setMemory(initialMemory);
                    if (data.metrics) setMetrics(data.metrics);
                } else {
                    // Initialize with defaults
                    setMemory(createAgentMemory());
                }
            } catch (error) {
                console.error('Failed to initialize writing partner:', error);
                setMemory(createAgentMemory());
            }
        };

        initMemory();
    }, [documentId, isEnabled]);

    // Call API
    const callAPI = useCallback(async (event: EditorEvent): Promise<void> => {
        if (!isEnabled || !memory) return;

        setIsLoading(true);
        try {
            const response = await fetch('/api/writing-partner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId,
                    event,
                    memory: {
                        userIntent: memory.userIntent,
                        contentUnderstanding: memory.contentUnderstanding,
                        writingStyle: memory.writingStyle,
                        conversationHistory: memory.conversation.messages,
                    },
                }),
            });

            if (!response.ok) return;

            const data: WritingPartnerResponse = await response.json();

            // Update state
            if (data.metrics) setMetrics(data.metrics);
            if (data.writingState) setWritingState(data.writingState);

            // Update memory
            if (data.memoryUpdate) {
                setMemory(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        ...data.memoryUpdate,
                        session: prev.session,
                        recentContent: prev.recentContent,
                        conversation: data.memoryUpdate?.conversationHistory
                            ? {
                                ...prev.conversation,
                                messages: data.memoryUpdate.conversationHistory,
                            }
                            : prev.conversation,
                    };
                });
            }

            // Handle message
            if (data.message) {
                onMessage?.(data.message, data.showPrompt ? 'prompt' : 'chat');
                if (data.showPrompt) {
                    setHasUnreadPrompt(true);
                }
            }
        } catch (error) {
            console.error('Writing partner API call failed:', error);
        } finally {
            setIsLoading(false);
        }
    }, [documentId, isEnabled, memory, onMessage]);

    // Content update handler (debounced)
    const onContentUpdate = useCallback((content: string) => {
        if (!isEnabled) return;

        // Skip if content hasn't changed
        if (content === lastContentRef.current) return;
        lastContentRef.current = content;

        // Clear existing timeout
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }

        // Debounce: wait 2 seconds of no typing
        updateTimeoutRef.current = setTimeout(() => {
            const now = Date.now();
            const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
            lastUpdateTimeRef.current = now;

            callAPI({
                type: 'content_update',
                content,
                editPattern: 'adding_new',
                typingSpeed: 0, // Will be calculated by agent
            });
        }, 2000);
    }, [isEnabled, callAPI]);

    // Pause handler
    const onPause = useCallback((duration: number) => {
        if (!isEnabled || duration < 3000) return; // Only trigger for pauses > 3s

        callAPI({
            type: 'pause',
            content: lastContentRef.current,
            pauseDuration: duration,
            editPattern: 'idle',
        });
    }, [isEnabled, callAPI]);

    // Send chat message
    const sendMessage = useCallback(async (message: string) => {
        if (!isEnabled || !message.trim()) return;

        // Optimistically add user message
        setMemory(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                conversation: {
                    ...prev.conversation,
                    messages: [
                        ...prev.conversation.messages,
                        {
                            id: crypto.randomUUID(),
                            role: 'user' as const,
                            content: message,
                            timestamp: new Date(),
                            type: 'chat' as const,
                        },
                    ],
                },
            };
        });

        await callAPI({
            type: 'user_message',
            message,
        });
    }, [isEnabled, callAPI]);

    // Dismiss prompt
    const dismissPrompt = useCallback(() => {
        setHasUnreadPrompt(false);
    }, []);

    // Toggle enabled
    const toggleEnabled = useCallback(() => {
        setIsEnabled(prev => !prev);
    }, []);

    // Get messages from memory
    const messages = memory?.conversation.messages ?? [];

    return {
        isEnabled,
        isLoading,
        memory,
        metrics,
        writingState,
        messages,
        hasUnreadPrompt,
        sendMessage,
        onContentUpdate,
        onPause,
        dismissPrompt,
        toggleEnabled,
    };
}
