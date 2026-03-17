import { useState, useEffect, useCallback, useRef } from "react"
import { useApi } from "~/hooks/useApi"
import { decodeJWT } from "~/utils/jwt"
import { MessageSquare, Send, ChevronLeft, RefreshCw, CheckCircle, ClipboardList, XCircle, ShieldAlert, Sparkles, LayoutTemplate } from "lucide-react"
import { EmailComposer } from "./EmailComposer"
import { ActionDraftCard } from "~/components/ActionDraftCard"
import { ContactContext360 } from "~/components/CallerContext360"
import { ComplianceList } from "~/components/ComplianceList"
import { CollapsibleWidget } from "~/components/CollapsibleWidget"
import { CopilotSidebar } from "~/components/CopilotSidebar"
import { SummaryCard } from "~/components/SummaryCard"
import { OutcomeCard } from "~/components/OutcomeCard"
import { SOPGuidePanel } from "~/components/SOPGuidePanel"
import { type ChecklistItem } from "~/types"
import { useContainerWidth } from "~/hooks/useContainerWidth"
import { useSettings } from "~/hooks/useSettings"
import { useCopilotSignals } from "~/hooks/useCopilotSignals"
import { useMessageBus } from "~/hooks/useMessageBus"
import { DEMO_ENABLED } from "~/utils/demo-flag"

import type { Conversation, OmniMessage, CopilotSignal } from "~/types"

type Message = OmniMessage

function getAgentInfoFromStorage(): Promise<{ agentId: string | null; userId: string | null; displayName: string | null; avatar: string | null }> {
    return new Promise((resolve) => {
        chrome.storage.local.get(["token", "userProfile"], (result) => {
            if (!result.token) return resolve({ agentId: null, userId: null, displayName: null, avatar: null })
            // Demo mode shortcut — token is not a real JWT (编译时 flag 控制)
            if (DEMO_ENABLED && result.token === 'demo-mode-token') {
                return resolve({
                    agentId: 'demo-agent-001',
                    userId: 'demo-agent-001',
                    displayName: 'Demo Agent',
                    avatar: null,
                })
            }
            try {
                const payload = decodeJWT(result.token)
                const profile = result.userProfile || {}
                resolve({
                    agentId: payload?.agentId || null,
                    userId: payload?.userId || null,
                    displayName: profile.displayName || payload?.displayName || payload?.name || "Agent",
                    avatar: profile.avatar || null,
                })
            } catch { resolve({ agentId: null, userId: null, displayName: null, avatar: null }) }
        })
    })
}

