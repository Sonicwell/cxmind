/**
 * TDD — ARCH-V7-2 修复: shouldBroadcastCallEvent 纯函数测试
 * 确保 call_hangup 事件在 currentCall 被清空前正确判断广播
 */
import { describe, it, expect } from 'vitest'
import { shouldBroadcastCallEvent } from '~/call-state'

describe('ARCH-V7-2: shouldBroadcastCallEvent', () => {
    // ── call_create 始终广播 ──

    it('call_create 始终广播, 即使无活跃通话', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c1', event_type: 'call_create' },
            null
        )
        expect(result).toBe(true)
    })

    it('call_create 始终广播, 即使有不同 callId 的通话', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c2', event_type: 'call_create' },
            { callId: 'c1' }
        )
        expect(result).toBe(true)
    })

    // ── call_hangup: 匹配 callId → 广播 (此处复现 bug) ──

    it('call_hangup 匹配 callId → 应广播 (回归 bug 的核心用例)', () => {
        // 在 processCallEvent 把 currentCall 清 null 之前, 先用旧 state 判断
        const result = shouldBroadcastCallEvent(
            { call_id: 'c1', event_type: 'call_hangup' },
            { callId: 'c1' }
        )
        expect(result).toBe(true)
    })

    it('call_hangup 不匹配 callId → 不广播', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c999', event_type: 'call_hangup' },
            { callId: 'c1' }
        )
        expect(result).toBe(false)
    })

    it('call_hangup 无活跃通话 → 不广播', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c1', event_type: 'call_hangup' },
            null
        )
        expect(result).toBe(false)
    })

    // ── call_answer ──

    it('call_answer 匹配 callId → 广播', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c1', event_type: 'call_answer' },
            { callId: 'c1' }
        )
        expect(result).toBe(true)
    })

    it('call_answer 不匹配 callId → 不广播', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c999', event_type: 'call_answer' },
            { callId: 'c1' }
        )
        expect(result).toBe(false)
    })

    // ── 无关事件 ──

    it('不匹配 callId 的任意事件 → 不广播', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c999', event_type: 'call_quality' },
            { callId: 'c1' }
        )
        expect(result).toBe(false)
    })

    it('匹配 callId 的非标准事件 → 广播', () => {
        const result = shouldBroadcastCallEvent(
            { call_id: 'c1', event_type: 'call_quality' },
            { callId: 'c1' }
        )
        expect(result).toBe(true)
    })
})
