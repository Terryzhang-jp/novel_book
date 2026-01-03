/**
 * Document Editor with AI Writing Partner
 * 
 * A wrapper component that integrates the AI Writing Partner
 * with the existing document editor
 */

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { type JSONContent, type EditorInstance } from 'novel';
import DocumentEditor from './document-editor';
import { AIWritingPartner } from './documents/ai-writing-partner';
import { useWritingPartner } from '@/hooks/use-writing-partner';

interface DocumentEditorWithAIProps {
    documentId: string;
    initialContent: JSONContent;
    onSave: (content: JSONContent) => Promise<void>;
    onEditorReady?: (editor: EditorInstance) => void;
    onTyping?: (isTyping: boolean) => void;
    zenMode?: boolean;
    aiPartnerEnabled?: boolean;
}

export function DocumentEditorWithAI({
    documentId,
    initialContent,
    onSave,
    onEditorReady,
    onTyping,
    zenMode = true,
    aiPartnerEnabled = true,
}: DocumentEditorWithAIProps) {
    const [showAIPartner, setShowAIPartner] = useState(false); // 卡片是否展开
    const [aiEnabled, setAiEnabled] = useState(false); // AI 功能是否启用（默认关闭）
    const lastContentRef = useRef<string>('');
    const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef<number>(Date.now());

    // AI Writing Partner hook
    const {
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
    } = useWritingPartner({
        documentId,
        enabled: aiEnabled && aiPartnerEnabled, // 只有两个都为 true 时才启用
    });

    // Convert JSONContent to plain text
    const jsonContentToText = useCallback((content: JSONContent): string => {
        const extractText = (node: JSONContent): string => {
            if (node.text) return node.text;
            if (node.content && Array.isArray(node.content)) {
                return node.content.map(extractText).join('\n');
            }
            return '';
        };
        return extractText(content);
    }, []);

    // Handle save with AI partner integration
    const handleSave = useCallback(async (content: JSONContent) => {
        // Call original save
        await onSave(content);

        // Notify AI partner of content update
        const textContent = jsonContentToText(content);
        if (textContent !== lastContentRef.current) {
            lastContentRef.current = textContent;
            onContentUpdate(textContent);

            // Reset pause timer
            lastActivityRef.current = Date.now();
            if (pauseTimerRef.current) {
                clearTimeout(pauseTimerRef.current);
            }

            // Start new pause detection
            pauseTimerRef.current = setTimeout(() => {
                const pauseDuration = Date.now() - lastActivityRef.current;
                if (pauseDuration >= 3000) {
                    onPause(pauseDuration);
                }
            }, 5000);
        }
    }, [onSave, jsonContentToText, onContentUpdate, onPause]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (pauseTimerRef.current) {
                clearTimeout(pauseTimerRef.current);
            }
        };
    }, []);

    // Toggle AI partner card visibility
    const handleToggleAI = useCallback(() => {
        setShowAIPartner(prev => !prev);
    }, []);

    // Toggle AI enabled state
    const handleToggleAIEnabled = useCallback(() => {
        setAiEnabled(prev => !prev);
    }, []);

    return (
        <div className="relative flex">
            {/* Main Editor Area */}
            <div className={`flex-1 transition-all duration-300 ${showAIPartner ? 'pr-0' : ''}`}>
                <DocumentEditor
                    documentId={documentId}
                    initialContent={initialContent}
                    onSave={handleSave}
                    onEditorReady={onEditorReady}
                    onTyping={onTyping}
                    zenMode={zenMode}
                />
            </div>

            {/* AI Writing Partner Sidebar */}
            {aiPartnerEnabled && (
                <AIWritingPartner
                    isVisible={showAIPartner}
                    onToggle={handleToggleAI}
                    memory={memory}
                    metrics={metrics}
                    writingState={writingState}
                    messages={messages}
                    hasUnreadPrompt={hasUnreadPrompt}
                    isLoading={isLoading}
                    onSendMessage={sendMessage}
                    onDismissPrompt={dismissPrompt}
                    isAIEnabled={aiEnabled}
                    onToggleAIEnabled={handleToggleAIEnabled}
                />
            )}
        </div>
    );
}

export default DocumentEditorWithAI;

