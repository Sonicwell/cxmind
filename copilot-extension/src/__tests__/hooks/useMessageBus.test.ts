import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMessageBus } from '~/hooks/useMessageBus'

// chrome.runtime mock 已在 setup.ts 全局设置

describe('useMessageBus', () => {
    it('注册后 addListener 被调用', () => {
        const handler = vi.fn()
        renderHook(() => useMessageBus('call_update', handler))
        expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled()
    })

    it('卸载后 removeListener 被调用', () => {
        const handler = vi.fn()
        const { unmount } = renderHook(() => useMessageBus('call_update', handler))
        unmount()
        expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled()
    })

    it('只接收匹配类型的消息', () => {
        const handler = vi.fn()
        renderHook(() => useMessageBus('omni:suggestion', handler))
        // 获取实际注册的 listener
        const registeredListener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0]
        registeredListener({ type: 'omni:suggestion', data: { text: 'hi' } })
        expect(handler).toHaveBeenCalledTimes(1)
        registeredListener({ type: 'omni:customer_message', data: {} })
        expect(handler).toHaveBeenCalledTimes(1) // 不匹配的类型不触发
    })

    it('支持数组订阅多种类型', () => {
        const handler = vi.fn()
        renderHook(() => useMessageBus(['omni:customer_message', 'omni:agent_message'], handler))
        const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0]
        listener({ type: 'omni:customer_message', data: {} })
        listener({ type: 'omni:agent_message', data: {} })
        listener({ type: 'omni:typing', data: {} })
        expect(handler).toHaveBeenCalledTimes(2)
    })

    it('* 通配符接收所有消息', () => {
        const handler = vi.fn()
        renderHook(() => useMessageBus('*', handler))
        const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0]
        listener({ type: 'omni:suggestion', data: {} })
        listener({ type: 'call_update', data: {} })
        expect(handler).toHaveBeenCalledTimes(2)
    })

    it('enabled=false 不注册 listener', () => {
        const addCalls = (chrome.runtime.onMessage.addListener as any).mock.calls.length
        const handler = vi.fn()
        renderHook(() => useMessageBus('call_update', handler, false))
        expect((chrome.runtime.onMessage.addListener as any).mock.calls.length).toBe(addCalls)
    })

    it('忽略无 type 字段的消息', () => {
        const handler = vi.fn()
        renderHook(() => useMessageBus('*', handler))
        const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0]
        listener({})
        listener(null)
        listener({ data: 'no type' })
        expect(handler).toHaveBeenCalledTimes(0)
    })
})
