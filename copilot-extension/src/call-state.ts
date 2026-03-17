/**
 * Call State Management — 从 background.ts 提取的可测试纯函数
 * 负责通话生命周期、转写合并、建议存储等核心逻辑
 */

// ── Types ──

export interface ApiConfig {
    apiUrl: string
    token: string | null
}

export interface CurrentCall {
    callId: string
    caller: string
    callee: string
    caller_type?: 'agent' | 'customer'
    callee_type?: 'agent' | 'customer'
    status?: string
    startTime: Date
    endTime?: Date
    transcriptions: TranscriptionSegment[]
    suggestions: Suggestion[]
}

export interface TranscriptionSegment {
    text: string
    timestamp: string
    speaker: string
    confidence?: number
    is_final?: boolean
}

export interface Suggestion {
    text: string
    timestamp: Date
    confidence?: number
    type?: string
    intent?: { category: string; confidence: number; reasoning: string }
    source?: { title: string; score: number }
}

// ── Default config — SEC-CP-1: 默认 apiUrl 为空, 避免 storage 回调前竞态请求到 localhost ──

export function createDefaultApiConfig(): ApiConfig {
    return {
        apiUrl: "",
        token: null
    }
}

// ── Guard ──

/**
 * SEC-CP-1: apiUrl 是否已就绪（非空）
 * WS 连接和 API 请求前必须先通过此检查
 */
export function isApiReady(config: ApiConfig): boolean {
    return !!config.apiUrl && config.apiUrl.length > 0
}

// ── Call Event Processing ──

export interface CallEventResult {
    action: 'create' | 'answer' | 'hangup' | 'noop'
    call: CurrentCall | null
    archiveCall?: CurrentCall
}

/**
 * 处理通话事件, 返回新的通话状态
 * 纯函数 — 不触发 side effect (storage/WS/badge)
 */
export function processCallEvent(
    event: { call_id: string; event_type: string; caller_uri?: string; callee_uri?: string; status?: string },
    currentCall: CurrentCall | null
): CallEventResult {
    const { call_id, event_type, caller_uri, callee_uri } = event

    if (event_type === "call_create") {
        // 已有同 callId 的通话 → 忽略
        if (currentCall && currentCall.callId === call_id) {
            return { action: 'noop', call: currentCall }
        }

        const newCall: CurrentCall = {
            callId: call_id,
            caller: caller_uri || '',
            callee: callee_uri || '',
            caller_type: (event as any).caller_type || 'customer',
            callee_type: (event as any).callee_type || 'customer',
            status: event.status || 'active',
            startTime: new Date(),
            transcriptions: [],
            suggestions: []
        }

        return { action: 'create', call: newCall }

    } else if (event_type === "call_answer") {
        if (currentCall && currentCall.callId === call_id) {
            const updated = { ...currentCall, status: 'active', startTime: new Date() }
            return { action: 'answer', call: updated }
        }
        return { action: 'noop', call: currentCall }

    } else if (event_type === "call_hangup") {
        if (currentCall && currentCall.callId === call_id) {
            const ended = { ...currentCall, endTime: new Date() }
            return { action: 'hangup', call: null, archiveCall: ended }
        }
        return { action: 'noop', call: currentCall }
    }

    return { action: 'noop', call: currentCall }
}

// ── Broadcast Decision — ARCH-V7-2 ──

/**
 * 判断 call event 是否应广播到 UI
 * 必须在 processCallEvent 之前调用（此时 currentCall 尚未被 hangup 清空）
 * call_create 始终广播, 其余事件需 callId 匹配
 */
export function shouldBroadcastCallEvent(
    event: { call_id: string; event_type: string },
    currentCall: { callId: string } | null
): boolean {
    if (event.event_type === 'call_create') return true
    return !!currentCall && currentCall.callId === event.call_id
}

// ── Transcription Merge ──

/**
 * 合并转写段 — ROBUST-CP-2: 以 is_final 作为句子边界
 * 合并逻辑:
 *   同 speaker 的上一段 is_final=false → 无条件用新段替换（同一句的 partial→final 更新）
 *   否则 → 追加为新段
 * 返回更新后的 transcriptions 数组 (in-place mutation for perf)
 */
