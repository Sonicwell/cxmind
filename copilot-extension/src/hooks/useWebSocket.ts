import { useState, useEffect, useRef, useCallback } from "react"
import { BoundedSet } from "~/utils/bounded-set"
import type { CallEvent, Transcription, AISuggestion, ChatMessage, CallSummary, ChecklistItem } from "~/types"

// re-export 以保持下游兼容
export type { CallEvent, Transcription, AISuggestion, ChatMessage, CallSummary }

interface AsrInfo {
    enabled: boolean
    canToggle: boolean
    reason: string
    globalPolicy?: string
    agentPolicy?: string
    hasActiveVendor?: boolean
}

interface WebSocketState {
    connected: boolean
    connecting: boolean
    currentCall: CallEvent | null
    transcriptions: Transcription[]
    suggestions: AISuggestion[]
    chatMessages: ChatMessage[]
    complianceItems: ChecklistItem[]
    completedComplianceItems: string[]
    omniComplianceItems: ChecklistItem[]
    omniCompletedComplianceItems: string[]
    omniComplianceConvId: string | null
    callSummary: CallSummary | null
    callOutcome: { sessionId: string; outcome: string; confidence: number; reasoning: string } | null
    lastEndedCallId: string | null
    lastEndedCallInfo: { caller: string; callee: string; startTime: string } | null
    summaryLoading: boolean
    summaryTimedOut: boolean
    summaryNotEnabled: boolean
    summarySkipped: boolean
    contextBrief: any | null
    callQuality: { caller: any; callee: any } | null
    crmData: any | null
    asrInfo: AsrInfo | null
}

