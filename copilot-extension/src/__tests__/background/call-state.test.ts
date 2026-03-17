/**
 * V5 审计 TDD 测试 — call-state.ts 核心函数
 * 覆盖: SEC-CP-1, ROBUST-CP-1, SEC-CP-2, ARCH-CP-2, ghost call detection
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    createDefaultApiConfig,
    isApiReady,
    processCallEvent,
    mergeTranscription,
    processSuggestion,
    archiveCallToHistory,
    isGhostCall,
    validateChatSend,
    validateChatRecall,
    validateChatEdit,
    type CurrentCall,
    type TranscriptionSegment,
} from '~/call-state'

// ── SEC-CP-1: apiUrl 竞态守卫 ──

describe('SEC-CP-1: apiUrl 竞态守卫', () => {
    it('默认 apiUrl 为空字符串', () => {
        const config = createDefaultApiConfig()
        expect(config.apiUrl).toBe('')
    })

    it('默认 token 为 null', () => {
        const config = createDefaultApiConfig()
        expect(config.token).toBeNull()
    })

    it('apiUrl 为空时 isApiReady 返回 false', () => {
        expect(isApiReady({ apiUrl: '', token: 'x' })).toBe(false)
    })

    it('apiUrl 有值时 isApiReady 返回 true', () => {
        expect(isApiReady({ apiUrl: 'http://api.test.com', token: 'x' })).toBe(true)
    })

    it('apiUrl 默认值不是 localhost', () => {
        const config = createDefaultApiConfig()
        expect(config.apiUrl).not.toContain('localhost')
        expect(config.apiUrl).not.toContain('127.0.0.1')
    })
})

// ── Call Lifecycle ──

describe('Call Lifecycle — processCallEvent', () => {
    it('call_create 创建新通话', () => {
        const result = processCallEvent(
            { call_id: 'c1', event_type: 'call_create', caller_uri: 'sip:100@x', callee_uri: 'sip:200@x' },
            null
        )
        expect(result.action).toBe('create')
        expect(result.call?.callId).toBe('c1')
        expect(result.call?.caller).toBe('sip:100@x')
    })

    it('call_create 重复 callId 不创建 (noop)', () => {
        const existing: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', startTime: new Date(),
            transcriptions: [], suggestions: []
        }
        const result = processCallEvent(
            { call_id: 'c1', event_type: 'call_create' }, existing
        )
        expect(result.action).toBe('noop')
        expect(result.call).toBe(existing)
    })

    it('call_answer 更新 status 和 startTime', () => {
        const existing: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', status: 'ring',
            startTime: new Date(0), transcriptions: [], suggestions: []
        }
        const result = processCallEvent(
            { call_id: 'c1', event_type: 'call_answer' }, existing
        )
        expect(result.action).toBe('answer')
        expect(result.call?.status).toBe('active')
        expect(result.call!.startTime.getTime()).toBeGreaterThan(0)
    })

    it('call_answer 不同 callId → noop', () => {
        const existing: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', startTime: new Date(),
            transcriptions: [], suggestions: []
        }
        const result = processCallEvent(
            { call_id: 'c999', event_type: 'call_answer' }, existing
        )
        expect(result.action).toBe('noop')
    })

    it('call_hangup 归档通话并清空', () => {
        const existing: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', startTime: new Date(),
            transcriptions: [], suggestions: []
        }
        const result = processCallEvent(
            { call_id: 'c1', event_type: 'call_hangup' }, existing
        )
        expect(result.action).toBe('hangup')
        expect(result.call).toBeNull()
        expect(result.archiveCall?.endTime).toBeDefined()
    })

    it('call_hangup 无活跃通话 → noop', () => {
        const result = processCallEvent(
            { call_id: 'c1', event_type: 'call_hangup' }, null
        )
        expect(result.action).toBe('noop')
    })
})

// ── ROBUST-CP-2: Transcription Merge (is_final 句子边界) ──

describe('ROBUST-CP-2: transcription 合并 (is_final 句子边界)', () => {
    it('partial→final 合并 (同 speaker, 前一条 is_final=false)', () => {
        const ts: TranscriptionSegment[] = [
            { text: '你好我想咨询一下', timestamp: 't1', speaker: 'caller', is_final: false }
        ]
        mergeTranscription(ts, {
            text: '你好我想咨询一下贷款问题', timestamp: 't2', speaker: 'caller', is_final: true
        })
        expect(ts).toHaveLength(1)
        expect(ts[0].text).toBe('你好我想咨询一下贷款问题')
        expect(ts[0].is_final).toBe(true)
    })

    it('中文短文本也能合并 (嗯→嗯这个)', () => {
        const ts: TranscriptionSegment[] = [
            { text: '嗯', timestamp: 't1', speaker: 'caller', is_final: false }
        ]
        mergeTranscription(ts, {
            text: '嗯这个', timestamp: 't2', speaker: 'caller', is_final: false
        })
        expect(ts).toHaveLength(1)
        expect(ts[0].text).toBe('嗯这个')
    })

    it('ASR 标点纠正也能合并 (嗯这个→嗯，这个它支持IVR吗？)', () => {
        const ts: TranscriptionSegment[] = [
            { text: '嗯这个它支持IVR吗有AI接入吗', timestamp: 't1', speaker: 'caller', is_final: false }
        ]
        mergeTranscription(ts, {
            text: '嗯，这个它支持IVR吗？有AI接入吗？', timestamp: 't2', speaker: 'caller', is_final: true
        })
        expect(ts).toHaveLength(1)
        expect(ts[0].text).toBe('嗯，这个它支持IVR吗？有AI接入吗？')
        expect(ts[0].is_final).toBe(true)
    })

    it('不同 speaker 不合并', () => {
        const ts: TranscriptionSegment[] = [
            { text: '你好我想咨询', timestamp: 't1', speaker: 'caller', is_final: false }
        ]
        mergeTranscription(ts, {
            text: '请说请说', timestamp: 't2', speaker: 'agent', is_final: true
        })
        expect(ts).toHaveLength(2)
        expect(ts[1].speaker).toBe('agent')
    })

    it('已 is_final 的段不被合并覆盖', () => {
        const ts: TranscriptionSegment[] = [
            { text: '你好我想咨询一下', timestamp: 't1', speaker: 'caller', is_final: true }
        ]
        mergeTranscription(ts, {
            text: '你好我想咨询一下贷款问题', timestamp: 't2', speaker: 'caller', is_final: true
        })
        expect(ts).toHaveLength(2) // 已 final → 不触发合并
    })

    it('连续多次 partial 更新同一段', () => {
        const ts: TranscriptionSegment[] = [
            { text: '你', timestamp: 't1', speaker: 'caller', is_final: false }
        ]
        mergeTranscription(ts, { text: '你好', timestamp: 't2', speaker: 'caller', is_final: false })
        expect(ts).toHaveLength(1)
        expect(ts[0].text).toBe('你好')

        mergeTranscription(ts, { text: '你好我想', timestamp: 't3', speaker: 'caller', is_final: false })
        expect(ts).toHaveLength(1)
        expect(ts[0].text).toBe('你好我想')

        mergeTranscription(ts, { text: '你好，我想咨询一下。', timestamp: 't4', speaker: 'caller', is_final: true })
        expect(ts).toHaveLength(1)
        expect(ts[0].text).toBe('你好，我想咨询一下。')
        expect(ts[0].is_final).toBe(true)
    })

    it('final 后新 partial 追加为新段', () => {
        const ts: TranscriptionSegment[] = [
            { text: '你好。', timestamp: 't1', speaker: 'caller', is_final: true }
        ]
        mergeTranscription(ts, { text: '我想', timestamp: 't2', speaker: 'caller', is_final: false })
        expect(ts).toHaveLength(2)
        expect(ts[1].text).toBe('我想')
    })
})

// ── Suggestion Processing ──

describe('Suggestion Processing', () => {
    it('有效 suggestion 添加到通话', () => {
        const call: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', startTime: new Date(),
            transcriptions: [], suggestions: []
        }
        const added = processSuggestion(call, {
            call_id: 'c1', suggestion: 'offer discount', confidence: 0.9, type: 'tip'
        })
        expect(added).toBe(true)
        expect(call.suggestions).toHaveLength(1)
        expect(call.suggestions[0].text).toBe('offer discount')
    })

    it('call_id 不匹配 → 不添加', () => {
        const call: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', startTime: new Date(),
            transcriptions: [], suggestions: []
        }
        const added = processSuggestion(call, {
            call_id: 'c999', suggestion: 'x'
        })
        expect(added).toBe(false)
        expect(call.suggestions).toHaveLength(0)
    })

    it('无活跃通话 → 不添加', () => {
        const added = processSuggestion(null, {
            call_id: 'c1', suggestion: 'x'
        })
        expect(added).toBe(false)
    })
})

// ── ARCH-CP-2: callHistory 大小限制 ──

describe('ARCH-CP-2: callHistory 大小限制', () => {
    it('超 100 条历史被截断', () => {
        const history: CurrentCall[] = Array.from({ length: 105 }, (_, i) => ({
            callId: `c${i}`, caller: 'a', callee: 'b',
            startTime: new Date(), transcriptions: [], suggestions: []
        }))
        const newCall: CurrentCall = {
            callId: 'new', caller: 'a', callee: 'b',
            startTime: new Date(), transcriptions: [], suggestions: []
        }
        const result = archiveCallToHistory(history, newCall)
        expect(result.length).toBe(100)
        expect(result[0].callId).toBe('new') // 最新在前
    })

    it('单通话 transcription 超 200 条被截断', () => {
        const call: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', startTime: new Date(),
            transcriptions: Array.from({ length: 300 }, (_, i) => ({
                text: `seg${i}`, timestamp: 't', speaker: 'caller'
            })),
            suggestions: []
        }
        const result = archiveCallToHistory([], call)
        expect(result[0].transcriptions.length).toBe(200)
        // 保留最新的 200 条 (slice(-200))
        expect(result[0].transcriptions[0].text).toBe('seg100')
    })

    it('正常通话不被截断', () => {
        const call: CurrentCall = {
            callId: 'c1', caller: 'a', callee: 'b', startTime: new Date(),
            transcriptions: [{ text: 'hi', timestamp: 't', speaker: 'caller' }],
            suggestions: []
        }
        const result = archiveCallToHistory([], call)
        expect(result.length).toBe(1)
        expect(result[0].transcriptions.length).toBe(1)
    })
})

// ── Ghost Call Detection ──

describe('Ghost Call Detection', () => {
    it('超过 4 小时的通话为 ghost call', () => {
        const call = { startTime: new Date(Date.now() - 5 * 60 * 60 * 1000) }
        expect(isGhostCall(call)).toBe(true)
    })

    it('不到 4 小时的通话不是 ghost call', () => {
        const call = { startTime: new Date(Date.now() - 2 * 60 * 60 * 1000) }
        expect(isGhostCall(call)).toBe(false)
    })

    it('字符串格式的 startTime 也能处理', () => {
        const iso = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
        expect(isGhostCall({ startTime: iso as any })).toBe(true)
    })
})

// ── SEC-CP-2: chat:send 字段校验 ──

describe('SEC-CP-2: chat:send 字段校验', () => {
    it('缺 recipientId 返回失败', () => {
        const r = validateChatSend({ content: { text: 'hi' } })
        expect(r.valid).toBe(false)
        expect(r.error).toContain('recipientId')
    })

    it('recipientId 非字符串返回失败', () => {
        const r = validateChatSend({ recipientId: 123, content: { text: 'hi' } })
        expect(r.valid).toBe(false)
    })

    it('缺 content 返回失败', () => {
        const r = validateChatSend({ recipientId: 'u1' })
        expect(r.valid).toBe(false)
        expect(r.error).toContain('content')
    })

    it('content 为旧 string 格式返回失败', () => {
        const r = validateChatSend({ recipientId: 'u1', content: 'hello' })
        expect(r.valid).toBe(false)
        expect(r.error).toContain('content')
    })

    it('content 为 {} (无 text 字段) 返回失败', () => {
        const r = validateChatSend({ recipientId: 'u1', content: {} })
        expect(r.valid).toBe(false)
    })

    it('content.text 超 5000 字返回失败', () => {
        const r = validateChatSend({ recipientId: 'u1', content: { text: 'x'.repeat(5001) } })
        expect(r.valid).toBe(false)
        expect(r.error).toContain('5000')
    })

    it('合法 payload 通过校验', () => {
        const r = validateChatSend({ recipientId: 'u1', content: { text: 'hello world' } })
        expect(r.valid).toBe(true)
    })

    it('data 为 null/undefined 返回失败', () => {
        expect(validateChatSend(null).valid).toBe(false)
        expect(validateChatSend(undefined).valid).toBe(false)
    })
})

// ── SEC-CP-2: chat:recall / chat:edit 校验 ──

describe('SEC-CP-2: chat:recall / chat:edit 校验', () => {
    it('recall 缺 messageId 返回失败', () => {
        const r = validateChatRecall({})
        expect(r.valid).toBe(false)
        expect(r.error).toContain('messageId')
    })

    it('recall 合法 payload 通过', () => {
        const r = validateChatRecall({ messageId: 'msg-123' })
        expect(r.valid).toBe(true)
    })

    it('edit 缺 newText 返回失败', () => {
        const r = validateChatEdit({ messageId: 'msg-123' })
        expect(r.valid).toBe(false)
        expect(r.error).toContain('newText')
    })

    it('edit newText 超长返回失败', () => {
        const r = validateChatEdit({ messageId: 'msg-123', newText: 'x'.repeat(5001) })
        expect(r.valid).toBe(false)
    })

    it('edit 合法 payload 通过', () => {
        const r = validateChatEdit({ messageId: 'msg-123', newText: 'updated text' })
        expect(r.valid).toBe(true)
    })

    it('edit/recall data 为 null 返回失败', () => {
        expect(validateChatRecall(null).valid).toBe(false)
        expect(validateChatEdit(null).valid).toBe(false)
    })
})

