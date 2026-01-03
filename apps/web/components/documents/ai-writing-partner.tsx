/**
 * AI Writing Partner - Floating Card Component
 * 
 * Minimalist, floating chat interface
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageCircle,
    X,
    Send,
    Loader2,
    Minus,
} from 'lucide-react';
import type { Message, WritingMetrics, WritingState, AgentMemory } from '@/lib/ai-writing-partner';

interface AIWritingPartnerProps {
    isVisible: boolean;
    onToggle: () => void;
    memory: AgentMemory | null;
    metrics: WritingMetrics | null;
    writingState: WritingState;
    messages: Message[];
    hasUnreadPrompt: boolean;
    isLoading: boolean;
    onSendMessage: (message: string) => Promise<void>;
    onDismissPrompt: () => void;
    // AI 开关控制
    isAIEnabled: boolean;
    onToggleAIEnabled: () => void;
}

export function AIWritingPartner({
    isVisible,
    onToggle,
    memory,
    metrics,
    writingState,
    messages,
    hasUnreadPrompt,
    isLoading,
    onSendMessage,
    onDismissPrompt,
    isAIEnabled,
    onToggleAIEnabled,
}: AIWritingPartnerProps) {
    const [inputValue, setInputValue] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isHoveringBubble, setIsHoveringBubble] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle send
    const handleSend = async () => {
        if (!inputValue.trim() || isSending) return;

        setIsSending(true);
        try {
            await onSendMessage(inputValue);
            setInputValue('');
        } finally {
            setIsSending(false);
        }
    };

    // Handle key press
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Get writing state emoji
    const getStateEmoji = () => {
        const states: Record<WritingState, string> = {
            flowing: '✨',
            thinking: '🤔',
            stuck: '💭',
            editing: '✏️',
            reviewing: '📖',
        };
        return states[writingState] || '✨';
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <AnimatePresence>
                {!isVisible && (
                    <div
                        className="fixed bottom-6 right-6 z-40"
                        onMouseEnter={() => setIsHoveringBubble(true)}
                        onMouseLeave={() => setIsHoveringBubble(false)}
                    >
                        {/* 悬浮时显示的开关按钮 */}
                        <AnimatePresence>
                            {isHoveringBubble && (
                                <motion.button
                                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                                    transition={{ duration: 0.15 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleAIEnabled();
                                    }}
                                    className={`absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-lg border transition-colors ${
                                        isAIEnabled
                                            ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                    }`}
                                >
                                    {isAIEnabled ? '关闭 AI' : '开启 AI'}
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {/* 主气泡按钮 */}
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            whileHover={{ scale: 1.05 }}
                            onClick={isAIEnabled ? onToggle : onToggleAIEnabled}
                            className={`p-3.5 rounded-full shadow-lg border backdrop-blur-sm transition-all duration-200 ${
                                isAIEnabled
                                    ? 'bg-amber-50/90 text-amber-600 border-amber-200/50 hover:bg-amber-100 hover:shadow-xl'
                                    : 'bg-gray-100/90 text-gray-400 border-gray-200/50 hover:bg-gray-200 hover:shadow-xl'
                            }`}
                        >
                            <MessageCircle className="w-5 h-5" />
                            {hasUnreadPrompt && isAIEnabled && (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse" />
                            )}
                        </motion.button>
                    </div>
                )}
            </AnimatePresence>

            {/* Floating Chat Card */}
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            height: isMinimized ? 'auto' : 420,
                        }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-6 right-6 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 z-50 flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <span className="text-sm">{getStateEmoji()}</span>
                                <span className="text-sm font-medium text-gray-700">写作助手</span>
                                {metrics && (
                                    <span className="text-xs text-gray-400 ml-1">
                                        {metrics.wordCount.toLocaleString()} 字
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setIsMinimized(!isMinimized)}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <Minus className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={onToggle}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content (hidden when minimized) */}
                        <AnimatePresence>
                            {!isMinimized && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex flex-col flex-1 min-h-0"
                                >
                                    {/* Messages */}
                                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                                        {messages.length === 0 ? (
                                            <div className="text-center text-gray-400 text-sm py-12">
                                                <p className="mb-1">你好！我会默默陪伴你写作</p>
                                                <p className="text-xs text-gray-300">有问题随时问我~</p>
                                            </div>
                                        ) : (
                                            messages.map((message) => (
                                                <div
                                                    key={message.id}
                                                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                                >
                                                    <div
                                                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${message.role === 'user'
                                                                ? 'bg-gray-900 text-white'
                                                                : 'bg-gray-100 text-gray-700'
                                                            }`}
                                                    >
                                                        {message.content}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input */}
                                    <div className="px-3 py-3 border-t border-gray-100">
                                        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5">
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={inputValue}
                                                onChange={(e) => setInputValue(e.target.value)}
                                                onKeyPress={handleKeyPress}
                                                placeholder="说点什么..."
                                                className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none py-1"
                                                disabled={isSending || isLoading}
                                            />
                                            <button
                                                onClick={handleSend}
                                                disabled={!inputValue.trim() || isSending || isLoading}
                                                className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {isSending || isLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Send className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

export default AIWritingPartner;
