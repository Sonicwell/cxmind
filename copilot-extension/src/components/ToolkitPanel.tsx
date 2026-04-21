import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react"
import { Search, FileText, ClipboardCheck, Zap, MessageCircle, X, Copy, Check, Calendar, Mail, Ticket } from "lucide-react"
import { useApi } from "~/hooks/useApi"
import { SummaryCard } from "~/components/SummaryCard"
import { useTranslation } from 'react-i18next'

// 智能时间: 当天→HH:mm, 昨天→昨天 HH:mm, 更早→M/D HH:mm
function formatSmartTime(dateStr: string): string {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.round((todayStart.getTime() - msgDay.getTime()) / 86400000)
    if (diffDays === 0) return time
    if (diffDays === 1) return `昨天 ${time}`
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

// ─── Types ───

export interface WrapupItem {
    id: string
    type: 'voice' | 'chat'
    label: string           // 客户名或号码
    channel?: string
    endedAt: string
    summary?: string
    summaryData?: import('~/hooks/useWebSocket').CallSummary | null
    summaryLoading?: boolean
    summarySkipped?: boolean
    summaryTimedOut?: boolean
    summaryNotEnabled?: boolean
    aiOutcome?: string       // AI 预测 outcome (omni:outcome)
    agentOutcome?: string    // 坐席手动选的 outcome
    status: 'pending' | 'completed'
}

interface PostCallData {
    callId: string | null
    callInfo: { caller: string; callee: string; startTime: string; endTime?: string } | null
    summary: any | null
    summaryLoading: boolean
    summaryTimedOut?: boolean
    summaryNotEnabled?: boolean
    summarySkipped?: boolean
    outcome?: { outcome: string; confidence: number; reasoning: string } | null
    onDismiss: () => void
    onSave?: (text: string) => void
    onWrapupComplete?: () => void
    onOutcomeSelect?: (outcome: string) => void
}

interface ToolkitPanelProps {
    open: boolean
    onClose: () => void
    wrapupQueue: WrapupItem[]
    onWrapupComplete: (id: string) => void
    /** 内部群聊消息（所有组） */
    groupChatMessages?: any[]
    /** 多组支持 */
    groupIds?: string[]
    groupNames?: Record<string, string>
    groupUnreadMap?: Record<string, number>
    onGroupChatSend?: (text: string, groupId: string) => void
    onGroupChatSeen?: (groupId: string) => void
    /** supervisor coaching */
    coachMessages?: Array<{ from: string; text: string; time: string }>
    /** 通话结束 post-call 数据 */
    postCallData?: PostCallData
    /** 强制切到指定 tab */
    forceTab?: ToolkitTab
}

type ToolkitTab = 'search' | 'wrapup' | 'actions' | 'messages'

// ─── Component ───

export function ToolkitPanel({ open, onClose, wrapupQueue, onWrapupComplete, groupChatMessages = [], groupIds = [], groupNames = {}, groupUnreadMap = {}, onGroupChatSend, onGroupChatSeen, coachMessages = [], postCallData, forceTab }: ToolkitPanelProps) {
    const [activeTab, setActiveTab] = useState<ToolkitTab>('search')
    const panelRef = useRef<HTMLDivElement>(null)

    // 有新 pending wrapup 时自动切到 wrapup tab
    useEffect(() => {
        const pendingCount = wrapupQueue.filter(w => w.status === 'pending').length
        if (pendingCount > 0 && open) {
            setActiveTab('wrapup')
        }
    }, [wrapupQueue.length, open])

    // forceTab 外部控制
    useEffect(() => {
        if (forceTab) setActiveTab(forceTab)
    }, [forceTab])

    if (!open) return null

    const postCallId = postCallData?.callId
    const pendingCount = wrapupQueue.filter(w => w.status === 'pending' && w.id !== postCallId).length
    const hasPostCall = !!postCallId
    const wrapupBadge = pendingCount + (hasPostCall ? 1 : 0)

    // B3: 所有组未读总计
    const totalGroupUnread = Object.values(groupUnreadMap).reduce((a, b) => a + b, 0)
    const msgBadge = (coachMessages.length || 0) + totalGroupUnread

    const { t } = useTranslation()
    const TABS: Array<{ id: ToolkitTab; icon: typeof Search; label: string; badge?: number }> = [
        { id: 'search', icon: Search, label: t('toolkit.search', 'Search') },
        { id: 'wrapup', icon: ClipboardCheck, label: t('toolkit.wrapUp', 'Wrap-up'), badge: wrapupBadge || undefined },
        { id: 'actions', icon: Zap, label: t('toolkit.actions', 'Actions') },
        { id: 'messages', icon: MessageCircle, label: t('toolkit.messages', 'Messages'), badge: msgBadge || undefined },
    ]

    return (
        <div className="toolkit-panel" ref={panelRef}>
            {/* Header + Tabs 合并为一行 */}
            <div className="toolkit-header">
                <div className="toolkit-tabs">
                    {TABS.map(tab => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.id}
                                className={`toolkit-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon size={13} />
                                <span>{tab.label}</span>
                                {tab.badge && tab.badge > 0 && (
                                    <span className="toolkit-tab-badge">{tab.badge}</span>
                                )}
                            </button>
                        )
                    })}
                </div>
                <button onClick={onClose} className="toolkit-close-btn">
                    <X size={14} />
                </button>
            </div>

            {/* Content */}
            <div className="toolkit-content">
                {activeTab === 'search' && <KBSearchTab />}
                {activeTab === 'wrapup' && (
                    <WrapupTab queue={wrapupQueue} onComplete={onWrapupComplete} postCallData={postCallData} />
                )}
                {activeTab === 'actions' && <QuickActionsTab />}
                {activeTab === 'messages' && (
                    <MessagesTab
                        groupMessages={groupChatMessages}
                        groupIds={groupIds}
                        groupNames={groupNames}
                        groupUnreadMap={groupUnreadMap}
                        onGroupSend={onGroupChatSend}
                        onGroupSeen={onGroupChatSeen}
                        coachMessages={coachMessages}
                    />
                )}
            </div>
        </div>
    )
}

// ─── KB Search Tab ───

function KBSearchTab() {
    const { t } = useTranslation()
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const { fetchApi } = useApi()
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const doSearch = async () => {
        if (!query.trim()) return
        setLoading(true)
        try {
            const resp = await fetchApi<{ results: any[] }>(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=5`)
            setResults(resp.results || [])
        } catch {
            setResults([])
        } finally {
            setLoading(false)
        }
    }

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                    placeholder={t('toolkit.searchPlaceholder', 'Search knowledge base...')}
                    className="toolkit-search-input"
                />
                <button onClick={doSearch} disabled={loading} className="toolkit-search-btn">
                    {loading ? '...' : t('toolkit.search', 'Search')}
                </button>
            </div>

            {results.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {results.map((r: any) => (
                        <div key={r.id} className="toolkit-kb-result">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                <FileText size={12} color="var(--primary)" />
                                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{r.title}</span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    {Math.round((r.score || 0) * 100)}%
                                </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {r.content?.slice(0, 200)}{r.content?.length > 200 ? '...' : ''}
                            </div>
                            <button
                                onClick={() => handleCopy(r.content, r.id)}
                                className="toolkit-copy-btn"
                                style={{ color: copiedId === r.id ? 'var(--success, #22c55e)' : 'var(--text-muted)' }}
                            >
                                {copiedId === r.id ? <><Check size={10} /> {t('common.copied', 'Copied')}</> : <><Copy size={10} /> {t('common.copy', 'Copy')}</>}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {results.length === 0 && query && !loading && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                    {t('toolkit.noResults', 'No results found')}
                    <div style={{ marginTop: 8 }}>
                        <button
                            onClick={() => {
                                console.log('[KB Feedback] Missing content reported:', query)
                                alert('Reported! Thank you for the feedback.')
                            }}
                            style={{
                                background: 'none', border: '1px solid var(--glass-border)', borderRadius: 6,
                                padding: '4px 10px', cursor: 'pointer', fontSize: '0.65rem',
                                color: 'var(--text-secondary)', fontFamily: 'inherit',
                            }}
                        >
                            ⚑ {t('toolkit.reportMissing', 'Report missing content')}
                        </button>
                    </div>
                </div>
            )}

            {!query && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                    <Search size={24} style={{ opacity: 0.2, marginBottom: 8 }} /><br />
                    {t('toolkit.searchHint', 'Search knowledge base, articles, and SOPs')}
                </div>
            )}
        </div>
    )
}

// ─── Wrap-up Tab ───

function WrapupTab({ queue, onComplete, postCallData }: { queue: WrapupItem[]; onComplete: (id: string) => void; postCallData?: PostCallData }) {
    // 过滤掉已在 Current Session 中显示的 call
    const postCallId = postCallData?.callId
    const pending = queue.filter(w => w.status === 'pending' && w.id !== postCallId)
    const completed = queue.filter(w => w.status === 'completed' && w.id !== postCallId)

    const hasPostCall = !!postCallData?.callId
    const isEmpty = pending.length === 0 && completed.length === 0 && !hasPostCall

    const { t } = useTranslation()
    if (isEmpty) {
        return (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <ClipboardCheck size={24} style={{ opacity: 0.2, marginBottom: 8 }} /><br />
                {t('toolkit.noSessions', 'No sessions to wrap up')}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Post-call: Outcome + Summary + Wrap-up actions */}
            {hasPostCall && (
                <>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t('toolkit.currentSession', 'Current Session')}
                    </div>
                    <SummaryCard
                        callId={postCallData!.callId}
                        callInfo={postCallData!.callInfo}
                        summary={postCallData!.summary}
                        loading={postCallData!.summaryLoading}
                        onDismiss={postCallData!.onDismiss}
                        outcome={postCallData!.outcome}
                        onSave={postCallData!.onSave}
                        onWrapupComplete={postCallData!.onWrapupComplete}
                        onOutcomeSelect={postCallData!.onOutcomeSelect}
                        timedOut={postCallData!.summaryTimedOut}
                        summaryNotEnabled={postCallData!.summaryNotEnabled}
                        summarySkipped={postCallData!.summarySkipped}
                    />
                </>
            )}

            {/* Pending wrapup items (chat resolve 等) */}
            {pending.length > 0 && (
                <>
                    {!hasPostCall ? null : (
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 8 }}>
                            {t('toolkit.other', 'Other')} ({pending.length})
                        </div>
                    )}
                    {pending.map(item => (
                        <SummaryCard
                            key={item.id}
                            callId={item.id}
                            callInfo={null}
                            summary={item.summaryData || null}
                            loading={item.summaryLoading ?? !item.summaryData}
                            summarySkipped={item.summarySkipped}
                            timedOut={item.summaryTimedOut}
                            summaryNotEnabled={item.summaryNotEnabled}
                            onDismiss={() => onComplete(item.id)}
                            onWrapupComplete={() => onComplete(item.id)}
                        />
                    ))}
                </>
            )}

            {/* Completed — 折叠摘要, 仅显示关键信息 */}
            {completed.length > 0 && (
                <>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 8 }}>
                        ✓ {t('toolkit.completed', 'Completed')} ({completed.length})
                    </div>
                    {[...completed].reverse().map(item => {
                        const intent = item.summaryData?.intent || item.label || item.id.slice(0, 8)
                        const conclusion = item.summaryData?.outcome || ''
                        const time = formatSmartTime(item.endedAt)
                        const icon = item.type === 'voice' ? '📞' : '💬'
                        // outcome emoji 映射
                        const emojiMap: Record<string, string> = { success: '✅', failure: '❌', follow_up: '🔄' }
                        const ai = item.aiOutcome ? emojiMap[item.aiOutcome] : null
                        const agent = item.agentOutcome ? emojiMap[item.agentOutcome] : null
                        const sameOutcome = ai && agent && item.aiOutcome === item.agentOutcome
                        return (
                            <div key={item.id} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 10px', borderRadius: 8,
                                background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)',
                                fontSize: '0.68rem', color: 'var(--text-muted)',
                            }}>
                                <Check size={12} style={{ color: 'var(--success, #22c55e)', flexShrink: 0 }} />
                                <span>{icon}</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {intent}
                                </span>
                                {sameOutcome ? (
                                    <span title={item.agentOutcome} style={{ fontSize: '0.7rem', flexShrink: 0 }}>{agent}</span>
                                ) : (
                                    <>
                                        {ai && <span title={`AI: ${item.aiOutcome}`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>🤖{ai}</span>}
                                        {agent && <span title={`Agent: ${item.agentOutcome}`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>👤{agent}</span>}
                                    </>
                                )}
                                {!ai && !agent && conclusion && (
                                    <span style={{ fontSize: '0.6rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {conclusion}
                                    </span>
                                )}
                                <span style={{ fontSize: '0.6rem', flexShrink: 0 }}>{time}</span>
                            </div>
                        )
                    })}
                </>
            )}
        </div>
    )
}




