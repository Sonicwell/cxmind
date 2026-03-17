// 统一消息总线 hook — 替代各组件中分散的 chrome.runtime.onMessage.addListener
// 渐进迁移：组件调用 useMessageBus('omni:suggestion', handler) 代替手动 addListener/removeListener
import { useEffect, useRef } from 'react'

// 已知消息类型列表 — 维护在这里避免各组件硬编码字符串
export type MessageType =
    // Call lifecycle
    | 'call_update'
    | 'transcription_update'
    | 'ai_suggestion'
    | 'call_summary'
    | 'compliance_update'
    // OmniChannel
    | 'omni:new_conversation'
    | 'omni:customer_message'
    | 'omni:agent_message'
    | 'omni:typing'
    | 'omni:suggestion'
    | 'omni:action_draft'
    | 'omni:summary'
    | 'omni:outcome'
    | 'omni:crm_lookup'
    | 'omni:template_recommendation'
    | 'omni:toxic_alert'
    | 'omni:visitor_disconnected'
    | 'omni:visitor_reconnected'
    | 'omni:resolve_prompt'
    | 'omni:conversation_reopened'
    | 'omni:conversation_preempted'
    | 'omni:conversation_transferred'
    | 'omni:customer_sentiment'
    | 'omni:queue_update'
    | 'omni:context_brief'
    // Chat
    | 'chat:session_rotated'
    | 'chat:incoming'
    // Coaching
    | 'coach:message'
    // SOP
    | 'sop:node_progress'
    // Demo
    | 'demo:force_accept'
    // Agent status
    | 'agent_status_changed'
    // Generic fallback
    | (string & {})

type Handler = (msg: any) => void

/**
 * 订阅单个或多个消息类型，自动管理 listener 生命周期
 * 
 * 用法:
 *   useMessageBus('omni:suggestion', (msg) => { ... })
 *   useMessageBus(['omni:customer_message', 'omni:agent_message'], (msg) => { ... })
 *   useMessageBus('*', (msg) => { ... })  // 监听所有消息
 */
export function useMessageBus(
    types: MessageType | MessageType[] | '*',
    handler: Handler,
    enabled = true,
) {
    const handlerRef = useRef(handler)
    handlerRef.current = handler

    useEffect(() => {
        if (!enabled) return

        const typeSet = types === '*' ? null : new Set(Array.isArray(types) ? types : [types])

        const listener = (msg: any) => {
            if (!msg?.type) return
            if (typeSet && !typeSet.has(msg.type)) return
            handlerRef.current(msg)
        }

        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [
        // 用 JSON.stringify 简化 types 变化检测
        typeof types === 'string' ? types : JSON.stringify(types),
        enabled,
    ])
}
