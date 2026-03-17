import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCopilotSignals } from '~/hooks/useCopilotSignals'

describe('useCopilotSignals', () => {
    it('初始状态为空', () => {
        const { result } = renderHook(() => useCopilotSignals())
        expect(result.current.copilotSignals).toEqual({})
    })

    it('handleSignal 添加单条 suggestion', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleSignal('conv-1', 'suggestion', { text: 'Try empathizing' })
        })
        const signals = result.current.copilotSignals['conv-1']
        expect(signals).toHaveLength(1)
        expect(signals[0].type).toBe('suggestion')
        expect(signals[0].data.text).toBe('Try empathizing')
    })

    it('handleSignal 同 text suggestion 去重', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleSignal('conv-1', 'suggestion', { text: 'Tip A' })
            result.current.handleSignal('conv-1', 'suggestion', { text: 'Tip A' })
        })
        expect(result.current.copilotSignals['conv-1']).toHaveLength(1)
    })

    it('handleSignal action_draft 同 intentName 就地替换', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleSignal('conv-1', 'action_draft', { intentName: 'refund', amount: 50 })
        })
        act(() => {
            result.current.handleSignal('conv-1', 'action_draft', { intentName: 'refund', amount: 100 })
        })
        const signals = result.current.copilotSignals['conv-1']
        expect(signals).toHaveLength(1)
        expect(signals[0].data.amount).toBe(100) // 替换为新值
    })

    it('handleSignal outcome/summary 替换为最新', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleSignal('conv-1', 'outcome', { result: 'old' })
            result.current.handleSignal('conv-1', 'outcome', { result: 'new' })
        })
        const signals = result.current.copilotSignals['conv-1']
        expect(signals).toHaveLength(1)
        expect(signals[0].data.result).toBe('new')
    })

    it('handleBatchSuggestions 批量添加', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleBatchSuggestions('conv-1', [
                { text: 'Tip 1' },
                { text: 'Tip 2' },
                { text: '' }, // 空文本跳过
            ])
        })
        expect(result.current.copilotSignals['conv-1']).toHaveLength(2)
    })

    it('handleBatchSuggestions 去重', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleBatchSuggestions('conv-1', [{ text: 'Tip' }])
            result.current.handleBatchSuggestions('conv-1', [{ text: 'Tip' }, { text: 'New' }])
        })
        expect(result.current.copilotSignals['conv-1']).toHaveLength(2)
    })

    it('handleCoach 只保留最新一条', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleCoach('conv-1', { message: 'First coach' })
            result.current.handleCoach('conv-1', { message: 'Latest coach' })
        })
        const coaches = result.current.copilotSignals['conv-1'].filter(s => s.type === 'coach')
        expect(coaches).toHaveLength(1)
        expect(coaches[0].data.message).toBe('Latest coach')
    })

    it('clearSignals 清除指定 conv', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleSignal('conv-1', 'suggestion', { text: 'A' })
            result.current.handleSignal('conv-2', 'suggestion', { text: 'B' })
        })
        act(() => result.current.clearSignals('conv-1'))
        expect(result.current.copilotSignals['conv-1']).toBeUndefined()
        expect(result.current.copilotSignals['conv-2']).toHaveLength(1)
    })

    it('不同 conv 的信号互不干扰', () => {
        const { result } = renderHook(() => useCopilotSignals())
        act(() => {
            result.current.handleSignal('conv-1', 'suggestion', { text: 'Tip for 1' })
            result.current.handleSignal('conv-2', 'outcome', { result: 'ok' })
        })
        expect(result.current.copilotSignals['conv-1']).toHaveLength(1)
        expect(result.current.copilotSignals['conv-2']).toHaveLength(1)
        expect(result.current.copilotSignals['conv-1'][0].type).toBe('suggestion')
        expect(result.current.copilotSignals['conv-2'][0].type).toBe('outcome')
    })
})
