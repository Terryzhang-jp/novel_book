/**
 * AI Writing Partner - Type Definitions
 * 
 * Core types for the agentic writing partner system including:
 * - Memory structures (short-term and long-term)
 * - Tool definitions
 * - Agent actions and decisions
 * - Message types
 */

// ============================================================================
// Memory Types
// ============================================================================

/**
 * User's inferred writing intent and goals
 */
export interface UserIntent {
    /** Inferred writing goal, e.g., "完成一篇关于东京旅行的回忆录" */
    goal: string | null;
    /** Confidence level (0-1) of the goal inference */
    goalConfidence: number;
    /** Whether the user has confirmed the goal */
    goalConfirmedByUser: boolean;
    /** Inferred genre: "旅行日记" | "小说" | "散文" | etc. */
    genre: string | null;
    /** Inferred themes: ["回忆", "成长", "爱情"] */
    themes: string[];
    /** Document outline if provided by user */
    outline: string | null;
    /** Target word count if set */
    targetWordCount: number | null;
    /** Deadline if set */
    deadline: Date | null;
}

/**
 * Character extracted from the document
 */
export interface Character {
    /** Character name */
    name: string;
    /** First mention position (character index) */
    firstMention: number;
    /** AI-inferred description */
    description: string;
    /** Relationships with other characters */
    relationships: string[];
}

/**
 * Scene extracted from the document
 */
export interface Scene {
    /** Scene name, e.g., "咖啡馆" */
    name: string;
    /** Location if identifiable, e.g., "东京涩谷" */
    location: string | null;
    /** Time of day if identifiable */
    timeOfDay: string | null;
    /** Mood/atmosphere, e.g., "温馨" */
    mood: string;
    /** Characters present in this scene */
    characters: string[];
}

/**
 * AI's understanding of the document content
 */
export interface ContentUnderstanding {
    /** AI-generated summary of the full document */
    documentSummary: string;
    /** List of identified characters */
    characters: Character[];
    /** List of identified scenes */
    scenes: Scene[];
    /** Current chapter/section if document has structure */
    currentChapter: string | null;
    /** Inferred narrative arc */
    narrativeArc: string | null;
}

/**
 * Detected writing style characteristics
 */
export interface WritingStyle {
    /** Tone: "温暖" | "幽默" | "严肃" | "neutral" */
    tone: string;
    /** Pacing: "紧凑" | "舒缓" | "moderate" */
    pacing: string;
    /** Vocabulary: "简洁" | "华丽" | "口语化" | "standard" */
    vocabulary: string;
    /** Sentence style: "短句为主" | "长句为主" | "mixed" */
    preferredSentenceLength: string;
}

/**
 * Current writing session state (not persisted)
 */
export interface SessionState {
    /** Session start time */
    startTime: Date;
    /** Last active time */
    lastActiveTime: Date;
    /** Words written this session */
    wordsWrittenThisSession: number;
    /** Current detected writing state */
    currentWritingState: WritingState;
    /** Number of pauses this session */
    pauseCount: number;
    /** Average typing speed (chars/minute) */
    averageSpeed: number;
}

export type WritingState = 'flowing' | 'thinking' | 'stuck' | 'editing' | 'reviewing';

/**
 * Conversation message
 */
export interface Message {
    /** Unique message ID */
    id: string;
    /** Message sender */
    role: 'user' | 'agent';
    /** Message content */
    content: string;
    /** Timestamp */
    timestamp: Date;
    /** Message type: chat (user-initiated), prompt (agent-initiated), confirmation */
    type: 'chat' | 'prompt' | 'confirmation';
}

/**
 * Conversation state
 */
export interface ConversationState {
    /** Recent messages (last 20) */
    messages: Message[];
    /** Last agent-initiated prompt */
    lastAgentPrompt: string | null;
    /** Whether waiting for user response to a question */
    userResponsePending: boolean;
}

/**
 * Recent content cache (not persisted)
 */
export interface RecentContent {
    /** Last 5 paragraphs */
    paragraphs: string[];
    /** Last edited section */
    lastEditedSection: string;
}

/**
 * Complete agent memory structure
 */
export interface AgentMemory {
    /** User's writing intent and goals */
    userIntent: UserIntent;
    /** AI's understanding of document content */
    contentUnderstanding: ContentUnderstanding;
    /** Detected writing style */
    writingStyle: WritingStyle;
    /** Current session state (ephemeral) */
    session: SessionState;
    /** Conversation state */
    conversation: ConversationState;
    /** Recent content cache (ephemeral) */
    recentContent: RecentContent;
}

/**
 * Persisted memory (stored in Supabase)
 */