export function useWebSocket() {
    const [state, setState] = useState<WebSocketState>({
        connected: false,
        connecting: false,
        currentCall: null,
        transcriptions: [],
        suggestions: [],
        chatMessages: [],
        complianceItems: [],
        completedComplianceItems: [],
        omniComplianceItems: [],
        omniCompletedComplianceItems: [],
        omniComplianceConvId: null,
        callSummary: null,
        callOutcome: null,
        lastEndedCallId: null,
        lastEndedCallInfo: null,
        summaryLoading: false,
        summaryTimedOut: false,
        summaryNotEnabled: false,
        summarySkipped: false,
        contextBrief: null,
        callQuality: null,
        crmData: null,
        asrInfo: null
    })

    // E2E Mocking hook: Expose setState so Playwright can forcibly render any state without Chrome Messaging
    if (typeof window !== 'undefined') {
       (window as any).__playwright_setWebSocketState = setState;
    }

    const listenerRef = useRef<((message: any) => void) | null>(null)
    // Ref to reliably capture current call info (avoids React state batching issues)
    const currentCallInfoRef = useRef<{ caller: string; callee: string; caller_type?: string; callee_type?: string; startTime: string } | null>(null)
    // Ref-based set for chat message dedup (immune to React batching)
    const seenMsgIdsRef = useRef(new BoundedSet<string>(500))

    useEffect(() => {
        // ✅ On mount, request the current call from background (may already be active)
        chrome.runtime.sendMessage({ type: "getCurrentCall" }, (response) => {
            if (chrome.runtime.lastError) return
            if (response?.call) {
                const call = response.call
                setState((s) => ({
                    ...s,
                    currentCall: {
                        call_id: call.callId,
                        caller_uri: call.caller,
                        callee_uri: call.callee,
                        caller: call.caller,
                        callee: call.callee,
                        status: "active",
                        event_type: "call_create",
                        start_time: call.startTime
                    },
                    transcriptions: call.transcriptions || [],
                    suggestions: (call.suggestions || []).map((s: any, i: number) => ({
                        id: `s-${i}`,
                        text: s.text,
                        type: s.type || "tip",
                        intent: s.intent,
                        source: s.source,
                    }))
                }))
                currentCallInfoRef.current = {
                    caller: call.caller || '',
                    callee: call.callee || '',
                    startTime: call.startTime || ''
                }
            }
        })

        // Poll background for connection status
        const checkStatus = () => {
            chrome.runtime.sendMessage({ type: "getConnectionStatus" }, (response) => {
                if (chrome.runtime.lastError) return
                if (response) {
                    setState((s) => ({
                        ...s,
                        connected: response.connected,
                        connecting: response.connecting || false
                    }))
                }
            })
        }

        checkStatus()
        const interval = setInterval(checkStatus, 5000)

        // Listen for messages from background
        // Message types align with chrome-extension/background.js:
        //   call_event, transcription_update, suggestion_update
        const messageListener = (message: any) => {
            switch (message.type) {
                case "clearActiveCall": {
                    setState((s) => ({
                        ...s,
                        currentCall: null,
                        transcriptions: [],
                        suggestions: [],
                        callSummary: null,
                        lastEndedCallId: null,
                        lastEndedCallInfo: null,
                        summaryLoading: false,
                        summaryTimedOut: false,
                        summaryNotEnabled: false,
                        summarySkipped: false,
                        contextBrief: null,
                        callQuality: null
                    }))
                    currentCallInfoRef.current = null
                    break
                }
                case "call:asr_info": {
                    const info = message.data;
                    setState((s) => ({
                        ...s,
                        asrInfo: {
                            enabled: !!info.enabled,
                            canToggle: !!info.canToggle,
                            reason: info.reason || '',
                            globalPolicy: info.globalPolicy,
                            agentPolicy: info.agentPolicy,
                            hasActiveVendor: info.hasActiveVendor,
                        }
                    }))
                    break
                }
                case "call_event": {
                    const event = message.data
                    if (event.event_type === "call_create") {
                        setState((s) => ({
                            ...s,
                            currentCall: {
                                call_id: event.call_id,
                                caller_uri: event.caller_uri,
                                callee_uri: event.callee_uri,
                                caller: event.caller_uri,
                                callee: event.callee_uri,
                                caller_type: event.caller_type || 'customer',
                                callee_type: event.callee_type || 'customer',
                                status: event.status || "active",
                                event_type: event.event_type,
                                start_time: new Date().toISOString()
                            },
                            transcriptions: [],
                            suggestions: [],
                            callSummary: null,
                            lastEndedCallId: null,
                            lastEndedCallInfo: null,
                            summaryLoading: false,
                            summaryTimedOut: false,
                            summaryNotEnabled: false,
                            summarySkipped: false,
                            contextBrief: null,
                            callQuality: null
                        }))
                        currentCallInfoRef.current = {
                            caller: event.caller_uri || '',
                            callee: event.callee_uri || '',
                            caller_type: event.caller_type || 'customer',
                            callee_type: event.callee_type || 'customer',
                            startTime: new Date().toISOString()
                        }
                    } else if (event.event_type === "call_answer") {
                        // 振铃结束→通话接通，重置 start_time（通话时长从此刻算）
                        setState((s) => ({
                            ...s,
                            currentCall: s.currentCall ? {
                                ...s.currentCall,
                                status: "active",
                                start_time: new Date().toISOString()
                            } : s.currentCall
                        }))
                    } else if (event.event_type === "call_hangup") {
                        // Read from ref for reliable call info (avoids React state batching issues)
                        const savedCallInfo = currentCallInfoRef.current
                        currentCallInfoRef.current = null
                        // Snapshot endTime so post-call duration is fixed (not live)
                        const callInfoWithEnd = savedCallInfo
                            ? { ...savedCallInfo, endTime: new Date().toISOString() }
                            : null
                        setState((s) => ({
                            ...s,
                            currentCall: null,
                            lastEndedCallId: s.currentCall?.call_id || event.call_id || s.lastEndedCallId || null,
                            // Preserve existing callInfo if ref was already cleared (duplicate hangup event)
                            lastEndedCallInfo: callInfoWithEnd || s.lastEndedCallInfo,
                            summaryLoading: true,
                            summaryTimedOut: false,
                            summaryNotEnabled: false,
                            summarySkipped: false,
                            asrInfo: null
                        }))
                    }
                    break
                }
                case "transcription_update":
                    // background sends the full transcriptions array
                    setState((s) => ({
                        ...s,
                        transcriptions: message.data || []
                    }))
                    break
                case "suggestion_update":
                    // background sends the full suggestions array
                    setState((s) => ({
                        ...s,
                        suggestions: (message.data || []).map((sg: any, i: number) => ({
                            id: `s-${i}`,
                            text: sg.text || sg.suggestion || '',
                            type: sg.type || "tip",
                            intent: sg.intent,
                            source: sg.source,
                        }))
                    }))
                    break
                case "omni:customer_message":
                case "omni:agent_message": {
                    const msg = message.data;
                    const msgKey = msg.messageId || msg._id || `${msg.createdAt}-${msg.sender?.id}-${(msg.text || msg.content?.text)}`;
                    if (seenMsgIdsRef.current.has(msgKey)) break;
                    seenMsgIdsRef.current.add(msgKey);
                    // 兼容新格式 (text) 和旧格式 (content.text)
                    const normalized = { ...msg, _id: msg.messageId || msg._id, channelId: msg.conversationId || msg.channelId, content: msg.content || { text: msg.text } };
                    setState((s) => {
                        const updated = [...s.chatMessages, normalized];
                        return { ...s, chatMessages: updated.length > 200 ? updated.slice(-200) : updated };
                    });
                    break;
                }
                case "chat:message": {
                    // 内部 P2P/Group 聊天消息
                    const msg = message.data;
                    const msgKey = msg._id || `${msg.createdAt}-${msg.sender?.id}-${msg.content?.text}`;
                    if (seenMsgIdsRef.current.has(msgKey)) break;
                    seenMsgIdsRef.current.add(msgKey);
                    setState((s) => {
                        const updated = [...s.chatMessages, msg];
                        return { ...s, chatMessages: updated.length > 200 ? updated.slice(-200) : updated };
                    });
                    break;
                }
                case "chat:recall": {
                    const { messageId } = message.data || {};
                    if (!messageId) break;
                    setState((s) => ({
                        ...s,
                        chatMessages: s.chatMessages.map(m =>
                            m._id === messageId ? { ...m, isRecalled: true, content: { ...m.content, text: '[已撤回]' } } : m
                        )
                    }));
                    break;
                }
                case "chat:edit": {
                    const { messageId: editId, newText, editedAt } = message.data || {};
                    if (!editId || !newText) break;
                    setState((s) => ({
                        ...s,
                        chatMessages: s.chatMessages.map(m =>
                            m._id === editId ? { ...m, content: { ...m.content, text: newText }, editedAt } : m
                        )
                    }));
                    break;
                }
                case "call:compliance":
                    setState((s) => ({
                        ...s,
                        complianceItems: message.data.items || [],
                        completedComplianceItems: message.data.completedItems || []
                    }))
                    break
                // Omni channel explicit items
                case "omni:compliance":
                    setState((s) => ({
                        ...s,
                        omniComplianceItems: message.data.items || [],
                        omniCompletedComplianceItems: message.data.completedItems || [],
                        omniComplianceConvId: message.data.conversationId || message.data.sessionId || null
                    }))
                    break
                case "call:transcription_replay": {
                    // Bulk replay of historical transcriptions on mid-call reconnect
                    const replaySegments = message.data?.segments || []
                    if (replaySegments.length > 0) {
                        setState((s) => ({
                            ...s,
                            transcriptions: [
                                ...replaySegments.map((seg: any) => ({
                                    id: `replay-${seg.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
                                    text: seg.text || '',
                                    speaker: seg.speaker || 'Unknown',
                                    timestamp: seg.timestamp || '',
                                    is_final: true,
                                    confidence: seg.confidence || 1.0
                                })),
                                ...s.transcriptions // Keep any live transcriptions that arrived after
                            ]
                        }))
                    }
                    break
                }
                case "omni:summary": {
                    // 统一格式: data.summary (SessionSummary), data.sessionId, data.sessionType
                    const raw = message.data?.summary || message.data?.ai_summary || message.data
                    const summaryData = typeof raw === 'object' ? raw : message.data
                    setState((s) => ({
                        ...s,
                        callSummary: {
                            callId: message.data?.sessionId || summaryData.session_id || s.lastEndedCallId || '',
                            intent: summaryData.intent || '',
                            outcome: summaryData.outcome || '',
                            nextAction: summaryData.next_action || summaryData.nextAction || '',
                            entities: typeof summaryData.entities === 'string'
                                ? (() => { try { return JSON.parse(summaryData.entities) } catch { return {} } })()
                                : (summaryData.entities || {}),
                            sentiment: summaryData.sentiment || '',
                            rawSummary: summaryData.raw_summary || summaryData.rawSummary || '',
                            llmModel: summaryData.llm_model || summaryData.llmModel || '',
                            createdAt: summaryData.created_at || summaryData.createdAt || ''
                        },
                        summaryLoading: false,
                        summaryTimedOut: false,
                        summarySkipped: false,
                    }))
                    break
                }
                case "omni:summary_timeout":
                    setState((s) => ({
                        ...s,
                        summaryLoading: false,
                        summaryTimedOut: true,
                    }))
                    break
                case "call:summary_skipped":
                    setState((s) => ({
                        ...s,
                        summaryLoading: false,
                        summaryTimedOut: false,
                        summarySkipped: true,
                    }))
                    break
                case "call:summary_not_enabled":
                    setState((s) => ({
                        ...s,
                        summaryLoading: false,
                        summaryTimedOut: false,
                        summaryNotEnabled: true,
                    }))
                    break
                case "policy:updated":
                    // DOM event → PolicyBadges 无需 prop drilling
                    window.dispatchEvent(new CustomEvent('copilot:policy_updated'))
                    break
                case "omni:context_brief": {
                    setState((s) => ({
                        ...s,
                        contextBrief: message.data?.brief || message.data
                    }))
                    break
                }
                case "omni:outcome": {
                    setState((s) => ({
                        ...s,
                        callOutcome: {
                            sessionId: message.data?.sessionId || message.data?.call_id || '',
                            outcome: message.data?.outcome || 'unknown',
                            confidence: message.data?.confidence || 0,
                            reasoning: message.data?.reasoning || ''
                        }
                    }))
                    break
                }
                case "call:quality": {
                    const qData = message.data;
                    if (qData.source === 'rtp' && (qData.direction === 'caller' || qData.direction === 'callee')) {
                        setState((s) => {
                            const newQuality = s.callQuality ? { ...s.callQuality } : { caller: null, callee: null };
                            newQuality[qData.direction as 'caller' | 'callee'] = qData;
                            return { ...s, callQuality: newQuality };
                        });
                    }
                    break;
                }
                case "omni:crm_lookup": {
                    setState((s) => ({
                        ...s,
                        crmData: message.data || null
                    }))
                    break
                }
                case "wrapup:completed": {
                    // PiP 或其他面板完成 wrap-up → 同步清空本端状态
                    setState((s) => ({
                        ...s,
                        callSummary: null,
                        lastEndedCallId: null,
                        lastEndedCallInfo: null,
                        summaryLoading: false,
                        summaryTimedOut: false,
                        summaryNotEnabled: false,
                        summarySkipped: false,
                    }))
                    break
                }
            }
        }

        listenerRef.current = messageListener
        chrome.runtime.onMessage.addListener(messageListener)

        let handleHash: any = null;
        if (typeof window !== 'undefined') {
            handleHash = () => {
                const h = window.location.hash.replace(/^#/, '');
                if (h && h.startsWith('%7B')) {
                    try {
                        const msg = JSON.parse(decodeURIComponent(h));
                        if (msg && msg.playwright_mock === true) {
                            messageListener(msg);
                            if (msg.routeToBus) {
                                window.dispatchEvent(new CustomEvent('playwright_mock_bus', { detail: msg }));
                            }
                        }
                    } catch (e) {
                         // ignore
                    }
                }
            };
            window.addEventListener('hashchange', handleHash);
        }

        return () => {
            clearInterval(interval)
            if (listenerRef.current) {
                chrome.runtime.onMessage.removeListener(listenerRef.current)
            }
            if (typeof window !== 'undefined' && handleHash) {
                window.removeEventListener('hashchange', handleHash);
            }
        }
    }, [])

    const clearCall = useCallback(() => {
        setState((s) => ({
            ...s,
            currentCall: null,
            transcriptions: [],
            suggestions: [],
            complianceItems: [],
            completedComplianceItems: [],
            crmData: null,
            asrInfo: null
        }))
        seenMsgIdsRef.current.clear()
    }, [])

    const dismissSummary = useCallback(() => {
        setState((s) => ({
            ...s,
            callSummary: null,
            lastEndedCallId: null,
            lastEndedCallInfo: null,
            summaryLoading: false,
            summaryTimedOut: false,
            summaryNotEnabled: false,
            summarySkipped: false,
            // 不清空 transcriptions/suggestions — 坐席可在 current tab 继续回顾
            // 下次 call_create 事件会自动重置这些数据
        }))
    }, [])


    const triggerMockSummary = useCallback(() => {
        // 1. Set loading state
        setState((s) => ({
            ...s,
            currentCall: null,
            summaryLoading: true,
            lastEndedCallId: "mock-call-123"
        }))

        // 2. Simulate delay then show summary
        setTimeout(() => {
            setState((s) => ({
                ...s,
                summaryLoading: false,
                callSummary: {
                    callId: "mock-call-123",
                    intent: "Support Inquiry",
                    outcome: "Resolved (Mock)",
                    nextAction: "Send email confirmation",
                    entities: { product: "CXMind", issue: "Login" },
                    sentiment: "Positive",
                    createdAt: new Date().toISOString()
                }
            }))
        }, 3000)
    }, [])

    return {
        ...state,
        clearCall,
        dismissSummary,
        triggerMockSummary
    }
}
