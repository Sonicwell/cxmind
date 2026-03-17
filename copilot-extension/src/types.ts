// ── Agent & Call 核心类型 ──

// 坐席在通话/聊天过程中执行的操作记录
export interface AgentAction {
    timestamp: string
    type: 'crm_lookup' | 'refund' | 'transfer' | 'note' | 'voucher' | 'accept' | 'resolve' | 'tag' | 'hold'
    label: string
    detail?: string
}

export interface CallOutcome {
    call_id: string;
    client_id?: string;
    agent_id?: string;
    outcome: 'unknown' | 'success' | 'failure' | 'follow_up';
    confidence?: number;
    reasoning?: string;
    source: 'ai' | 'manual';
    operator_id?: string;
    created_at: string;
}

// 统一 Transcription — 合并 types.ts / useWebSocket / background 三处定义
export interface Transcription {
    timestamp: string;
    text: string;
    speaker: string;
    confidence?: number;
    is_final?: boolean;
    call_id?: string;
}

export interface CallDetails {
    callId: string;
    startTime: string;
    endTime: string;
    caller: string;
    callee: string;
    status: string;
    duration: number;
    transcriptions: Transcription[];
    agentActions?: AgentAction[];
    summary: string | null;
    outcome?: CallOutcome | null;
    quality: {
        mos: number;
        jitter: number;
        packetLoss: number;
    };
}

// ── WebSocket / 实时通信类型 ──

export interface CallEvent {
    call_id: string
    caller_uri: string
    callee_uri: string
    caller: string
    callee: string
    status: string
    event_type: string
    start_time: string
    end_time?: string
    duration?: number
}

export interface AISuggestion {
    id: string
    text: string
    type: string
    intent?: {
        category: string
        confidence: number
        reasoning: string
    }
    source?: {
        title: string
        score: number
    }
}

export interface ChatMessage {
    _id: string;
    type: 'internal' | 'system' | 'omni';
    channelId: string;
    sender: {
        id: string;
        name: string;
        role: string;
        avatar?: string;
    };
    recipient: {
        type: string;
        id: string;
    };
    content: {
        text: string;
        attachments?: any[];
        meta?: any;
    };
    createdAt: string;
    status: string;
}

export interface CallSummary {
    callId: string
    intent: string
    outcome: string
    nextAction: string
    entities: Record<string, string>
    sentiment: string
    rawSummary?: string
    llmModel?: string
    createdAt?: string
}

// ── Compliance ──

export interface ChecklistItem {
    id: string;
    text: string;
    pattern: string;
    type: 'regex' | 'llm';
    scope: 'call' | 'chat' | 'all';
    hint?: string;
    is_negative?: boolean;
}

export interface Checklist {
    id: string;
    name: string;
    items: ChecklistItem[];
}

export interface ComplianceUpdate {
    sessionId: string;
    checklistId: string;
    completedItems: string[];
    items: ChecklistItem[];
    channel?: string;
    agentId?: string;
}

export type CallComplianceUpdate = ComplianceUpdate;

// ── Inbox / OmniChannel ──

export interface Conversation {
    _id: string
    status: string
    channel: string
    priority?: string
    subject?: string
    messageCount: number
    unreadCount?: number
    lastMessageAt?: string
    createdAt?: string
    metadata?: { visitorName?: string; visitorId?: string; visitorEmail?: string; intent?: string }
    contactId?: { displayName?: string }
}

export interface OmniMessage {
    message_id: string
    sender_name: string
    sender_role: string
    content_text: string
    content_type?: string
    content_meta?: string
    created_at: string
    sequence?: number
}

export interface CopilotSignal {
    id: string
    type: 'suggestion' | 'action_draft' | 'summary' | 'crm_lookup' | 'template_recommendation' | 'outcome' | 'coach'
    data: any
    timestamp: number
}