function timeAgo(dateStr?: string) {
    if (!dateStr) return ""
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 60000) return "now"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${Math.floor(diff / 86400000)}d`
}

function formatMsgTime(dateStr: string) {
    try {
        // ClickHouse returns UTC like '2026-02-20 05:21:06' — normalize to ISO with Z
        let iso = dateStr.replace(' ', 'T')
        if (!iso.endsWith('Z') && !iso.includes('+')) iso += 'Z'
        const d = new Date(iso)
        return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } catch { return "" }
}

const CHANNEL_ICONS: Record<string, string> = {
    webchat: "💬", whatsapp: "📱", email: "📧", voice: "📞", sms: "✉️",
    line: "🟢", kakao: "💛", wechat: "🟩"
}

export function InboxPanel({ onBack, omniComplianceItems = [], omniCompletedComplianceItems = [], omniComplianceConvId = null }: { onBack?: () => void; omniComplianceItems?: ChecklistItem[]; omniCompletedComplianceItems?: string[]; omniComplianceConvId?: string | null } = {}) {
    const { fetchApi } = useApi()
    const { ref: chatContainerRef, isWide: chatIsWide } = useContainerWidth()
    const { settings } = useSettings()
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConv, setActiveConv] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [replyText, setReplyText] = useState("")
    const [loading, setLoading] = useState(false)
    const [agentId, setAgentId] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [agentName, setAgentName] = useState("Agent")
    const [agentAvatar, setAgentAvatar] = useState<string | null>(null)
    const [queueCount, setQueueCount] = useState(0)
    const [showOutcome, setShowOutcome] = useState(false)
    const [disconnectWarning, setDisconnectWarning] = useState<string | null>(null)
    const [visitorTyping, setVisitorTyping] = useState(false)
    const [hasOlderMessages, setHasOlderMessages] = useState(true)
    const [elapsed, setElapsed] = useState('')
    const [showTransfer, setShowTransfer] = useState(false)
    const [availableAgents, setAvailableAgents] = useState<{ _id: string; displayName: string }[]>([])
    const { copilotSignals, setCopilotSignals, handleBatchSuggestions, handleSignal, handleCoach } = useCopilotSignals()
    const [templates, setTemplates] = useState<any[]>([])
    const [showTemplates, setShowTemplates] = useState(false)
    const [isDemo, setIsDemo] = useState(false)
    // Template preview state
    const [previewTemplate, setPreviewTemplate] = useState<any>(null)
    const [previewLang, setPreviewLang] = useState('en')
    const [previewVars, setPreviewVars] = useState<Record<string, string>>({})
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Multi-conversation 缓存 — 避免切换时丢消息/草稿
    const messagesCacheRef = useRef<Record<string, Message[]>>({})
    const draftCacheRef = useRef<Record<string, string>>({})
    // 新消息指示 (boolean, 不用计数以减少坐席压力)
    const [newFlags, setNewFlags] = useState<Record<string, boolean>>({})
    const [latestPreview, setLatestPreview] = useState<Record<string, { sender: string; text: string; time: string }>>({})
    // Pill 点击展开 preview strip
    const [expandedPill, setExpandedPill] = useState<string | null>(null)
    const [hoveredPill, setHoveredPill] = useState<string | null>(null)
    const [fadingPill, setFadingPill] = useState<string | null>(null)
    const pillHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pillFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Toast 提示
    const [toast, setToast] = useState<{ convId: string; sender: string; text: string } | null>(null)
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Urgent lockout state
    const [urgentConvId, setUrgentConvId] = useState<string | null>(null)
    const [urgentCountdown, setUrgentCountdown] = useState(0)
    const urgentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [preemptBanner, setPreemptBanner] = useState<string | null>(null)

    // omni context brief — lightweight listener, avoids full useWebSocket multi-instance
    const [omniContextBrief, setOmniContextBrief] = useState<any>(null)

    // P1 审计修复: 按 conversationId 存储最新客户情感
    const SENTIMENT_EMOJI: Record<string, string> = { positive: '😊', negative: '😠', neutral: '😐', mixed: '🤔' }
    const [sentimentMap, setSentimentMap] = useState<Record<string, { sentiment: string; score?: number }>>({})

    // W3: Channel filter
    const [channelFilter, setChannelFilter] = useState<string | null>(null)

    // Session rotation mapping: oldConversationId -> newConversationId
    const [rotatedSessions, setRotatedSessions] = useState<Record<string, string>>({})

    useEffect(() => {
        getAgentInfoFromStorage().then(info => {
            setAgentId(info.agentId)
            setUserId(info.userId)
            setAgentName(info.displayName || "Agent")
            setAgentAvatar(info.avatar)
        })
        chrome.storage.local.get(['token'], (r) => {
            if (DEMO_ENABLED && r.token === 'demo-mode-token') setIsDemo(true)
        })
    }, [])

    // omni:context_brief — via useMessageBus
    useMessageBus('omni:context_brief', (msg) => {
        setOmniContextBrief(msg.data?.brief || msg.data)
    })

    const loadInbox = useCallback(async () => {
        if (!agentId) return
        try {
            setLoading(true)
            const data = await fetchApi<{ data: Conversation[] }>(`/api/conversations/inbox?agentId=${agentId}`)
            let convs = data.data || []
            // Demo: 直接从 storage 读取 token + 已触发的会话，不依赖 isDemo state 的时序
            const stored = await new Promise<{ token?: string; convs: any[] }>(resolve => {
                chrome.storage.local.get(['token', 'demo_active_convs'], r => {
                    resolve({ token: r.token, convs: r.demo_active_convs || [] })
                })
            })
            if (DEMO_ENABLED && stored.token === 'demo-mode-token' && stored.convs.length > 0) {
                stored.convs.forEach((sc: any) => {
                    if (!convs.find(c => c._id === sc._id)) {
                        convs.push({
                            _id: sc._id, status: 'assigned', channel: sc.channel || 'webchat',
                            messageCount: 1, unreadCount: 1,
                            createdAt: new Date().toISOString(), metadata: sc.metadata || {},
                            subject: sc.subject
                        } as Conversation)
                    }
                })
                // 保留本地已 accept 的 conv status，避免覆盖 active → assigned
                setConversations(prev => {
                    const localStatusMap = new Map(prev.map(c => [c._id, c.status]))
                    return convs.map(c => {
                        const localStatus = localStatusMap.get(c._id)
                        if (localStatus && localStatus !== 'assigned' && c.status === 'assigned') {
                            return { ...c, status: localStatus }
                        }
                        return c
                    })
                })
            } else {
                setConversations(convs)
            }
        } catch (e) {
            console.error("[Inbox] Failed to load:", e)
        } finally {
            setLoading(false)
        }
    }, [agentId, fetchApi])

    const inboxTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (!agentId) return
        // Demo mode: load once from mock API but skip polling
        chrome.storage.local.get(['token'], (result) => {
            loadInbox()
            if (DEMO_ENABLED && result.token === 'demo-mode-token') return
            inboxTimerRef.current = setInterval(loadInbox, 10000)
        })
        return () => {
            if (inboxTimerRef.current) {
                clearInterval(inboxTimerRef.current)
                inboxTimerRef.current = null
            }
        }
    }, [agentId, loadInbox])

    // Auto-open: if exactly 1 conversation and none is active, open it directly
    useEffect(() => {
        if (!activeConv && conversations.length === 1) {
            openConv(conversations[0]._id)
        }
    }, [conversations])

    useEffect(() => {
        const listener = (msg: any) => {
            if (msg.type?.startsWith("omni:")) {
                // 生产环境: server 是 SSOT，omni 事件触发 reload
                // Demo 模式: 新会话已在 omni:new_conversation handler 本地追加，不 reload 避免覆盖已 accept 的 status
                if (msg.type === 'omni:new_conversation') {
                    if (!isDemo) loadInbox()
                } else if (!isDemo && msg.type !== 'omni:toxic_alert') {
                    loadInbox()
                }
                if (activeConv && msg.data?.conversationId === activeConv) {
                    // In demo mode, skip loadMessages too — messages come via omni:customer_message events
                    // loadMessages would just return stale mock data
                }
            }
            // Capture copilot signals (CRM lookup, suggestion, action draft, summary)
            const signalTypes: Record<string, CopilotSignal['type']> = {
                'omni:suggestion': 'suggestion',
                'omni:action_draft': 'action_draft',
                'omni:summary': 'summary',
                'omni:outcome': 'outcome',
                'omni:crm_lookup': 'crm_lookup',
                'omni:template_recommendation': 'template_recommendation',
            }
            const signalType = signalTypes[msg.type]
            const signalConvId = msg.data?.conversationId || msg.data?.sessionId
            if (signalType && signalConvId) {
                if (signalType === 'suggestion' && Array.isArray(msg.data?.suggestions)) {
                    handleBatchSuggestions(signalConvId, msg.data.suggestions)
                    return
                }
                const normalizedData = signalType === 'suggestion'
                    ? { ...msg.data, text: msg.data.text || msg.data.suggestion || '' }
                    : msg.data
                handleSignal(signalConvId, signalType, normalizedData)
            }
            // Coach whisper
            if (msg.type === 'coach:message' && activeConv) {
                handleCoach(activeConv, msg.data)
            }
            // Visitor disconnected warning
            if (msg.type === 'omni:visitor_disconnected' && msg.data?.conversationId === activeConv) {
                const graceSec = Math.round((msg.data.gracePeriodMs || 30000) / 1000)
                setDisconnectWarning(`⚠️ Visitor disconnected — auto-resolve in ${graceSec}s if not reconnected`)
            }
            // Visitor reconnected — clear warning
            if (msg.type === 'omni:visitor_reconnected' && msg.data?.conversationId === activeConv) {
                setDisconnectWarning('✅ Visitor reconnected')
                setTimeout(() => setDisconnectWarning(null), 3000)
            }
            // Server prompts agent to resolve (after visitor disconnect grace period)
            if (msg.type === 'omni:resolve_prompt' && msg.data?.conversationId) {
                if (activeConv !== msg.data.conversationId) {
                    openConv(msg.data.conversationId)
                }
                setShowOutcome(true)
                setDisconnectWarning(null)
            }
            // Session Reopened (Phase 5)
            if (msg.type === 'omni:conversation_reopened' && msg.data?.conversationId) {
                const convId = msg.data.conversationId
                setConversations(prev => prev.map(c => c._id === convId ? { ...c, status: 'active' } : c))
                // Locally inject system message if it's the active view
                if (activeConv === convId) {
                    setMessages(prev => {
                        // avoid duplicate system message immediately
                        const exists = prev.find(m => m.content_text === '🔄 Conversation reopened by customer.' && Date.now() - new Date(m.created_at).getTime() < 5000);
                        if (exists) return prev;
                        return [...prev, {
                            message_id: `sys-reopen-${Date.now()}`,
                            sender_name: 'System',
                            sender_role: 'system',
                            content_type: 'system',
                            content_text: '🔄 Conversation reopened by customer.',
                            created_at: new Date().toISOString()
                        }]
                    })
                    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
                }
                if (!isDemo) loadInbox()
            }
            // Session Rotated (Phase 5)
            if (msg.type === 'chat:session_rotated' && msg.data?.oldConversationId) {
                setRotatedSessions(prev => ({ ...prev, [msg.data.oldConversationId]: msg.data.newConversationId }))
                if (!isDemo) loadInbox()
            }
            // --- Live Messages (OmniChannel) ---
            if (msg.type === 'omni:customer_message' || msg.type === 'omni:agent_message') {
                const d = msg.data
                const newMsg: Message = {
                    message_id: d.messageId || d._id,
                    sender_name: d.sender?.name || 'Customer',
                    sender_role: d.sender?.role || 'visitor',
                    content_text: d.text || d.content?.text || '',
                    created_at: d.createdAt || new Date().toISOString()
                }
                const targetConvId = d.conversationId || d.channelId
                // agent 消息到达 = 会话已被 accept，同步 status
                if (newMsg.sender_role === 'agent' && targetConvId) {
                    setConversations(prev => prev.map(c =>
                        c._id === targetConvId && c.status === 'assigned' ? { ...c, status: 'active' } : c
                    ))
                }
                if (targetConvId === activeConv) {
                    // 当前对话：直接追加
                    setMessages(prev => {
                        if (prev.find(m => m.message_id === newMsg.message_id)) return prev
                        return [...prev, newMsg]
                    })
                    // 滚动到最新消息（不越过 signal 卡片）
                    setTimeout(() => {
                        const container = messagesEndRef.current?.parentElement
                        const msgEls = container?.querySelectorAll('[data-msg-id]')
                        const last = msgEls?.[msgEls.length - 1]
                        if (last) last.scrollIntoView({ behavior: 'smooth', block: 'end' })
                    }, 50)
                } else if (targetConvId) {
                    // 其他对话：更新缓存 + 标记有新消息 + 预览
                    const cached = messagesCacheRef.current[targetConvId] || []
                    if (!cached.find(m => m.message_id === newMsg.message_id)) {
                        messagesCacheRef.current[targetConvId] = [...cached, newMsg]
                    }
                    setNewFlags(prev => ({ ...prev, [targetConvId]: true }))
                    const previewText = (d.text || d.content?.text || '').slice(0, 60)
                    setLatestPreview(prev => ({
                        ...prev,
                        [targetConvId]: {
                            sender: d.sender?.name || 'Customer',
                            text: previewText,
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }
                    }))
                    // Toast
                    setToast({ convId: targetConvId, sender: d.sender?.name || 'Customer', text: previewText })
                    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
                    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
                }
            }
            // Visitor typing indicator
            if (msg.type === 'omni:typing' && msg.data?.conversationId === activeConv) {
                setVisitorTyping(msg.data.isTyping)
                if (msg.data.isTyping) setTimeout(() => setVisitorTyping(false), 3000)
            }
            // P1 #5: Chrome desktop notification for new conversations
            if (msg.type === 'omni:new_conversation') {
                const name = msg.data?.metadata?.visitorName || 'New visitor'
                chrome.notifications?.create?.({ type: 'basic', iconUrl: 'icon-128.png', title: '💬 New Chat', message: `${name} is waiting`, priority: 2 })

                // --- Inject Mock Conversation into list for Demo display (编译时 flag 控制) ---
                const isDemo = DEMO_ENABLED && (msg.data?.metadata?.visitorName === "Angry VIP Customer");
                if (isDemo || (DEMO_ENABLED && msg.data?.id?.startsWith('demo-'))) {
                    setConversations(prev => {
                        // Prevent duplicates
                        if (prev.find(c => c._id === (msg.data.id || msg.data._id))) return prev;
                        return [{
                            _id: msg.data.id || msg.data._id,
                            status: 'assigned', // Automatically assign to surface it quickly
                            channel: msg.data.channel || 'webchat',
                            messageCount: 0,
                            unreadCount: 1,
                            createdAt: new Date().toISOString(),
                            metadata: msg.data.metadata || {}
                        }, ...prev]
                    });
                }

                // Urgent lockout: auto-open + start countdown
                if (msg.data?.urgentLock) {
                    const cid = msg.data?._id || msg.data?.conversationId || msg.data?.id
                    if (cid) {
                        setUrgentConvId(cid)
                        setUrgentCountdown(30)
                        openConv(cid)
                    }
                }
            }
            // Preemption: show banner
            if (msg.type === 'omni:conversation_preempted') {
                setPreemptBanner(msg.data?.reason || 'Conversation preempted for higher priority')
                setTimeout(() => setPreemptBanner(null), 8000)
                loadInbox()
            }
            // Toxic alert banner
            if (msg.type === 'omni:toxic_alert') {
                setPreemptBanner(`🛡️ Toxic content detected (score: ${((msg.data?.toxicScore || 0) * 100).toFixed(0)}%)`)
                setTimeout(() => setPreemptBanner(null), 10000)
            }
            // P1: Customer sentiment — 更新 map + 消息流追加系统消息
            if (msg.type === 'omni:customer_sentiment' && msg.data?.conversationId) {
                const { conversationId: cid, sentiment, score } = msg.data
                setSentimentMap(prev => ({ ...prev, [cid]: { sentiment, score } }))
                const emoji = SENTIMENT_EMOJI[sentiment?.toLowerCase()] || '💬'
                const pct = score ? ` (${Math.round(score * 100)}%)` : ''
                // 在当前活跃对话的消息流中追加系统消息
                if (cid === activeConv) {
                    setMessages(prev => [...prev, {
                        message_id: `sys-sentiment-${Date.now()}`,
                        sender_name: 'System',
                        sender_role: 'system',
                        content_type: 'system',
                        content_text: `${emoji} Customer sentiment: ${sentiment}${pct}`,
                        created_at: new Date().toISOString()
                    }])
                }
            }
            // P1: Conversation transferred out — banner + 移除 + 退回列表
            if (msg.type === 'omni:conversation_transferred' && msg.data?.direction === 'out') {
                const cid = msg.data.conversationId
                const label = msg.data.forcedByAdmin ? '🔀 Supervisor transferred this conversation' : '🔀 Conversation transferred'
                setPreemptBanner(label)
                setTimeout(() => setPreemptBanner(null), 6000)
                setConversations(prev => prev.filter(c => c._id !== cid))
                if (activeConv === cid) setActiveConv(null)
                if (!isDemo) loadInbox()
            }
        }
        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [loadInbox, activeConv])

    // Queue count: initial fetch + listen for updates
    // Queue count: initial fetch + messagebus subscription
    useEffect(() => {
        fetchApi<{ data: { queued: number } }>('/api/conversations/queue-count')
            .then(res => setQueueCount(res.data?.queued ?? 0))
            .catch(() => { })
    }, [fetchApi])
    useMessageBus('omni:queue_update', (msg) => {
        if (msg.data?.queued !== undefined) setQueueCount(msg.data.queued)
    })

    // Urgent countdown timer
    useEffect(() => {
        if (!urgentConvId || urgentCountdown <= 0) {
            if (urgentTimerRef.current) clearInterval(urgentTimerRef.current)
            if (urgentCountdown <= 0 && urgentConvId) {
                // Timeout — clear urgent lock
                setUrgentConvId(null)
            }
            return
        }
        urgentTimerRef.current = setInterval(() => {
            setUrgentCountdown(prev => prev - 1)
        }, 1000)
        return () => { if (urgentTimerRef.current) clearInterval(urgentTimerRef.current) }
    }, [urgentConvId, urgentCountdown])

    // Clear urgent lock when accepted
    useEffect(() => {
        if (!urgentConvId) return
        const conv = conversations.find(c => c._id === urgentConvId)
        if (conv?.status === 'active') {
            setUrgentConvId(null)
            setUrgentCountdown(0)
        }
    }, [conversations, urgentConvId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const extractLastVisitorPreview = (convId: string, msgs: Message[]) => {
        const lastVisitor = [...msgs].reverse().find(m => m.sender_role === 'visitor' || m.sender_role === 'customer')
        if (lastVisitor) {
            setLatestPreview(prev => ({
                ...prev,
                [convId]: {
                    sender: lastVisitor.sender_name,
                    text: (lastVisitor.content_text || '').slice(0, 80),
                    time: formatMsgTime(lastVisitor.created_at)
                }
            }))
        }
    }

    // pill 展开时按需加载消息预览
    useEffect(() => {
        if (!expandedPill || latestPreview[expandedPill]) return
        fetchApi<{ data: { messages: Message[] } }>(`/api/conversations/${expandedPill}?limit=5`)
            .then(data => {
                const msgs = data.data?.messages || []
                if (msgs.length) {
                    messagesCacheRef.current[expandedPill] = msgs
                    extractLastVisitorPreview(expandedPill, msgs)
                }
            })
            .catch(() => { })
    }, [expandedPill])

    const loadMessages = async (convId: string) => {
        try {
            const data = await fetchApi<{ data: { conversation: any; messages: Message[] } }>(`/api/conversations/${convId}`)
            const msgs = data.data?.messages || []
            setMessages(msgs)
            messagesCacheRef.current[convId] = msgs
            extractLastVisitorPreview(convId, msgs)
            setHasOlderMessages(msgs.length >= 50)
        } catch (e) {
            console.error("[Inbox] Failed to load messages:", e)
        }
    }

    const loadOlderMessages = async () => {
        if (!activeConv || messages.length === 0) return
        const oldestSeq = messages[0]?.sequence
        if (!oldestSeq) return
        try {
            const data = await fetchApi<{ data: { messages: Message[] } }>(`/api/conversations/${activeConv}?beforeSeq=${oldestSeq}&limit=30`)
            const older = data.data?.messages || []
            if (older.length === 0) { setHasOlderMessages(false); return }
            setMessages(prev => {
                const merged = [...older, ...prev]
                messagesCacheRef.current[activeConv!] = merged
                return merged
            })
            setHasOlderMessages(older.length >= 30)
        } catch (e) { console.error('[Inbox] Failed to load older:', e) }
    }

    const openConv = (convId: string) => {
        // 保存当前对话草稿
        if (activeConv && replyText.trim()) {
            draftCacheRef.current[activeConv] = replyText
        }
        // 保存当前消息到缓存
        if (activeConv) {
            messagesCacheRef.current[activeConv] = messages
        }
        setActiveConv(convId)
        setHasOlderMessages(true)
        // 清除该对话的新消息标记
        setNewFlags(prev => { const n = { ...prev }; delete n[convId]; return n })
        // 恢复草稿
        setReplyText(draftCacheRef.current[convId] || '')
        // 优先用缓存，避免重复 fetch
        const cached = messagesCacheRef.current[convId]
        if (cached && cached.length > 0) {
            setMessages(cached)
        } else {
            loadMessages(convId)
        }
        // 同步 PiP：广播当前活跃会话信息
        const conv = conversations.find(c => c._id === convId)
        if (conv) {
            const pipMsgs = (cached || []).map(m => ({
                id: m.message_id, role: m.sender_role || 'visitor',
                name: m.sender_name || 'Customer', text: m.content_text || '',
                time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            }))
            chrome.runtime.sendMessage({
                type: 'pip:switchConversation',
                data: {
                    id: convId,
                    channel: conv.channel || 'webchat',
                    status: conv.status || 'active',
                    visitorName: conv.metadata?.visitorName || conv.metadata?.visitorEmail || 'Visitor',
                    messages: pipMsgs,
                }
            }).catch(() => { })
        }
    }

    // P2 #11: Elapsed timer
    useEffect(() => {
        if (elapsedRef.current) clearInterval(elapsedRef.current)
        if (!activeConv) { setElapsed(''); return }
        const conv = conversations.find(c => c._id === activeConv)
        if (!conv?.createdAt) { setElapsed(''); return }
        const start = new Date(conv.createdAt).getTime()
        const tick = () => {
            const diff = Math.floor((Date.now() - start) / 1000)
            const m = Math.floor(diff / 60), s = diff % 60
            setElapsed(`${m}:${s.toString().padStart(2, '0')}`)
        }
        tick()
        elapsedRef.current = setInterval(tick, 1000)
        return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
    }, [activeConv, conversations])

    const acceptConv = async (convId: string) => {
        if (!agentId) return
        try {
            await fetchApi(`/api/conversations/${convId}/accept`, {
                method: "POST",
                body: JSON.stringify({ agentId })
            })
            // Demo interactive follow-up: customer reacts to acceptance
            if (isDemo && convId.startsWith('demo-')) {
                chrome.runtime.sendMessage({ type: 'demo:omni_accept', convId })
                // Locally update status so UI shows active state
                setConversations(prev => prev.map(c => c._id === convId ? { ...c, status: 'active' } : c))
            } else {
                loadInbox()
            }
            // 同步 PiP 切到这个会话
            const conv = conversations.find(c => c._id === convId)
            if (conv) {
                chrome.runtime.sendMessage({
                    type: 'pip:switchConversation',
                    data: {
                        id: convId,
                        channel: conv.channel || 'webchat',
                        status: 'active',
                        visitorName: conv.metadata?.visitorName || conv.metadata?.visitorEmail || 'Visitor',
                        messages: (messagesCacheRef.current[convId] || messages || []).map(m => ({
                            id: m.message_id, role: m.sender_role || 'visitor',
                            name: m.sender_name || 'Customer', text: m.content_text || '',
                            time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                        })),
                    }
                }).catch(() => { })
            }
        } catch (e) {
            console.error("[Inbox] Failed to accept:", e)
        }
    }

    const sendReply = async () => {
        if (!activeConv || !replyText.trim() || !userId) return
        try {
            // Auto-accept on first reply if still assigned
            const conv = conversations.find(c => c._id === activeConv)
            if (conv?.status === 'assigned') {
                await acceptConv(activeConv)
            }
            const sentText = replyText.trim()
            await fetchApi(`/api/conversations/${activeConv}/reply`, {
                method: "POST",
                body: JSON.stringify({ senderId: userId, senderName: agentName, senderAvatar: agentAvatar || '', text: sentText })
            })
            // Immediately show agent message in UI
            if (isDemo) {
                const agentMsgId = `msg-agent-${Date.now()}`
                setMessages(prev => [...prev, {
                    message_id: agentMsgId,
                    sender_name: agentName,
                    sender_role: 'agent',
                    content_text: sentText,
                    created_at: new Date().toISOString()
                }])
                // 广播给 PiP 等其他监听者
                chrome.runtime.sendMessage({
                    type: 'omni:agent_message',
                    data: {
                        messageId: agentMsgId,
                        conversationId: activeConv,
                        sender: { id: userId, name: agentName, role: 'agent' },
                        text: sentText,
                        createdAt: new Date().toISOString(),
                    }
                }).catch(() => { })
                chrome.runtime.sendMessage({ type: 'demo:omni_reply', text: sentText, convId: activeConv })
            } else {
                loadMessages(activeConv)
            }
            setReplyText("")
        } catch (e) {
            console.error("[Inbox] Failed to send reply:", e)
        }
    }

    const unassignedSendTemplate = async (templateId: string, lang?: string, vars?: Record<string, string>) => {
        if (!activeConv || !userId) return
        try {
            const conv = conversations.find(c => c._id === activeConv)
            if (conv?.status === 'assigned') {
                await acceptConv(activeConv)
            }
            await fetchApi(`/api/conversations/${activeConv}/send-template`, {
                method: "POST",
                body: JSON.stringify({
                    senderId: userId, senderName: agentName, senderAvatar: agentAvatar || '',
                    templateId,
                    language: lang || previewLang || 'en',
                    variables: vars || previewVars || {},
                })
            })
            setShowTemplates(false)
            setPreviewTemplate(null)
            setPreviewVars({})
            if (isDemo) {
                // Don't reload from API — handled below
            } else {
                loadMessages(activeConv)
            }
        } catch (e) {
            console.error("[Inbox] Failed to send template:", e)
        }
    }

    // Demo-specific: send template and trigger follow-up
    const demoSendTemplate = (templateName: string) => {
        if (!activeConv) return
        // Auto-accept if still assigned
        const conv = conversations.find(c => c._id === activeConv)
        if (conv?.status === 'assigned') {
            setConversations(prev => prev.map(c => c._id === activeConv ? { ...c, status: 'active' } : c))
        }
        // 1. Render agent template message immediately
        const templateText = `📎 [Template: ${templateName}]\n\nDear valued customer,\n\nWe sincerely apologize for the inconvenience. As a gesture of our appreciation for your loyalty, we have issued a $50 voucher to your account (Code: VIP-RETAIN-7X92).\n\nWe value your business and are committed to improving your experience.\n\nBest regards,\nCXMind Support Team`
        const tmplMsgId = `msg-template-${Date.now()}`
        setMessages(prev => [...prev, {
            message_id: tmplMsgId,
            sender_name: agentName,
            sender_role: 'agent',
            content_text: templateText,
            created_at: new Date().toISOString()
        }])
        // 广播给 PiP 等其他监听者
        chrome.runtime.sendMessage({
            type: 'omni:agent_message',
            data: {
                messageId: tmplMsgId,
                conversationId: activeConv,
                sender: { id: userId, name: agentName, role: 'agent' },
                text: templateText,
                createdAt: new Date().toISOString(),
            }
        }).catch(() => { })
        // Remove template_recommendation card
        setCopilotSignals(prev => {
            const c = { ...prev }
            if (c[activeConv]) { c[activeConv] = c[activeConv].filter(s => s.type !== 'template_recommendation') }
            return c
        })
        // 2. Trigger customer follow-up via DemoStreamer
        chrome.runtime.sendMessage({ type: 'demo:omni_reply', text: templateText })
    }

    // Open template preview
    const openTemplatePreview = (tmpl: any) => {
        setPreviewTemplate(tmpl)
        // Default to first available language
        const langs = (tmpl.translations || []).map((t: any) => t.language)
        setPreviewLang(langs[0] || 'en')
        // 从body提取变量占位符
        const trans = tmpl.translations?.[0]
        const bodyComp = trans?.components?.find((c: any) => c.type === 'BODY')
        const matches = bodyComp?.text?.match(/\{\{(\w+)\}\}/g) || []
        const varMap: Record<string, string> = {}
        matches.forEach((m: string) => { varMap[m.replace(/[{}]/g, '')] = '' })
        setPreviewVars(varMap)
    }

    // Get rendered preview text for current language
    const getPreviewText = (): { header?: string; body?: string; footer?: string; buttons?: any[] } => {
        if (!previewTemplate) return {}
        const trans = previewTemplate.translations?.find((t: any) => t.language === previewLang)
            || previewTemplate.translations?.[0]
        if (!trans) return {}
        const replaceVars = (s: string) => s?.replace(/\{\{(\w+)\}\}/g, (m: string, k: string) => previewVars[k] || m) || ''
        const header = trans.components?.find((c: any) => c.type === 'HEADER')
        const body = trans.components?.find((c: any) => c.type === 'BODY')
        const footer = trans.components?.find((c: any) => c.type === 'FOOTER')
        const buttons = trans.components?.find((c: any) => c.type === 'BUTTONS')
        return {
            header: header?.text ? replaceVars(header.text) : undefined,
            body: body?.text ? replaceVars(body.text) : undefined,
            footer: footer?.text ? replaceVars(footer.text) : undefined,
            buttons: buttons?.buttons,
        }
    }

    const resolveWithReason = async (reason: string) => {
        if (!activeConv) return
        try {
            await fetchApi(`/api/conversations/${activeConv}/resolve`, {
                method: "POST",
                body: JSON.stringify({ reason })
            })
            // Demo: trigger AI summary generation
            if (isDemo) chrome.runtime.sendMessage({ type: 'demo:omni_resolve', convId: activeConv })
            setShowOutcome(false)
            setDisconnectWarning(null)
            if (!isDemo) loadInbox()
        } catch (e) {
            console.error("[Inbox] resolve failed:", e)
        }
    }

    // ── Thread View ──
    if (activeConv) {
        const conv = conversations.find(c => c._id === activeConv)
        const name = conv?.metadata?.visitorName || conv?.contactId?.displayName || "Customer"
        const icon = CHANNEL_ICONS[conv?.channel || "webchat"] || "💬"
        const isNotAccepted = conv?.status === 'assigned'
        const disabledBtnStyle = { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' as const }

        // 其他对话列表 (用于 Rail)
        const otherConvs = conversations.filter(c => c._id !== activeConv && c.status !== 'resolved')
        const getInitials = (c: Conversation) => {
            const n = c.metadata?.visitorName || c.contactId?.displayName || ''
            return n.charAt(0).toUpperCase() || '?'
        }

        // Pill hover handlers — 500ms 激活 + 2.5s 渐隐 = 3s 自动已读
        const onPillEnter = (convId: string) => {
            if (pillHoverTimerRef.current) clearTimeout(pillHoverTimerRef.current)
            if (pillFadeTimerRef.current) clearTimeout(pillFadeTimerRef.current)
            setHoveredPill(convId)
            if (!newFlags[convId]) return
            // 500ms 激活延迟防误触
            pillHoverTimerRef.current = setTimeout(() => {
                setFadingPill(convId)
                pillFadeTimerRef.current = setTimeout(() => {
                    setNewFlags(prev => { const n = { ...prev }; delete n[convId]; return n })
                    setFadingPill(null)
                }, 2500)
            }, 500)
        }
        const onPillLeave = () => {
            if (pillHoverTimerRef.current) clearTimeout(pillHoverTimerRef.current)
            if (pillFadeTimerRef.current) clearTimeout(pillFadeTimerRef.current)
            setHoveredPill(null)
            setFadingPill(null)
        }

        return (
            <div ref={chatContainerRef as any} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div className="inbox-thread-header">
                    <button onClick={() => { if (activeConv && replyText.trim()) draftCacheRef.current[activeConv] = replyText; if (activeConv) messagesCacheRef.current[activeConv] = messages; setActiveConv(null); setMessages([]); if (!conversations.length && onBack) onBack() }} className="chat-back-btn">
                        <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <div className="inbox-thread-info">
                        <div className="inbox-thread-name">{name}</div>
                        <div className="inbox-thread-meta">
                            {conv?.metadata?.visitorEmail && <span>📧 {conv.metadata.visitorEmail} · </span>}
                            {conv?.channel} · {conv?.status} · {conv?.messageCount} messages
                            {elapsed && <span> · ⏱️ {elapsed}</span>}
                        </div>
                    </div>

                    {/* 窄屏: header 内嵌 mini pills */}
                    {!chatIsWide && otherConvs.length > 0 && (
                        <div className="conv-rail-inline">
                            {otherConvs.slice(0, 4).map(c => {
                                const ini = getInitials(c)
                                const hasNew = newFlags[c._id]
                                const isFading = fadingPill === c._id
                                const isExpanded = expandedPill === c._id
                                return (
                                    <div key={c._id} className="conv-pill-wrap"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setExpandedPill(prev => prev === c._id ? null : c._id)
                                        }}
                                        onMouseEnter={() => onPillEnter(c._id)}
                                        onMouseLeave={onPillLeave}
                                    >
                                        <div className={`conv-pill ${hasNew ? 'has-new' : ''} ${isExpanded ? 'expanded' : ''}`}
                                            title={c.metadata?.visitorName || 'Customer'}
                                        >
                                            {ini}
                                            {hasNew && <span className={`conv-new-dot ${isFading ? 'fading' : ''}`} />}
                                            {sentimentMap[c._id] && <span style={{ position: 'absolute', bottom: -2, right: -2, fontSize: 10, lineHeight: 1 }}>{SENTIMENT_EMOJI[sentimentMap[c._id].sentiment?.toLowerCase()] || '💬'}</span>}
                                        </div>
                                    </div>
                                )
                            })}
                            {otherConvs.length > 4 && (
                                <div className="conv-pill overflow" title={`+${otherConvs.length - 4} more`}>+{otherConvs.length - 4}</div>
                            )}
                        </div>
                    )}

                    {/* SLA wait time indicator */}
                    {conv?.status === 'active' && conv?.lastMessageAt && (() => {
                        const lastMsg = messages[messages.length - 1]
                        const isVisitorMsg = lastMsg?.sender_role === 'visitor'
                        if (!isVisitorMsg) return null
                        const waitMs = Date.now() - new Date(conv.lastMessageAt).getTime()
                        const waitMin = Math.floor(waitMs / 60000)
                        const isUrgent = waitMin >= 5
                        return (
                            <div style={{
                                fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                                background: isUrgent ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
                                color: isUrgent ? '#ef4444' : '#f59e0b',
                                flexShrink: 0,
                            }}>
                                ⏱ {waitMin}m
                            </div>
                        )
                    })()}
                </div>

                {/* 窄屏 Preview strip: 渲染在 header 外面，避免破坏 header flex 布局 */}
                {!chatIsWide && expandedPill && (() => {
                    const ec = otherConvs.find(c => c._id === expandedPill)
                    if (!ec) return null
                    const preview = latestPreview[expandedPill]
                    const visitorName = ec.metadata?.visitorName || 'Customer'
                    return (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 12px',
                            background: 'rgba(99,102,241,0.06)',
                            borderBottom: '1px solid var(--glass-border)',
                            fontSize: '0.72rem', color: 'var(--text-primary)',
                        }}>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.68rem' }}>{visitorName}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.64rem', lineHeight: 1.4 }}>
                                    {preview ? preview.text : 'Loading...'}
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setExpandedPill(null); openConv(expandedPill) }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 3,
                                    padding: '3px 8px', borderRadius: 6, border: 'none',
                                    background: 'var(--primary, #6366f1)', color: '#fff',
                                    fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer',
                                    flexShrink: 0, fontFamily: 'inherit',
                                }}
                            >
                                Open →
                            </button>
                        </div>
                    )
                })()}

                {chatIsWide && otherConvs.length > 0 && (
                    <div className="conv-rail-bar">
                        {otherConvs.map(c => {
                            const ini = getInitials(c)
                            const cIcon = CHANNEL_ICONS[c.channel] || '💬'
                            const cName = c.metadata?.visitorName || c.contactId?.displayName || 'Customer'
                            const hasNew = newFlags[c._id]
                            const isFading = fadingPill === c._id
                            const preview = latestPreview[c._id]
                            const isExpanded = expandedPill === c._id
                            return (
                                <div key={c._id} className={`conv-rail-item ${hasNew ? 'has-new' : ''} ${isExpanded ? 'expanded' : ''}`}
                                    onClick={() => setExpandedPill(prev => prev === c._id ? null : c._id)}
                                    onMouseEnter={() => onPillEnter(c._id)}
                                    onMouseLeave={onPillLeave}
                                >
                                    <div className="conv-rail-avatar">
                                        {ini}
                                        {hasNew && <span className={`conv-new-dot ${isFading ? 'fading' : ''}`} />}
                                        {sentimentMap[c._id] && <span style={{ position: 'absolute', bottom: -1, right: -1, fontSize: 10, lineHeight: 1 }}>{SENTIMENT_EMOJI[sentimentMap[c._id].sentiment?.toLowerCase()] || '💬'}</span>}
                                    </div>
                                    <div className="conv-rail-info" style={{ flex: 1 }}>
                                        <div className="conv-rail-name">{cIcon} {cName}</div>
                                        <div className="conv-rail-preview" style={isExpanded ? { whiteSpace: 'normal', overflow: 'visible' } : undefined}>
                                            {preview ? `${preview.sender}: ${preview.text}` : `${c.channel || 'chat'} · ${c.messageCount || 0} msgs`}
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setExpandedPill(null); openConv(c._id) }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 3,
                                                padding: '3px 8px', borderRadius: 6, border: 'none',
                                                background: 'var(--primary, #6366f1)', color: '#fff',
                                                fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer',
                                                flexShrink: 0, fontFamily: 'inherit',
                                            }}
                                        >
                                            Open →
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Toast: 其他对话新消息提示 */}
                {toast && (
                    <div className="conv-toast" onClick={() => { setToast(null); openConv(toast.convId) }}>
                        <span style={{ fontWeight: 600 }}>💬 {toast.sender}:</span> {toast.text}
                    </div>
                )}

                {/* Session Rotated Banner */}
                {rotatedSessions[activeConv] && (
                    <div style={{
                        margin: '8px 12px 0',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        alignItems: 'center',
                        animation: 'slideIn 0.3s ease-out'
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444', textAlign: 'center' }}>
                            ℹ️ Session closed. Customer started a new conversation.
                        </div>
                        <button
                            onClick={() => openConv(rotatedSessions[activeConv])}
                            style={{
                                padding: '6px 16px', borderRadius: 6, border: 'none',
                                background: '#ef4444', color: '#fff', cursor: 'pointer',
                                fontSize: '0.7rem', fontWeight: 600,
                            }}
                        >
                            Open New Session
                        </button>
                    </div>
                )}

                {/* master-detail 布局容器 */}
                <div className={`chat-thread-body ${chatIsWide ? 'wide' : ''}`}>

                    {/* Left: Chat main area (messages + reply) */}
                    <div className="chat-main">

                        {/* 窄屏模式: widgets 在消息上方 */}
                        {!chatIsWide && (
                            <div style={{ padding: '0 4px 2px', flexShrink: 0 }}>
                                <ContactContext360
                                    email={conv?.metadata?.visitorEmail}
                                    visitorId={conv?.metadata?.visitorId}
                                    contactId={typeof conv?.contactId === 'object' ? (conv.contactId as any)?._id : conv?.contactId}
                                    callerName={name}
                                    activeConvId={activeConv || undefined}
                                    contextBrief={omniContextBrief}
                                />


                            </div>
                        )}

                        <div className="inbox-messages">
                            {/* CRM Card — 窄屏内联（与宽屏统一样式） */}
                            {!chatIsWide && activeConv && (() => {
                                const crmSig = (copilotSignals[activeConv] || []).find(s => s.type === 'crm_lookup')
                                if (!crmSig || crmSig.data?.status === 'loading') return null
                                return (
                                    <div style={{ margin: '4px 0' }}>
                                        <CollapsibleWidget title={`CRM: ${crmSig.data?.provider || 'CRM'}`} icon={<span>🔍</span>}
                                            collapsedHint={`${crmSig.data?.data?.name || ''}`} defaultCollapsed={true}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: '0.68rem' }}>
                                                <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {crmSig.data.data?.name}</div>
                                                <div><span style={{ color: 'var(--text-muted)' }}>Health:</span> <span style={{ color: '#ef4444', fontWeight: 600 }}>{crmSig.data.data?.healthScore}</span></div>
                                                <div><span style={{ color: 'var(--text-muted)' }}>LTV:</span> <span style={{ color: '#22c55e' }}>{crmSig.data.data?.lifetimeValue}</span></div>
                                                <div><span style={{ color: 'var(--text-muted)' }}>Tickets:</span> {crmSig.data.data?.recentTickets}</div>
                                            </div>
                                        </CollapsibleWidget>
                                    </div>
                                )
                            })()}
                            {hasOlderMessages && messages.length >= 50 && (
                                <button
                                    onClick={loadOlderMessages}
                                    style={{
                                        display: 'block', margin: '4px auto 8px', fontSize: '0.7rem',
                                        background: 'none', border: '1px solid var(--glass-border)',
                                        color: 'var(--text-muted)', padding: '4px 12px', borderRadius: 12, cursor: 'pointer',
                                    }}
                                >↑ Load older messages</button>
                            )}
                            {messages.length === 0 ? (
                                <div className="empty-state" style={{ paddingTop: 40 }}>
                                    <MessageSquare size={24} strokeWidth={1.5} />
                                    <p className="text-sm text-muted">No messages yet</p>
                                </div>
                            ) : messages.map((m) => {
                                if (m.content_type === 'system' || m.sender_role === 'system') {
                                    return (
                                        <div key={m.message_id} data-msg-id={m.message_id} style={{ textAlign: 'center', margin: '12px 0' }}>
                                            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)', padding: '4px 12px', borderRadius: 12, color: 'var(--text-muted)' }}>
                                                {m.content_text}
                                            </span>
                                        </div>
                                    )
                                }
                                return (
                                    <div key={m.message_id} data-msg-id={m.message_id} className={`inbox-msg ${m.sender_role}`}>
                                        <div className="inbox-msg-sender">{m.sender_name}</div>
                                        {m.content_type === 'template' ? (() => {
                                            try {
                                                const meta = typeof m.content_meta === 'string' ? JSON.parse(m.content_meta) : m.content_meta;
                                                const ast = meta?.ast;
                                                if (ast && ast.components) {
                                                    return (
                                                        <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, marginTop: 4, border: '1px solid var(--glass-border)' }}>
                                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <LayoutTemplate size={12} /> {meta.templateName || 'Template'}
                                                            </div>
                                                            {ast.components.map((c: any, i: number) => {
                                                                if (c.type === 'HEADER') {
                                                                    if (c.format === 'IMAGE') return <img key={i} src={c.url} alt="Header" style={{ width: '100%', borderRadius: 6, marginBottom: 8, objectFit: 'cover' }} />
                                                                    if (c.format === 'VIDEO') return <video key={i} src={c.url} controls style={{ width: '100%', borderRadius: 6, marginBottom: 8 }} />
                                                                    if (c.format === 'DOCUMENT') return <div key={i} style={{ padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 6, marginBottom: 8 }}>📄 {c.url?.split('/').pop() || 'Document'}</div>
                                                                    if (c.format === 'TEXT') return <strong key={i} style={{ display: 'block', marginBottom: 8 }}>{c.text}</strong>
                                                                }
                                                                if (c.type === 'BODY') return <div key={i} style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{c.text}</div>
                                                                if (c.type === 'FOOTER') return <div key={i} style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 8 }}>{c.text}</div>
                                                                if (c.type === 'BUTTONS' && c.buttons) return (
                                                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                        {c.buttons.map((b: any, j: number) => (
                                                                            <div key={j} style={{ textAlign: 'center', padding: '6px 0', borderTop: '1px solid var(--glass-border)', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600 }}>
                                                                                {b.type === 'URL' ? `↗ ${b.text}` : b.type === 'PHONE_NUMBER' ? `📞 ${b.text}` : b.text}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )
                                                                return null
                                                            })}
                                                        </div>
                                                    )
                                                }
                                            } catch (e) { }
                                            return <div>[Template message]</div>
                                        })() : (
                                            <div>{m.content_text}</div>
                                        )}
                                        <div className="inbox-msg-time">{formatMsgTime(m.created_at)}</div>
                                    </div>
                                )
                            })}

                            {/* Copilot Signal Cards — 仅窄屏内联，宽屏在侧边栏 */}
                            {!chatIsWide && activeConv && (copilotSignals[activeConv] || []).map(sig => {
                                // CRM已在顶部渲染，底部跳过
                                if (sig.type === 'crm_lookup') return null

                                // Loading skeleton for any signal type
                                if (sig.data?.status === 'loading') return (
                                    <div key={sig.id} style={{ background: 'rgba(120, 120, 140, 0.06)', border: '1px dashed rgba(120, 120, 140, 0.3)', padding: 10, borderRadius: 8, margin: '6px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(120, 120, 140, 0.3)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Loading {sig.type}...</span>
                                        </div>
                                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                                            <div style={{ height: 8, flex: 2, borderRadius: 4, background: 'rgba(120, 120, 140, 0.12)', animation: 'pulse 1.5s ease-in-out infinite 0.2s' }} />
                                            <div style={{ height: 8, flex: 1, borderRadius: 4, background: 'rgba(120, 120, 140, 0.12)', animation: 'pulse 1.5s ease-in-out infinite 0.4s' }} />
                                        </div>
                                    </div>
                                )
                                if (sig.type === 'suggestion') return (
                                    <div key={sig.id} style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: 10, borderRadius: 8, margin: '6px 0', animation: 'slideIn 0.3s ease-out' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a855f7', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} /> AI Suggestion</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{sig.data.text}</div>
                                        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <button disabled={isNotAccepted} onClick={() => setReplyText(sig.data.text)} style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #a855f7', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', cursor: 'pointer', fontWeight: 600, ...(isNotAccepted ? disabledBtnStyle : {}) }} title={isNotAccepted ? 'Accept conversation first' : ''}>📋 Use</button>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{sig.data.source}</span>
                                        </div>
                                    </div>
                                )
                                if (sig.type === 'action_draft') {
                                    return (
                                        <div key={`action-${sig.data.intentName}`} style={{ margin: '6px 0' }}>
                                            <ActionDraftCard
                                                draft={{
                                                    actionId: sig.data.intentName || sig.id,
                                                    intentSlug: sig.data.intentName,
                                                    intentName: sig.data.intentName,
                                                    status: sig.data.status === 'confirmed' || sig.data.draft?.status === 'EXECUTED' ? 'confirmed' : 'suggested',
                                                    draft: sig.data.draft,
                                                    originalDraft: sig.data.draft,
                                                }}
                                                onConfirm={() => {
                                                    if (isDemo) chrome.runtime.sendMessage({ type: 'demo:omni_approve' })
                                                    const intentToRemove = sig.data.intentName
                                                    setTimeout(() => {
                                                        setCopilotSignals(prev => {
                                                            const c = { ...prev }
                                                            if (c[activeConv!]) c[activeConv!] = c[activeConv!].filter(s => !(s.type === 'action_draft' && s.data?.intentName === intentToRemove))
                                                            return c
                                                        })
                                                    }, 5500)
                                                }}
                                                onReject={(_id: string, _reason: string) => {
                                                    setCopilotSignals(prev => {
                                                        const c = { ...prev }
                                                        if (c[activeConv!]) c[activeConv!] = c[activeConv!].filter(s => s.id !== sig.id)
                                                        return c
                                                    })
                                                }}
                                                onUpdate={() => { }}
                                                onReset={() => { }}
                                                disabled={isNotAccepted}
                                                disabledHint="Accept conversation first"
                                            />
                                        </div>
                                    )
                                }
                                if (sig.type === 'summary') {
                                    const isSummaryLoading = sig.data?.status === 'loading'
                                    // 统一格式: data.summary 或兼容旧 data.ai_summary
                                    const sumData = sig.data?.summary || sig.data?.ai_summary
                                    return (
                                        <div key={sig.id} style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: 10, borderRadius: 8, margin: '6px 0', animation: 'slideIn 0.3s ease-out' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', marginBottom: 4 }}>📝 AI Summary</div>
                                            {isSummaryLoading ? (
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 6 }}>Generating conversation summary...</div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <div style={{ height: 8, flex: 3, borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                                        <div style={{ height: 8, flex: 1, borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', animation: 'pulse 1.5s ease-in-out infinite 0.3s' }} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{sumData?.raw_summary}</div>
                                                    {sumData?.topics && (
                                                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                                            {(typeof sumData.topics === 'string' ? JSON.parse(sumData.topics) : sumData.topics).map((t: string) => <span key={t} style={{ fontSize: '0.58rem', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', padding: '1px 6px', borderRadius: 8 }}>#{t}</span>)}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )
                                }
                                if (sig.type === 'template_recommendation') return (
                                    <div key={sig.id} style={{ background: 'rgba(236, 72, 153, 0.08)', border: '1px solid rgba(236, 72, 153, 0.3)', padding: 10, borderRadius: 2, margin: '6px 0', animation: 'slideIn 0.3s ease-out' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><LayoutTemplate size={12} /> AI Template Match</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{sig.data.reasoning || 'Suggested template based on context.'}</div>
                                        <div style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 2, marginTop: 6, border: '1px solid var(--glass-border)', fontSize: '0.7rem' }}>
                                            <div style={{ fontWeight: 600 }}>{sig.data.templateName}</div>
                                        </div>
                                        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                                            <button disabled={isNotAccepted} onClick={() => isDemo ? demoSendTemplate(sig.data.templateName) : unassignedSendTemplate(sig.data.templateId)} style={{ fontSize: '0.65rem', padding: '4px 8px', borderRadius: 2, border: 'none', background: '#ec4899', color: '#fff', cursor: 'pointer', fontWeight: 600, ...(isNotAccepted ? disabledBtnStyle : {}) }} title={isNotAccepted ? 'Accept conversation first' : ''}>📎 Send Template</button>
                                        </div>
                                    </div>
                                )
                                if (sig.type === 'outcome') {
                                    return (
                                        <div key={sig.id} style={{ margin: '6px 0', animation: 'slideIn 0.3s ease-out' }}>
                                            <OutcomeCard
                                                outcome={sig.data.outcome || 'unknown'}
                                                confidence={sig.data.confidence || 0}
                                                reasoning={sig.data.reasoning || ''}
                                                sessionId={sig.data.sessionId}
                                            />
                                        </div>
                                    )
                                }
                                if (sig.type === 'coach') return null
                                return null
                            })}

                            {visitorTyping && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 0', fontStyle: 'italic' }}>
                                    💬 Visitor is typing...
                                </div>
                            )}
                            {disconnectWarning && (
                                <div style={{ textAlign: 'center', color: '#f59e0b', fontSize: '0.7rem', padding: '6px' }}>
                                    {disconnectWarning}
                                </div>
                            )}
                            {/* Coach Whisper — 仅窄屏（宽屏在侧边栏渲染） */}
                            {!chatIsWide && activeConv && (() => {
                                const coachSig = (copilotSignals[activeConv] || []).find(s => s.type === 'coach')
                                if (!coachSig) return null
                                return (
                                    <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: 10, borderRadius: 8, margin: '6px 0', animation: 'slideIn 0.3s ease-out' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>🎧 Coach Whisper</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>From: {coachSig.data.from || 'Supervisor'}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4, fontStyle: 'italic' }}>"{coachSig.data.text}"</div>
                                    </div>
                                )
                            })()}
                            {/* Compliance Coach — 仅窄屏（宽屏在侧边栏渲染） */}
                            {!chatIsWide && omniComplianceItems.length > 0 && omniComplianceConvId === activeConv && (
                                <div style={{ margin: '6px 0' }}>
                                    <ComplianceList items={omniComplianceItems} completedItems={omniCompletedComplianceItems} />
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Accept banner for assigned conversations (坐席已回复则隐藏) */}
                        {
                            conv?.status === "assigned" && !messages.some(m => m.sender_role === 'agent') && (
                                <div style={{
                                    display: 'flex', gap: 8, padding: '10px 12px',
                                    borderTop: '1px solid var(--glass-border)',
                                    justifyContent: 'center', alignItems: 'center',
                                    background: 'hsla(252, 90%, 60%, 0.06)',
                                }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New conversation waiting</span>
                                    <button onClick={() => acceptConv(activeConv)} style={{
                                        padding: '6px 16px', borderRadius: 8, border: 'none',
                                        background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                                        fontSize: '0.8rem', fontWeight: 700,
                                    }}>📞 Accept</button>
                                </div>
                            )
                        }

                        {/* Action bar: Resolve + optional outcome (only after accept) */}
                        {
                            conv?.status === "active" && (
                                <div style={{
                                    display: 'flex', gap: 6, padding: '6px 12px',
                                    borderTop: '1px solid var(--glass-border)',
                                    justifyContent: 'flex-end', alignItems: 'center',
                                }}>
                                    {showOutcome && (
                                        <>
                                            <button onClick={() => { setConversations(prev => prev.map(c => c._id === activeConv ? { ...c, status: 'resolved' } : c)); resolveWithReason('agent_follow_up') }} style={{
                                                padding: '4px 10px', borderRadius: 6, border: '1px solid #6C4BF5',
                                                background: 'hsla(252, 90%, 60%, 0.06)', color: '#6C4BF5', cursor: 'pointer',
                                                fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                                            }}><ClipboardList size={12} /> Follow-up</button>
                                            <button onClick={() => { setConversations(prev => prev.map(c => c._id === activeConv ? { ...c, status: 'resolved' } : c)); resolveWithReason('agent_closed_unresolved') }} style={{
                                                padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444',
                                                background: '#fef2f2', color: '#ef4444', cursor: 'pointer',
                                                fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                                            }}>❌ Lost</button>
                                        </>
                                    )}
                                    <button onClick={() => setShowOutcome(!showOutcome)} style={{
                                        padding: '4px 6px', borderRadius: 6, border: '1px solid var(--glass-border)',
                                        background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                                        fontSize: '0.7rem',
                                    }}>{showOutcome ? '▾' : '▸'}</button>
                                    <div style={{ position: 'relative' }}>
                                        <button onClick={async () => {
                                            if (showTransfer) { setShowTransfer(false); return }
                                            try {
                                                const data = await fetchApi<{ data: any[] }>('/api/conversations/im-agents')
                                                setAvailableAgents((data.data || []).filter((a: any) => a._id !== agentId))
                                                setShowTransfer(true)
                                            } catch (e) { console.error('[Inbox] Failed to load agents:', e) }
                                        }} style={{
                                            padding: '4px 10px', borderRadius: 6, border: '1px solid #3b82f6',
                                            background: 'hsla(217, 90%, 60%, 0.06)', color: '#3b82f6', cursor: 'pointer',
                                            fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                                        }}>↗ Transfer</button>
                                        {showTransfer && (
                                            <div style={{
                                                position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                                                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                                borderRadius: 8, padding: 4, minWidth: 140, zIndex: 10,
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                            }}>
                                                {availableAgents.length === 0 ? (
                                                    <div style={{ padding: '8px', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>No other agents available</div>
                                                ) : availableAgents.map(a => (
                                                    <button key={a._id} onClick={async () => {
                                                        try {
                                                            await fetchApi(`/api/conversations/${activeConv}/transfer`, {
                                                                method: 'POST', body: JSON.stringify({ targetAgentId: a._id })
                                                            })
                                                            setShowTransfer(false)
                                                            loadInbox()
                                                        } catch (e) { console.error('[Inbox] Transfer failed:', e) }
                                                    }} style={{
                                                        display: 'block', width: '100%', padding: '6px 10px', textAlign: 'left',
                                                        background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem',
                                                        color: 'var(--text-primary)', borderRadius: 4,
                                                    }}>{a.displayName}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => { setConversations(prev => prev.map(c => c._id === activeConv ? { ...c, status: 'resolved' } : c)); resolveWithReason('agent_closed') }} style={{
                                        padding: '4px 12px', borderRadius: 6, border: '1px solid #22c55e',
                                        background: '#f0fdf4', color: '#16a34a', cursor: 'pointer',
                                        fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                                    }}><CheckCircle size={12} /> Resolve</button>
                                </div>
                            )
                        }

                        {/* Quick reply templates */}
                        {
                            (conv?.status === "active" || conv?.status === "assigned") && (
                                <div style={{
                                    display: 'flex', gap: 6, padding: '6px 12px',
                                    borderTop: '1px solid var(--glass-border)',
                                    overflowX: 'auto',
                                }}>
                                    {[
                                        { label: '✅ Got it', text: "Thank you for reaching out! I've received your message and I'm looking into it." },
                                        { label: '🔧 Working on it', text: "I'm currently working on this for you. I'll have an update shortly." },
                                        { label: '🎉 All done', text: 'This has been resolved. Is there anything else I can help you with?' },
                                    ].map(t => (
                                        <button
                                            key={t.label}
                                            onClick={() => setReplyText(t.text)}
                                            style={{
                                                padding: '3px 8px', borderRadius: 12, border: '1px solid var(--glass-border)',
                                                background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                                                color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.62rem',
                                                whiteSpace: 'nowrap', flexShrink: 0,
                                            }}
                                        >{t.label}</button>
                                    ))}
                                </div>
                            )
                        }

                        {/* Reply bar for assigned + active */}
                        {
                            (conv?.status === "active" || conv?.status === "assigned") && (
                                conv?.channel === 'email' ? (
                                    <EmailComposer
                                        conversationId={activeConv}
                                        agentId={userId || agentId || ''}
                                        agentName={agentName}
                                        agentAvatar={agentAvatar}
                                        onSent={() => loadMessages(activeConv)}
                                    />
                                ) : (
                                    <div className="inbox-reply-bar" style={{ position: 'relative' }}>
                                        <div style={{ position: 'relative' }}>
                                            <button onClick={async () => {
                                                if (showTemplates) {
                                                    setShowTemplates(false)
                                                    return
                                                }
                                                try {
                                                    const data = await fetchApi<{ data: any[] }>('/api/templates')
                                                    setTemplates(data.data || [])
                                                    setShowTemplates(true)
                                                } catch (e) { console.error(e) }
                                            }} style={{
                                                background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <LayoutTemplate size={16} />
                                            </button>

                                            {showTemplates && !previewTemplate && (
                                                <div style={{
                                                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                                                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                                    borderRadius: 8, minWidth: 220, maxHeight: 300, overflowY: 'auto',
                                                    padding: 4, zIndex: 20, boxShadow: '0 -4px 12px rgba(0,0,0,0.15)'
                                                }}>
                                                    <div style={{ padding: '6px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)', marginBottom: 4 }}>
                                                        Select a Template
                                                    </div>
                                                    {templates.length === 0 ? (
                                                        <div style={{ padding: 8, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>No templates found</div>
                                                    ) : templates.map(t => (
                                                        <button
                                                            key={t._id}
                                                            onClick={() => openTemplatePreview(t)}
                                                            style={{
                                                                display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left',
                                                                background: 'none', border: 'none', cursor: 'pointer',
                                                                borderRadius: 6, color: 'var(--text-primary)',
                                                            }}
                                                            className="dropdown-item-hover"
                                                        >
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>{t.name}</div>
                                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                                {t.category} • {(t.translations || []).map((tr: any) => tr.language).join(', ')}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Template Preview Panel */}
                                            {previewTemplate && (() => {
                                                const preview = getPreviewText()
                                                const langs = (previewTemplate.translations || []).map((t: any) => t.language)
                                                const varKeys = Object.keys(previewVars)
                                                const trans = previewTemplate.translations?.find((t: any) => t.language === previewLang)
                                                return (
                                                    <div style={{
                                                        position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                                                        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                                        borderRadius: 10, width: 280, maxHeight: 420, overflowY: 'auto',
                                                        padding: 0, zIndex: 20, boxShadow: '0 -4px 16px rgba(0,0,0,0.2)'
                                                    }}>
                                                        {/* Header */}
                                                        <div style={{
                                                            padding: '8px 12px', borderBottom: '1px solid var(--glass-border)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            background: 'rgba(99,102,241,0.04)',
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <button onClick={() => setPreviewTemplate(null)} style={{
                                                                    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                                                                    color: 'var(--text-muted)', fontSize: '0.7rem'
                                                                }}>←</button>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                                                    {trans?.displayName || previewTemplate.name}
                                                                </span>
                                                            </div>
                                                            <span style={{
                                                                fontSize: '0.55rem', background: 'rgba(99,102,241,0.1)',
                                                                color: '#6366f1', padding: '1px 6px', borderRadius: 6, fontWeight: 600,
                                                            }}>{previewTemplate.category}</span>
                                                        </div>

                                                        {/* Language Selector */}
                                                        <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3, fontWeight: 500 }}>Language</div>
                                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                                {langs.map((lang: string) => (
                                                                    <button key={lang} onClick={() => setPreviewLang(lang)} style={{
                                                                        fontSize: '0.62rem', padding: '2px 8px', borderRadius: 4,
                                                                        border: `1px solid ${lang === previewLang ? '#6366f1' : 'rgba(0,0,0,0.1)'}`,
                                                                        background: lang === previewLang ? 'rgba(99,102,241,0.1)' : 'transparent',
                                                                        color: lang === previewLang ? '#6366f1' : 'var(--text-muted)',
                                                                        cursor: 'pointer', fontWeight: 500,
                                                                    }}>{lang}</button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Variables Input */}
                                                        {varKeys.length > 0 && (
                                                            <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3, fontWeight: 500 }}>Variables</div>
                                                                {varKeys.map(k => (
                                                                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                                                        <span style={{ fontSize: '0.6rem', color: '#6366f1', fontWeight: 600, minWidth: 28 }}>{`{{${k}}}`}</span>
                                                                        <input
                                                                            value={previewVars[k] || ''}
                                                                            onChange={e => setPreviewVars(p => ({ ...p, [k]: e.target.value }))}
                                                                            placeholder={`Value for {{${k}}}`}
                                                                            style={{
                                                                                flex: 1, fontSize: '0.65rem', padding: '3px 6px',
                                                                                border: '1px solid var(--glass-border)', borderRadius: 4,
                                                                                background: 'var(--bg-card, white)', color: 'var(--text-primary)',
                                                                                outline: 'none',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Preview */}
                                                        <div style={{ padding: '8px 12px' }}>
                                                            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>Preview</div>
                                                            <div style={{
                                                                background: 'var(--bg-card, #f9fafb)', border: '1px solid rgba(0,0,0,0.06)',
                                                                borderRadius: 8, padding: 10, fontSize: '0.7rem', lineHeight: 1.5,
                                                            }}>
                                                                {preview.header && (
                                                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{preview.header}</div>
                                                                )}
                                                                {preview.body && (
                                                                    <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{preview.body}</div>
                                                                )}
                                                                {preview.footer && (
                                                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>{preview.footer}</div>
                                                                )}
                                                                {preview.buttons && preview.buttons.length > 0 && (
                                                                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                                                                        {preview.buttons.map((btn: any, i: number) => (
                                                                            <span key={i} style={{
                                                                                fontSize: '0.6rem', padding: '3px 8px', borderRadius: 4,
                                                                                border: '1px solid rgba(99,102,241,0.3)',
                                                                                color: '#6366f1', fontWeight: 500,
                                                                            }}>{btn.text}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Send Button */}
                                                        <div style={{ padding: '6px 12px 10px' }}>
                                                            <button
                                                                onClick={() => unassignedSendTemplate(previewTemplate._id, previewLang, previewVars)}
                                                                style={{
                                                                    width: '100%', padding: '7px 0', borderRadius: 6, border: 'none',
                                                                    background: '#6366f1', color: 'white', fontSize: '0.7rem',
                                                                    fontWeight: 600, cursor: 'pointer',
                                                                }}
                                                            >
                                                                📎 Send as {previewLang.toUpperCase()}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                        <textarea
                                            value={replyText}
                                            onChange={e => {
                                                setReplyText(e.target.value)
                                                // Agent typing indicator (debounced)
                                                if (activeConv && e.target.value.trim()) {
                                                    if (!typingTimerRef.current) {
                                                        fetchApi(`/api/conversations/${activeConv}/typing`, { method: 'POST', body: JSON.stringify({ isTyping: true }) }).catch(() => { })
                                                    }
                                                    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
                                                    typingTimerRef.current = setTimeout(() => {
                                                        fetchApi(`/api/conversations/${activeConv}/typing`, { method: 'POST', body: JSON.stringify({ isTyping: false }) }).catch(() => { })
                                                        typingTimerRef.current = null
                                                    }, 2000)
                                                }
                                            }}
                                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                                            placeholder={conv?.status === 'assigned' ? 'Reply to accept & respond...' : 'Type a reply...'}
                                            className="inbox-reply-input"
                                            rows={2}
                                        />
                                        <button onClick={sendReply} disabled={!replyText.trim()} className="inbox-send-btn">
                                            <Send size={14} />
                                        </button>
                                    </div>
                                )
                            )
                        }
                        {
                            conv?.status === "resolved" && (
                                <div style={{
                                    padding: "10px 16px", textAlign: "center",
                                    background: "hsla(0, 0%, 50%, 0.06)",
                                    borderTop: "1px solid var(--glass-border)",
                                    fontSize: "0.75rem", color: "var(--text-muted)",
                                }}>
                                    ✅ Conversation ended — customer has left
                                </div>
                            )
                        }
                        {
                            conv?.status === "queued" && (
                                <div style={{
                                    padding: "10px 16px", textAlign: "center",
                                    background: "hsla(40, 90%, 55%, 0.08)",
                                    borderTop: "1px solid var(--glass-border)",
                                    fontSize: "0.75rem", color: "#f59e0b",
                                }}>
                                    ⏳ Customer is waiting in queue
                                </div>
                            )
                        }
                        {
                            conv?.status === "bot_active" && (
                                <div style={{
                                    padding: "10px 16px",
                                    background: "hsla(210, 80%, 55%, 0.08)",
                                    borderTop: "1px solid var(--glass-border)",
                                    fontSize: "0.75rem", color: "hsl(210,80%,55%)",
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                }}>
                                    🤖 Bot is handling this conversation
                                    <button onClick={() => acceptConv(conv._id)} style={{
                                        background: "hsl(210,80%,55%)", color: "white", border: "none", borderRadius: 6,
                                        padding: "4px 12px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                                    }}>Take Over</button>
                                </div>
                            )
                        }
                    </div>{/* /chat-main */}

                    {/* Right: Widget sidebar (宽屏) */}
                    {chatIsWide && (
                        <CopilotSidebar>
                            <CopilotSidebar.Brief>
                                <ContactContext360
                                    email={conv?.metadata?.visitorEmail}
                                    visitorId={conv?.metadata?.visitorId}
                                    contactId={typeof conv?.contactId === 'object' ? (conv.contactId as any)?._id : conv?.contactId}
                                    callerName={name}
                                    activeConvId={activeConv || undefined}
                                    contextBrief={omniContextBrief}
                                />
                            </CopilotSidebar.Brief>

                            {/* CRM */}
                            {activeConv && (() => {
                                const crmSig = (copilotSignals[activeConv] || []).find(s => s.type === 'crm_lookup')
                                if (!crmSig || crmSig.data?.status === 'loading') return null
                                return (
                                    <CopilotSidebar.Crm data={{
                                        provider: crmSig.data?.provider,
                                        contact: crmSig.data?.data ? { name: crmSig.data.data.name } : null,
                                        account: crmSig.data?.data ? {
                                            healthScore: crmSig.data.data.healthScore,
                                            lifetimeValue: crmSig.data.data.lifetimeValue,
                                            recentTickets: crmSig.data.data.recentTickets,
                                        } : null,
                                    }} />
                                )
                            })()}

                            {/* SOP Guide — accept 后显示 */}
                            {!isNotAccepted && <SOPGuidePanel />}

                            {/* Action Drafts */}
                            <CopilotSidebar.Actions>
                                {activeConv && (() => {
                                    const actions = (copilotSignals[activeConv] || []).filter(s => s.type === 'action_draft')
                                    if (actions.length === 0) return null
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {actions.map(sig => {
                                                const actionStatus = sig.data.status === 'confirmed' || sig.data.draft?.status === 'EXECUTED' ? 'confirmed' as const : 'suggested' as const
                                                return (
                                                    <ActionDraftCard
                                                        key={`action-${sig.data.intentName}`}
                                                        draft={{ actionId: sig.data.intentName || sig.id, intentSlug: sig.data.intentName, intentName: sig.data.intentName, status: actionStatus, draft: sig.data.draft, originalDraft: sig.data.draft }}
                                                        onConfirm={() => {
                                                            if (isDemo) chrome.runtime.sendMessage({ type: 'demo:omni_approve' })
                                                            const intentToRemove = sig.data.intentName
                                                            setTimeout(() => {
                                                                setCopilotSignals(prev => {
                                                                    const c = { ...prev }
                                                                    if (c[activeConv!]) c[activeConv!] = c[activeConv!].filter(s => !(s.type === 'action_draft' && s.data?.intentName === intentToRemove))
                                                                    return c
                                                                })
                                                            }, 5500)
                                                        }}
                                                        onReject={(_id, _reason) => { setCopilotSignals(prev => { const c = { ...prev }; if (c[activeConv!]) c[activeConv!] = c[activeConv!].filter(s => s.id !== sig.id); return c }) }}
                                                        onUpdate={() => { }} onReset={() => { }}
                                                        disabled={isNotAccepted} disabledHint="Accept first"
                                                    />
                                                )
                                            })}
                                        </div>
                                    )
                                })()}
                            </CopilotSidebar.Actions>

                            {/* Suggestions */}
                            <CopilotSidebar.Suggestions>
                                {activeConv && (() => {
                                    const suggestions = (copilotSignals[activeConv] || []).filter(s => s.type === 'suggestion')
                                    if (suggestions.length === 0) return null
                                    return (
                                        <CollapsibleWidget title="AI Suggestions" icon={<span>💡</span>} badge={`${suggestions.length}`}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {suggestions.map(sig => {
                                                    const sugText = sig.data?.text || sig.data?.suggestion || sig.data?.content || ''
                                                    return (
                                                        <div key={sig.id} style={{ padding: 8, borderRadius: 2, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', fontSize: '0.72rem' }}>
                                                            <div style={{ fontWeight: 600, color: '#a855f7', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} /> Suggestion</div>
                                                            <div style={{ lineHeight: 1.4 }}>{sugText || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Generating...</span>}</div>
                                                            {sugText && <button disabled={isNotAccepted} onClick={() => setReplyText(sugText)} style={{ fontSize: '0.62rem', marginTop: 4, padding: '2px 8px', borderRadius: 2, border: '1px solid #a855f7', background: 'rgba(168,85,247,0.1)', color: '#a855f7', cursor: 'pointer', fontWeight: 600 }}>📋 Use</button>}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </CollapsibleWidget>
                                    )
                                })()}
                            </CopilotSidebar.Suggestions>

                            {/* Template Recommendation */}
                            <CopilotSidebar.Template>
                                {activeConv && (() => {
                                    const tmplSigs = (copilotSignals[activeConv] || []).filter(s => s.type === 'template_recommendation')
                                    if (tmplSigs.length === 0) return null
                                    return (<>{tmplSigs.map(sig => (
                                        <div key={sig.id} style={{ background: 'rgba(236, 72, 153, 0.08)', border: '1px solid rgba(236, 72, 153, 0.3)', padding: 10, borderRadius: 2 }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><LayoutTemplate size={12} /> AI Template Match</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{sig.data.reasoning || 'Suggested template based on context.'}</div>
                                            <div style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 2, marginTop: 6, border: '1px solid var(--glass-border)', fontSize: '0.7rem' }}>
                                                <div style={{ fontWeight: 600 }}>{sig.data.templateName}</div>
                                            </div>
                                            <div style={{ marginTop: 6 }}>
                                                <button disabled={isNotAccepted} onClick={() => isDemo ? demoSendTemplate(sig.data.templateName) : unassignedSendTemplate(sig.data.templateId)} style={{ fontSize: '0.65rem', padding: '4px 8px', borderRadius: 2, border: 'none', background: '#ec4899', color: '#fff', cursor: 'pointer', fontWeight: 600, ...(isNotAccepted ? disabledBtnStyle : {}) }} title={isNotAccepted ? 'Accept conversation first' : ''}>📎 Send Template</button>
                                            </div>
                                        </div>
                                    ))}</>)
                                })()}
                            </CopilotSidebar.Template>

                            {/* Summary + Outcome (统一 SummaryCard) */}
                            <CopilotSidebar.Summary>
                                {activeConv && (() => {
                                    const others = (copilotSignals[activeConv] || []).filter(s => s.type === 'outcome' || s.type === 'summary')
                                    const isResolved = conv?.status === 'resolved'
                                    const hasOutcome = others.some(s => s.type === 'outcome')
                                    if (!isResolved && !hasOutcome && others.length === 0) return null

                                    // 将 copilotSignals 转为 SummaryCard 格式
                                    const outcomeSig = others.find(s => s.type === 'outcome')
                                    const summarySig = others.find(s => s.type === 'summary')
                                    const sumObj = summarySig?.data?.summary
                                    const sumText = typeof sumObj === 'string' ? sumObj : sumObj?.raw_summary || summarySig?.data?.raw_summary || summarySig?.data?.text || ''

                                    const chatSummary = summarySig ? {
                                        callId: activeConv,
                                        intent: sumObj?.intent || '',
                                        outcome: sumObj?.outcome || '',
                                        nextAction: sumObj?.next_action || '',
                                        entities: sumObj?.entities || {},
                                        sentiment: sumObj?.sentiment || '',
                                        rawSummary: sumText,
                                        llmModel: '',
                                        createdAt: '',
                                    } : null

                                    const chatOutcome = outcomeSig ? {
                                        outcome: outcomeSig.data?.outcome || '',
                                        confidence: outcomeSig.data?.confidence || 0,
                                        reasoning: outcomeSig.data?.reasoning || '',
                                    } : null

                                    return (
                                        <SummaryCard
                                            callId={activeConv}
                                            callInfo={null}
                                            summary={chatSummary}
                                            loading={false}
                                            onDismiss={() => { }}
                                            outcome={chatOutcome}
                                            onSave={(text) => console.log('[Chat SummaryCard] save:', text)}
                                            autoSaveDelay={settings.summaryAutoSaveDelay}
                                        />
                                    )
                                })()}
                            </CopilotSidebar.Summary>

                            {/* Coach Whisper */}
                            {activeConv && (() => {
                                const coachSig = (copilotSignals[activeConv] || []).find(s => s.type === 'coach')
                                if (!coachSig) return null
                                return <CopilotSidebar.Coach from={coachSig.data.from} text={coachSig.data.text} />
                            })()}

                            {/* 对话刚开始时空状态 */}
                            {activeConv && (() => {
                                const sigs = copilotSignals[activeConv] || []
                                const hasAny = sigs.length > 0 || (omniComplianceItems.length > 0 && omniComplianceConvId === activeConv)
                                if (hasAny) return null
                                return <CopilotSidebar.EmptyState />
                            })()}

                            {/* Compliance */}
                            {omniComplianceItems.length > 0 && omniComplianceConvId === activeConv && (
                                <CopilotSidebar.Compliance items={omniComplianceItems} completed={omniCompletedComplianceItems} />
                            )}
                        </CopilotSidebar>
                    )}

                </div>{/* /chat-thread-body */}
            </div >
        )
    }

    // Priority badge helper
    const PRIORITY_COLORS: Record<string, string> = {
        urgent: '#ef4444', high: '#f97316', normal: '#3b82f6', low: 'var(--text-muted)',
    }

    // ── List View ──
    return (
        <div style={{ height: "100%", overflowY: "auto" }}>
            {/* Preempt / Toxic alert banner */}
            {preemptBanner && (
                <div style={{
                    margin: '8px 12px', padding: '8px 12px', borderRadius: 8,
                    background: 'hsla(0, 90%, 55%, 0.12)', color: '#ef4444',
                    fontSize: '0.72rem', fontWeight: 600, textAlign: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                    <ShieldAlert size={14} /> {preemptBanner}
                    <button onClick={() => setPreemptBanner(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                </div>
            )}

            {/* Urgent lockout banner */}
            {urgentConvId && (
                <div style={{
                    margin: '8px 12px', padding: '10px 14px', borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', fontSize: '0.78rem', fontWeight: 700, textAlign: 'center',
                    animation: 'pulse 1.5s ease-in-out infinite',
                }}>
                    🔴 URGENT conversation requires immediate attention — {urgentCountdown}s
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px' }}>
                <button onClick={loadInbox} className={`inbox-refresh-btn ${loading ? "spinning" : ""}`}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {queueCount > 0 && (
                <div style={{
                    margin: "8px 12px", padding: "6px 10px", borderRadius: 8,
                    background: "hsla(40, 90%, 55%, 0.12)", color: "#f59e0b",
                    fontSize: "0.75rem", fontWeight: 600, textAlign: "center",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                    <span>⏳ {queueCount} customer{queueCount > 1 ? "s" : ""} waiting in queue</span>
                    <button onClick={async () => {
                        if (!agentId) return
                        try {
                            await fetchApi('/api/conversations/pickup-next', {
                                method: 'POST',
                                body: JSON.stringify({ agentId })
                            })
                            loadInbox()
                        } catch (e) { console.error('[Inbox] Pickup failed:', e) }
                    }} style={{
                        padding: '3px 10px', borderRadius: 6, border: 'none',
                        background: '#f59e0b', color: '#fff', cursor: 'pointer',
                        fontSize: '0.7rem', fontWeight: 700,
                    }}>📥 Pick Up</button>
                </div>
            )}

            {conversations.length === 0 ? (
                <div className="empty-state" style={{ paddingTop: 40 }}>
                    <MessageSquare size={32} strokeWidth={1.5} />
                    <p className="font-medium">No active conversations</p>
                    <p className="text-sm text-muted">Customer messages will appear here</p>
                </div>
            ) : (
                <div className="inbox-list">
                    {/* W3: Channel filter chips */}
                    {(() => {
                        const channelCounts: Record<string, number> = {}
                        conversations.forEach(c => { channelCounts[c.channel] = (channelCounts[c.channel] || 0) + 1 })
                        const channels = Object.keys(channelCounts)
                        if (channels.length > 1) {
                            return (
                                <div style={{ display: 'flex', gap: 4, padding: '4px 12px 8px', flexWrap: 'wrap' }}>
                                    <button onClick={() => setChannelFilter(null)} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 12, border: `1px solid ${!channelFilter ? '#6366f1' : 'var(--glass-border, #e5e7eb)'}`, background: !channelFilter ? 'rgba(99,102,241,0.15)' : 'rgba(0,0,0,0.03)', color: !channelFilter ? '#6366f1' : 'var(--text-secondary, #6b7280)', cursor: 'pointer', fontWeight: 600 }}>All ({conversations.length})</button>
                                    {channels.map(ch => (
                                        <button key={ch} onClick={() => setChannelFilter(channelFilter === ch ? null : ch)} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 12, border: `1px solid ${channelFilter === ch ? '#6366f1' : 'var(--glass-border, #e5e7eb)'}`, background: channelFilter === ch ? 'rgba(99,102,241,0.15)' : 'rgba(0,0,0,0.03)', color: channelFilter === ch ? '#6366f1' : 'var(--text-secondary, #6b7280)', cursor: 'pointer', fontWeight: 500 }}>{CHANNEL_ICONS[ch] || '💬'} {ch} ({channelCounts[ch]})</button>
                                    ))}
                                </div>
                            )
                        }
                        return null
                    })()}
                    {conversations.filter(c => !channelFilter || c.channel === channelFilter).map(conv => {
                        const name = conv.metadata?.visitorName || conv.contactId?.displayName || `Visitor-${(conv.metadata?.visitorId || "").slice(0, 6)}`
                        const icon = CHANNEL_ICONS[conv.channel] || "💬"
                        const isUrgentTarget = urgentConvId === conv._id
                        const isLocked = urgentConvId && !isUrgentTarget
                        const priorityColor = PRIORITY_COLORS[conv.priority || 'normal']

                        return (
                            <div
                                key={conv._id}
                                onClick={() => !isLocked && openConv(conv._id)}
                                className="inbox-conv-item"
                                style={{
                                    ...(isLocked ? { opacity: 0.35, pointerEvents: 'none' as const, filter: 'grayscale(0.6)' } : {}),
                                    ...(isUrgentTarget ? { borderLeft: '3px solid #ef4444', background: 'hsla(0, 90%, 55%, 0.06)' } : {}),
                                }}
                            >
                                <div className="inbox-conv-header">
                                    <div className="inbox-conv-name">
                                        <span>{icon}</span>
                                        <span>{name}</span>
                                        {(conv.unreadCount ?? 0) > 0 && (
                                            <span className="inbox-unread-badge">{conv.unreadCount}</span>
                                        )}
                                    </div>
                                    <span className={`inbox-status-badge ${conv.status}`}>
                                        {conv.status === "bot_active" ? "🤖 Bot" : conv.status}
                                    </span>
                                </div>
                                <div className="inbox-conv-preview">{conv.subject || "No messages yet"}</div>
                                <div className="inbox-conv-meta">
                                    <span>💬 {conv.messageCount}</span>
                                    {conv.priority && conv.priority !== 'normal' && (
                                        <span style={{ color: priorityColor, fontWeight: 600 }}>
                                            {conv.priority === 'urgent' ? '🔴' : conv.priority === 'high' ? '🟠' : '⚪'} {conv.priority}
                                        </span>
                                    )}
                                    <span>{timeAgo(conv.lastMessageAt)}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
