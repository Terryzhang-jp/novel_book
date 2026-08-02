/**
 * AI Writing Partner - Main API Route
 * 
 * POST /api/writing-partner
 * 
 * Handles:
 * - Content update events
 * - Pause events
 * - User messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { StorageError } from '@/lib/storage/errors';
import type {
    WritingPartnerRequest,
    WritingPartnerResponse,
} from '@/lib/ai-writing-partner';
import {
    createAgentMemory,
    createWritingPartnerAgent,
    analyzeMetrics,
} from '@/lib/ai-writing-partner';
import { isAuthRequiredError } from "@/lib/auth/helpers";

export async function POST(request: NextRequest) {
    try {
        // Get user session using JWT auth
        const session = await requireAuth(request);

        // Parse request
        const body: WritingPartnerRequest = await request.json();
        const { documentId, event, memory: clientMemory } = body;

        if (!documentId || !event) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Create agent memory from client-provided memory or defaults
        const agentMemory = createAgentMemory(clientMemory);
        const agent = createWritingPartnerAgent(documentId, agentMemory);

        // Process the event
        let decision;
        if (event.type === 'user_message' && event.message) {
            decision = await agent.handleUserMessage(event.message);
        } else {
            decision = await agent.processEvent(event);
        }

        // Calculate metrics
        const metrics = event.content ? analyzeMetrics(event.content) : undefined;

        // Build response
        const response: WritingPartnerResponse = {
            memoryUpdate: decision.memoryUpdate ? {
                userIntent: decision.memoryUpdate.userIntent,
                contentUnderstanding: decision.memoryUpdate.contentUnderstanding,
                writingStyle: decision.memoryUpdate.writingStyle,
                conversationHistory: decision.memoryUpdate.conversation?.messages,
            } : undefined,
            message: decision.message,
            showPrompt: decision.showPrompt,
            metrics,
            writingState: agent.getMemory().session.currentWritingState,
        };

        return NextResponse.json(response);

    } catch (error) {
    // 未认证要返回 401 而不是 500 —— 否则客户端无法区分「请先登录」和
    // 「服务端炸了」，监控里也会把正常的未登录流量记成错误。
    // 见 lib/auth/helpers.ts 的 AuthRequiredError。
    if (isAuthRequiredError(error)) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

        if (error instanceof StorageError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        console.error('Writing partner API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

