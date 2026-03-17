// Copilot 信号管理 hook — 从 InboxPanel 抽取
// 管理 suggestion / action_draft / summary / crm_lookup 等 AI 信号的状态
import { useState, useEffect, useCallback } from 'react'
import type { CopilotSignal } from '~/types'

export function useCopilotSignals() {
    const [signals, setSignals] = useState<Record<string, CopilotSignal[]>>({})

    // 挂载时从 session storage 恢复
    useEffect(() => {
        chrome.storage.session?.get?.(['copilotSignals'], (r: any) => {
            if (r?.copilotSignals) {
                try { setSignals(JSON.parse(r.copilotSignals)) } catch { /* ignore */ }
            }
        })
    }, [])

    const persistSignals = useCallback((next: Record<string, CopilotSignal[]>) => {
        try { chrome.storage.session?.set?.({ copilotSignals: JSON.stringify(next) }) } catch { /* ignore */ }
    }, [])

    /**
     * 处理 omni:suggestion (批量)
     * msg.data.suggestions: Array<{text, suggestion, source, ...}>
     */
    const handleBatchSuggestions = useCallback((convId: string, suggestions: any[]) => {
        setSignals(prev => {
            let current = prev[convId] || []
            for (const item of suggestions) {
                const text = item.text || item.suggestion || ''
                if (!text) continue
                if (current.some(s => s.type === 'suggestion' && s.data?.text === text)) continue
                current = [...current, {
                    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    type: 'suggestion' as const,
                    data: { ...item, text, source: item.source?.title || '' },
                    timestamp: Date.now(),
                }]
            }
            const next = { ...prev, [convId]: current }
            persistSignals(next)
            return next
        })
    }, [persistSignals])

    /**
     * 处理单条 copilot 信号
     * signalType: suggestion | action_draft | summary | outcome | crm_lookup | template_recommendation
     */
    const handleSignal = useCallback((convId: string, signalType: CopilotSignal['type'], data: any) => {
        const signal: CopilotSignal = {
            id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: signalType,
            data,
            timestamp: Date.now(),
        }
        setSignals(prev => {
            const current = prev[convId] || []
            let filtered: typeof current
            if (signalType === 'action_draft') {
                // 同 intentName 就地替换
                const intentName = data?.intentName
                const existingIdx = current.findIndex(s => s.type === 'action_draft' && s.data?.intentName === intentName)
                if (existingIdx >= 0) {
                    const updated = [...current]
                    updated[existingIdx] = signal
                    const next = { ...prev, [convId]: updated }
                    persistSignals(next)
                    return next
                }
                filtered = current
            } else if (signalType === 'suggestion') {
                const text = data.text
                filtered = text ? current.filter(s => !(s.type === 'suggestion' && s.data?.text === text)) : current
            } else {
                // outcome/summary 等：替换为最新
                filtered = current.filter(s => s.type !== signalType)
            }
            const next = { ...prev, [convId]: [...filtered, signal] }
            persistSignals(next)
            return next
        })
    }, [persistSignals])

    /**
     * 处理 coach whisper（绑定到指定 conv，只保留最新一条）
     */
    const handleCoach = useCallback((convId: string, data: any) => {
        const coachSignal: CopilotSignal = {
            id: `sig_coach_${Date.now()}`,
            type: 'coach',
            data,
            timestamp: Date.now(),
        }
        setSignals(prev => {
            const current = prev[convId] || []
            const filtered = current.filter(s => s.type !== 'coach')
            const next = { ...prev, [convId]: [...filtered, coachSignal] }
            persistSignals(next)
            return next
        })
    }, [persistSignals])

    /**
     * 清除指定会话的所有信号
     */
    const clearSignals = useCallback((convId: string) => {
        setSignals(prev => {
            const next = { ...prev }
            delete next[convId]
            persistSignals(next)
            return next
        })
    }, [persistSignals])

    return {
        copilotSignals: signals,
        setCopilotSignals: setSignals,
        handleBatchSuggestions,
        handleSignal,
        handleCoach,
        clearSignals,
    }
}