export interface PersistedMemory {
    userIntent: UserIntent;
    contentUnderstanding: ContentUnderstanding;
    writingStyle: WritingStyle;
    conversationHistory: Message[];
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Writing metrics output
 */
export interface WritingMetrics {
    charCount: number;
    wordCount: number;
    paragraphCount: number;
    sentenceCount: number;
    estimatedReadTime: string;
    averageSentenceLength: number;
}

/**
 * User intent inference result
 */
export interface IntentInferenceResult {
    inferredGoal: string | null;
    goalConfidence: number;
    inferredGenre: string | null;
    inferredThemes: string[];
    shouldAskUser: boolean;
    suggestedQuestion: string | null;
}

/**
 * Narrative extraction result
 */
export interface NarrativeExtractionResult {
    newCharacters: Character[];
    updatedCharacters: Character[];
    currentScene: Scene | null;
    mood: string;
    narrativeProgression: string;
}

/**
 * Writing state detection result
 */
export interface WritingStateResult {
    state: WritingState;
    confidence: number;
    suggestedAction: AgentSuggestedAction;
}

export type AgentSuggestedAction = 'wait' | 'encourage' | 'offer_help' | 'ask_question';

/**
 * Style analysis result
 */
export interface StyleAnalysisResult {
    tone: string;
    pacing: string;
    vocabulary: string;
    sentenceStyle: string;
    distinctiveFeatures: string[];
}

/**
 * Summary generation result
 */
export interface SummaryResult {
    summary: string;
    keyPoints: string[];
    unfinishedThreads: string[];
}

// ============================================================================
// Agent Action Types
// ============================================================================

/**
 * Events from the editor that trigger agent analysis
 */
export interface EditorEvent {
    type: 'content_update' | 'pause' | 'user_message' | 'session_start' | 'session_end';
    /** Current document content */
    content?: string;
    /** User message if type is 'user_message' */
    message?: string;
    /** Pause duration in milliseconds */
    pauseDuration?: number;
    /** Recent edit pattern */
    editPattern?: 'adding_new' | 'deleting' | 'revising' | 'idle';
    /** Current typing speed (chars/minute) */
    typingSpeed?: number;
}

/**
 * Agent decision after processing an event
 */
export interface AgentDecision {
    /** Action type */
    action: 'observe' | 'use_tool' | 'respond' | 'ask_user';
    /** Tool to use if action is 'use_tool' */
    tool?: string;
    /** Tool input if action is 'use_tool' */
    toolInput?: Record<string, unknown>;
    /** Message to display if action is 'respond' or 'ask_user' */
    message?: string;
    /** Memory updates to apply */
    memoryUpdate?: Partial<AgentMemory>;
    /** Whether to show the message prominently */
    showPrompt?: boolean;
}

/**
 * API request to the writing partner endpoint
 */
export interface WritingPartnerRequest {
    documentId: string;
    event: EditorEvent;
    memory: PersistedMemory;
}

/**
 * API response from the writing partner endpoint
 */
export interface WritingPartnerResponse {
    /** Memory updates to apply */
    memoryUpdate?: Partial<PersistedMemory>;
    /** Message to display to user */
    message?: string;
    /** Whether to show the message prominently */
    showPrompt?: boolean;
    /** Current writing metrics */
    metrics?: WritingMetrics;
    /** Current writing state */
    writingState?: WritingState;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_USER_INTENT: UserIntent = {
    goal: null,
    goalConfidence: 0,
    goalConfirmedByUser: false,
    genre: null,
    themes: [],
    outline: null,
    targetWordCount: null,
    deadline: null,
};

export const DEFAULT_CONTENT_UNDERSTANDING: ContentUnderstanding = {
    documentSummary: '',
    characters: [],
    scenes: [],
    currentChapter: null,
    narrativeArc: null,
};

export const DEFAULT_WRITING_STYLE: WritingStyle = {
    tone: 'neutral',
    pacing: 'moderate',
    vocabulary: 'standard',
    preferredSentenceLength: 'mixed',
};

export const DEFAULT_PERSISTED_MEMORY: PersistedMemory = {
    userIntent: DEFAULT_USER_INTENT,
    contentUnderstanding: DEFAULT_CONTENT_UNDERSTANDING,
    writingStyle: DEFAULT_WRITING_STYLE,
    conversationHistory: [],
};

export const createDefaultSessionState = (): SessionState => ({
    startTime: new Date(),
    lastActiveTime: new Date(),
    wordsWrittenThisSession: 0,
    currentWritingState: 'flowing',
    pauseCount: 0,
    averageSpeed: 0,
});

export const DEFAULT_CONVERSATION_STATE: ConversationState = {
    messages: [],
    lastAgentPrompt: null,
    userResponsePending: false,
};

export const DEFAULT_RECENT_CONTENT: RecentContent = {
    paragraphs: [],
    lastEditedSection: '',
};