// ─── Quick Actions Tab (AI Drafts 模式) ───

function QuickActionsTab() {
    const { t } = useTranslation()
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const actions = [
        {
            id: 'ticket',
            icon: Ticket,
            color: '#6366f1',
            bg: 'rgba(99,102,241,0.1)',
            title: t('toolkit.ticketDraft', 'Ticket Draft'),
            desc: t('toolkit.ticketDraftDesc', 'Pre-fill ticket from conversation context'),
            draft: () => `[Ticket Draft]\nSubject: Customer issue — billing inquiry\nDescription: Customer reported duplicate charge on invoice. Verified account and confirmed refund eligibility.\nPriority: Medium\nCategory: Billing`,
        },
        {
            id: 'callback',
            icon: Calendar,
            color: '#10b981',
            bg: 'rgba(16,185,129,0.1)',
            title: t('toolkit.callbackReminder', 'Callback Reminder'),
            desc: t('toolkit.callbackReminderDesc', 'Generate callback reminder from conversation'),
            draft: () => `[Callback Reminder]\nCustomer: Current caller\nWhen: ${new Date(Date.now() + 3600000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}\nReason: Follow up on refund processing status\nNotes: Customer prefers morning calls`,
        },
        {
            id: 'email',
            icon: Mail,
            color: '#8b5cf6',
            bg: 'rgba(139,92,246,0.1)',
            title: t('toolkit.followupEmail', 'Follow-up Email'),
            desc: t('toolkit.followupEmailDesc', 'Generate email draft from summary'),
            draft: () => `Subject: Follow-up: Your recent inquiry\n\nDear Customer,\n\nThank you for contacting us today. As discussed, we have processed your request and you can expect the update within 3-5 business days.\n\nIf you have any further questions, please don't hesitate to reach out.\n\nBest regards,\nAgent`,
        },
    ]

    const handleCopy = async (action: typeof actions[0]) => {
        try {
            await navigator.clipboard.writeText(action.draft())
            setCopiedId(action.id)
            setTimeout(() => setCopiedId(null), 2000)
        } catch {
            console.warn('[Toolkit] Clipboard write failed')
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('toolkit.aiDrafts', 'AI Drafts')}
            </div>
            {actions.map(action => {
                const Icon = action.icon
                const isCopied = copiedId === action.id
                return (
                    <div key={action.id} className="toolkit-quick-action" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="toolkit-qa-icon" style={{ background: action.bg, color: action.color }}><Icon size={16} /></div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.75rem' }}>{action.title}</div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{action.desc}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, paddingLeft: 36 }}>
                            <button
                                onClick={() => handleCopy(action)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '4px 10px', borderRadius: 6, border: 'none',
                                    background: isCopied ? 'rgba(34,197,94,0.15)' : 'var(--primary, #6366f1)',
                                    color: isCopied ? '#22c55e' : '#fff',
                                    fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.15s', fontFamily: 'inherit',
                                }}
                            >
                                {isCopied ? <><Check size={11} /> {t('common.copied', 'Copied')}</> : <><Copy size={11} /> {t('toolkit.copyDraft', 'Copy Draft')}</>}
                            </button>
                            <button
                                disabled
                                title="管理员完成对接后，自动发送"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '4px 10px', borderRadius: 6,
                                    border: '1px solid var(--glass-border)',
                                    background: 'transparent',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.62rem', cursor: 'not-allowed', opacity: 0.45,
                                    fontFamily: 'inherit',
                                }}
                            >
                                🔗 {t('toolkit.autoSend', 'Auto-send')}
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Messages Tab ───

interface MessagesTabProps {
    groupMessages: any[]
    groupIds: string[]
    groupNames: Record<string, string>
    groupUnreadMap: Record<string, number>
    onGroupSend?: (text: string, groupId: string) => void
    onGroupSeen?: (groupId: string) => void
    coachMessages: Array<{ from: string; text: string; time: string }>
}

function MessagesTab({ groupMessages, groupIds, groupNames, groupUnreadMap, onGroupSend, onGroupSeen, coachMessages }: MessagesTabProps) {
    const { t } = useTranslation()
    const { fetchApi, isInitialized: apiReady } = useApi()
    const [msgText, setMsgText] = useState('')
    const [activeGroupId, setActiveGroupId] = useState<string | null>(groupIds[0] || null)
    const [historyMessages, setHistoryMessages] = useState<any[]>([])
    const [hasMore, setHasMore] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const HISTORY_PAGE_SIZE = 20
    const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const loadingOlderRef = useRef(false)

    // 同步 activeGroupId: 无组→有组 或 当前组已不在列表中
    useEffect(() => {
        if (groupIds.length > 0 && (!activeGroupId || !groupIds.includes(activeGroupId))) {
            setActiveGroupId(groupIds[0])
        } else if (groupIds.length === 0 && activeGroupId) {
            setActiveGroupId(null)
        }
    }, [JSON.stringify(groupIds)])

    // B2: 加载历史消息
    useEffect(() => {
        if (!activeGroupId || !apiReady) return
        setHistoryMessages([])
        setHasMore(true)
        const channelId = `group:${activeGroupId}`
        fetchApi<{ messages: any[] }>(`/api/chat/messages?channelId=${encodeURIComponent(channelId)}&limit=${HISTORY_PAGE_SIZE}`)
            .then(data => {
                if (data?.messages) {
                    setHistoryMessages(data.messages)
                    if (data.messages.length < HISTORY_PAGE_SIZE) setHasMore(false)
                }
            })
            .catch(() => { /* 静默失败 */ })
    }, [activeGroupId, apiReady])

    // 加载更早的历史消息
    const prevScrollHeightRef = useRef(0)
    const loadOlderMessages = useCallback(async () => {
        if (!activeGroupId || !apiReady || loadingMore || !hasMore) return
        setLoadingMore(true)
        loadingOlderRef.current = true
        prevScrollHeightRef.current = scrollContainerRef.current?.scrollHeight || 0
        try {
            const oldest = historyMessages[0]
            const before = oldest?.createdAt || new Date().toISOString()
            const cid = `group:${activeGroupId}`
            const data = await fetchApi<{ messages: any[] }>(
                `/api/chat/messages?channelId=${encodeURIComponent(cid)}&limit=${HISTORY_PAGE_SIZE}&before=${encodeURIComponent(before)}`
            )
            if (data?.messages) {
                setHistoryMessages(prev => [...data.messages, ...prev])
                if (data.messages.length < HISTORY_PAGE_SIZE) setHasMore(false)
            } else {
                loadingOlderRef.current = false
            }
        } catch {
            loadingOlderRef.current = false
        } finally {
            setLoadingMore(false)
        }
    }, [activeGroupId, apiReady, loadingMore, hasMore, historyMessages])

    // 合并历史 + 实时消息，去重排序
    const channelId = activeGroupId ? `group:${activeGroupId}` : ''
    const filteredLive = groupMessages.filter(m => m.channelId === channelId)

    // 切组时或收到新消息时清未读（用户正在看该组 = 自动已读）
    const liveCount = filteredLive.length
    useEffect(() => {
        if (activeGroupId && onGroupSeen) onGroupSeen(activeGroupId)
    }, [activeGroupId, liveCount])
    const allMessages = useMemo(() => {
        const map = new Map<string, any>()
        for (const m of historyMessages) map.set(m._id, m)
        for (const m of filteredLive) map.set(m._id || `live-${m.createdAt}`, m)
        return Array.from(map.values()).sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
    }, [historyMessages, filteredLive])

    // 滚动策略: 加载历史→同步恢复位置, 新消息→滚底
    useLayoutEffect(() => {
        if (loadingOlderRef.current) {
            const container = scrollContainerRef.current
            if (container) {
                container.scrollTop = container.scrollHeight - prevScrollHeightRef.current
            }
            loadingOlderRef.current = false
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [allMessages.length])

    const handleSend = () => {
        if (!msgText.trim() || !activeGroupId || !onGroupSend) return
        onGroupSend(msgText, activeGroupId)
        setMsgText('')
    }

    const handleRecall = (msgId: string) => {
        chrome.runtime.sendMessage({ type: 'chat:recall', data: { messageId: msgId } })
    }

    const handleEdit = (msgId: string) => {
        if (!editText.trim()) return
        chrome.runtime.sendMessage({ type: 'chat:edit', data: { messageId: msgId, newText: editText } })
        setEditingMsgId(null)
        setEditText('')
    }

    // 当前用户的 Agent._id — 用于匹配消息 sender.id
    const [myUserId, setMyUserId] = useState<string | null>(null)
    useEffect(() => {
        chrome.storage.local.get(['userProfile'], (result) => {
            const info = result.userProfile
            // sender.id 在后端 sendMessage 时取自 ws.agentId (Agent._id)
            setMyUserId(info?.agentId || info?.userId || null)
        })
    }, [])

    const canRecall = (msg: any) => {
        if (msg.isRecalled || msg.sender?.id !== myUserId) return false
        return Date.now() - new Date(msg.createdAt).getTime() < 2 * 60 * 1000
    }

    const canEdit = (msg: any) => {
        if (msg.isRecalled || msg.sender?.id !== myUserId) return false
        return Date.now() - new Date(msg.createdAt).getTime() < 5 * 60 * 1000
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            {/* Supervisor Coaching */}
            {coachMessages.length > 0 && (
                <>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t('toolkit.supervisor', 'Supervisor')}
                    </div>
                    {coachMessages.map((msg, i) => (
                        <div key={i} className="toolkit-coach-msg">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.68rem' }}>{msg.from}</span>
                                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{msg.time}</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>{msg.text}</div>
                        </div>
                    ))}
                </>
            )}

            {/* B1: 多组 pill tabs — 单组隐藏 */}
            {groupIds.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {groupIds.map(gid => (
                        <button
                            key={gid}
                            onClick={() => setActiveGroupId(gid)}
                            style={{
                                padding: '3px 10px',
                                borderRadius: 12,
                                border: `1px solid ${activeGroupId === gid ? 'var(--primary)' : 'var(--glass-border)'}`,
                                background: activeGroupId === gid ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                color: activeGroupId === gid ? 'var(--primary)' : 'var(--text-secondary)',
                                fontSize: '0.62rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                position: 'relative',
                                fontFamily: 'inherit',
                            }}
                        >
                            {groupNames[gid] || `Group ${gid.slice(-4)}`}
                            {/* 独立未读 dot */}
                            {(groupUnreadMap[gid] || 0) > 0 && activeGroupId !== gid && (
                                <span style={{
                                    position: 'absolute', top: -2, right: -2,
                                    width: 7, height: 7, borderRadius: '50%',
                                    background: 'var(--danger, #ef4444)', border: '1.5px solid white',
                                }} />
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Group Chat Label */}
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('toolkit.teamChat', 'Team Chat')}
            </div>

            {/* C: flex:1 替代 maxHeight:200 — 与 Actions tab 一致 */}
            {!activeGroupId ? (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    {t('toolkit.noGroup', 'Not assigned to any group')}
                </div>
            ) : allMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    {t('toolkit.noTeamMessages', 'No team messages yet')}
                </div>
            ) : (
                <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
                    {/* 加载更多历史消息 */}
                    {hasMore && (
                        <button
                            onClick={loadOlderMessages}
                            disabled={loadingMore}
                            style={{
                                alignSelf: 'center', padding: '4px 12px', borderRadius: 12,
                                border: '1px solid var(--glass-border)', background: 'transparent',
                                color: 'var(--text-muted)', fontSize: '0.62rem', cursor: loadingMore ? 'wait' : 'pointer',
                                fontFamily: 'inherit', marginBottom: 4,
                            }}
                        >
                            {loadingMore ? '...' : t('toolkit.loadPrevious', '↑ Load previous messages')}
                        </button>
                    )}
                    {allMessages.map((msg: any) => {
                        const isMine = msg.sender?.id === myUserId
                        const isRecalled = msg.isRecalled
                        const isEdited = !!msg.editedAt
                        const isHovered = hoveredMsgId === msg._id

                        return (
                            <div
                                key={msg._id || msg.createdAt}
                                style={{
                                    fontSize: '0.7rem', padding: '4px 6px',
                                    borderBottom: '1px solid rgba(0,0,0,0.03)',
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: isMine ? 'flex-end' : 'flex-start',
                                }}
                                onMouseEnter={() => setHoveredMsgId(msg._id)}
                                onMouseLeave={() => setHoveredMsgId(null)}
                            >
                                {editingMsgId === msg._id ? (
                                    /* 编辑模式 */
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <input
                                            value={editText}
                                            onChange={e => setEditText(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleEdit(msg._id); if (e.key === 'Escape') setEditingMsgId(null) }}
                                            className="toolkit-search-input"
                                            style={{ fontSize: '0.68rem', padding: '3px 6px' }}
                                            maxLength={5000}
                                            autoFocus
                                        />
                                        <button onClick={() => handleEdit(msg._id)} className="toolkit-search-btn" style={{ fontSize: '0.6rem', padding: '3px 8px' }}>✓</button>
                                        <button onClick={() => setEditingMsgId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-muted)' }}>✕</button>
                                    </div>
                                ) : (
                                    <div style={{
                                        background: isMine ? 'var(--primary-alpha, rgba(124,58,237,0.08))' : 'var(--glass-bg, rgba(0,0,0,0.02))',
                                        borderRadius: 8,
                                        padding: '4px 8px',
                                        maxWidth: '85%',
                                        position: 'relative',
                                        wordBreak: 'break-word',
                                    }}>
                                        {!isMine && (
                                            <span style={{ fontWeight: 600, marginRight: 4, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                {msg.sender?.name || 'Agent'}
                                            </span>
                                        )}
                                        {isRecalled ? (
                                            <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>⤺ {t('toolkit.messageRecalled', '消息已撤回')}</span>
                                        ) : (
                                            <>
                                                <span>{msg.content?.text || ''}</span>
                                                {isEdited && <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginLeft: 4 }}>({t('toolkit.edited', '已编辑')})</span>}
                                            </>
                                        )}
                                        {/* 时间戳 */}
                                        {msg.createdAt && (
                                            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 2, textAlign: isMine ? 'right' : 'left' }}>
                                                {formatSmartTime(msg.createdAt)}
                                            </div>
                                        )}
                                        {/* D2: hover 浮出操作图标 */}
                                        {isHovered && isMine && !isRecalled && (
                                            <span style={{
                                                position: 'absolute', right: 4, top: -14,
                                                display: 'flex', gap: 4,
                                                background: 'var(--glass-bg, white)',
                                                borderRadius: 4, padding: '1px 4px',
                                                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                            }}>
                                                {canEdit(msg) && (
                                                    <button
                                                        onClick={() => { setEditingMsgId(msg._id); setEditText(msg.content?.text || '') }}
                                                        title={t('toolkit.edit', 'Edit')}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.68rem', padding: '1px 2px' }}
                                                    >✏️</button>
                                                )}
                                                {canRecall(msg) && (
                                                    <button
                                                        onClick={() => handleRecall(msg._id)}
                                                        title={t('toolkit.recall', 'Recall')}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.68rem', padding: '1px 2px' }}
                                                    >↩</button>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Quick send */}
            {onGroupSend && activeGroupId && (
                <div style={{ display: 'flex', gap: 4 }}>
                    <input
                        value={msgText}
                        onChange={e => setMsgText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                        placeholder={t('toolkit.messageTeam', 'Message team...')}
                        className="toolkit-search-input"
                        maxLength={5000}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!msgText.trim()}
                        className="toolkit-search-btn"
                    >{t('toolkit.send', 'Send')}</button>
                </div>
            )}
        </div>
    )
}