export function mergeTranscription(
    transcriptions: TranscriptionSegment[],
    segment: { text: string; timestamp: string; speaker: string; confidence?: number; is_final?: boolean }
): TranscriptionSegment[] {
    // 找同 speaker 的最后一段
    let lastFromSameSpeaker: TranscriptionSegment | null = null
    for (let i = transcriptions.length - 1; i >= 0; i--) {
        if (transcriptions[i].speaker === segment.speaker) {
            lastFromSameSpeaker = transcriptions[i]
            break
        }
    }

    // ROBUST-CP-2: 上一段未结束 (is_final=false) → 直接替换（同一句 partial→final）
    const isUpdate = !!lastFromSameSpeaker && !lastFromSameSpeaker.is_final

    if (isUpdate && lastFromSameSpeaker) {
        lastFromSameSpeaker.text = segment.text
        lastFromSameSpeaker.timestamp = segment.timestamp
        lastFromSameSpeaker.confidence = segment.confidence
        lastFromSameSpeaker.is_final = !!(segment.is_final)
    } else {
        transcriptions.push({
            text: segment.text,
            timestamp: segment.timestamp,
            speaker: segment.speaker,
            confidence: segment.confidence,
            is_final: segment.is_final || false
        })
    }

    return transcriptions
}

// ── Suggestion Processing ──

export function processSuggestion(
    currentCall: CurrentCall | null,
    suggestion: { call_id: string; suggestion: string; confidence?: number; type?: string; intent?: any; source?: any }
): boolean {
    if (!currentCall || currentCall.callId !== suggestion.call_id) return false

    currentCall.suggestions.push({
        text: suggestion.suggestion,
        timestamp: new Date(),
        confidence: suggestion.confidence,
        type: suggestion.type || 'tip',
        intent: suggestion.intent,
        source: suggestion.source,
    })

    return true
}

// ── Archive / History — ARCH-CP-2: 大小限制 ──

const MAX_HISTORY = 100
const MAX_TRANSCRIPTIONS_PER_CALL = 200

/**
 * 归档通话 — 截断 transcriptions + 限制历史总数
 */
export function archiveCallToHistory(
    history: CurrentCall[],
    call: CurrentCall
): CurrentCall[] {
    // 截断超长 transcription
    const archived = { ...call }
    if (archived.transcriptions.length > MAX_TRANSCRIPTIONS_PER_CALL) {
        archived.transcriptions = archived.transcriptions.slice(-MAX_TRANSCRIPTIONS_PER_CALL)
    }

    history.unshift(archived)
    if (history.length > MAX_HISTORY) {
        history.splice(MAX_HISTORY)
    }
    return history
}

// ── Ghost Call Detection ──

/**
 * 是否为 ghost call (超过 4 小时的残留状态)
 */
export function isGhostCall(call: { startTime: Date | string }, nowMs: number = Date.now()): boolean {
    const startMs = new Date(call.startTime).getTime()
    const elapsedHours = (nowMs - startMs) / (1000 * 60 * 60)
    return elapsedHours > 4
}

// ── Chat:send validation — SEC-CP-2 ──

const MAX_CHAT_CONTENT_LENGTH = 5000

export interface ChatSendValidation {
    valid: boolean
    error?: string
}

export function validateChatSend(data: any): ChatSendValidation {
    if (!data) return { valid: false, error: 'Missing chat data' }
    if (!data.recipientId || typeof data.recipientId !== 'string') {
        return { valid: false, error: 'Invalid recipientId' }
    }
    // content 必须是 { text: string } 对象
    if (!data.content || typeof data.content !== 'object' || typeof data.content.text !== 'string') {
        return { valid: false, error: 'Invalid content: must be { text: string }' }
    }
    if (data.content.text.length > MAX_CHAT_CONTENT_LENGTH) {
        return { valid: false, error: `Content exceeds ${MAX_CHAT_CONTENT_LENGTH} chars` }
    }
    return { valid: true }
}

export function validateChatRecall(data: any): ChatSendValidation {
    if (!data) return { valid: false, error: 'Missing data' }
    if (!data.messageId || typeof data.messageId !== 'string') {
        return { valid: false, error: 'Invalid messageId' }
    }
    return { valid: true }
}

export function validateChatEdit(data: any): ChatSendValidation {
    if (!data) return { valid: false, error: 'Missing data' }
    if (!data.messageId || typeof data.messageId !== 'string') {
        return { valid: false, error: 'Invalid messageId' }
    }
    if (!data.newText || typeof data.newText !== 'string') {
        return { valid: false, error: 'Invalid newText' }
    }
    if (data.newText.length > MAX_CHAT_CONTENT_LENGTH) {
        return { valid: false, error: `Content exceeds ${MAX_CHAT_CONTENT_LENGTH} chars` }
    }
    return { valid: true }
}
