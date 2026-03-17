import { useState, useEffect, useCallback } from "react"
import { useApi } from "~/hooks/useApi"
import { useAuth } from "~/hooks/useAuth"
import { useActivityHistory, type ActivityItem, type TypeFilter, type ViewMode, type ContactGroup, type ContactMini } from "~/hooks/useActivityHistory"
import { CallDetailView } from "./CallDetailView"
import { ContactContext360 } from "./CallerContext360"
import { safeDate } from "~/utils/safeDate"
import type { AgentAction } from "~/types"
import {
    Phone, MessageSquare, PhoneIncoming, PhoneOutgoing, PhoneMissed,
    Clock, Search, Loader2, ChevronDown, ChevronRight, ArrowLeft, RefreshCw,
    CheckCircle2, XCircle, Timer, MessageCircle, Zap, Users, List,
    User
} from "lucide-react"

// ── Format Helpers ──────────────────────────────────────────────────

function formatDuration(seconds: number): string {
    if (seconds <= 0) return "—"
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m === 0) return `${s}s`
    return `${m}m ${s}s`
}

function formatTime(dateStr: string): string {
    const d = safeDate(dateStr)
    const now = new Date()
    const isToday = d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate()
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (isToday) return time
    // 非今天: 加上 M/D 前缀
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

function normalizeSIP(uri: string): string {
    if (!uri) return ""
    const match = uri.match(/sip:([^@]+)/) || uri.match(/^(\d+)$/) || uri.match(/^([^"<]+)/)
    return match ? match[1].trim() : uri.trim()
}

function getDateLabel(dateStr: string): string {
    const d = safeDate(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (itemDate.getTime() === today.getTime()) return "Today"
    if (itemDate.getTime() === yesterday.getTime()) return "Yesterday"
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByDate(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
    const groups: Map<string, ActivityItem[]> = new Map()
    for (const item of items) {
        const label = getDateLabel(item.startTime)
        if (!groups.has(label)) groups.set(label, [])
        groups.get(label)!.push(item)
    }
    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

// ── Badges ──────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
    if (!outcome) return null
    const config: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
        success: { emoji: '✅', label: 'Success', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
        failure: { emoji: '❌', label: 'Failed', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
        follow_up: { emoji: '⏰', label: 'Follow Up', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
        resolved: { emoji: '✅', label: 'Resolved', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
    }
    const c = config[outcome]
    if (!c) return <span className="badge-neutral">{outcome}</span>
    return (
        <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            color: c.color, background: c.bg, fontWeight: 500,
        }}>
            {c.emoji} {c.label}
        </span>
    )
}

function ChannelBadge({ channel }: { channel: string }) {
    const map: Record<string, { icon: string; color: string }> = {
        voice: { icon: '📞', color: '#6366f1' },
        webchat: { icon: '💬', color: '#06b6d4' },
        whatsapp: { icon: '📱', color: '#22c55e' },
        email: { icon: '✉️', color: '#8b5cf6' },
        line: { icon: '💚', color: '#00b900' },
        telegram: { icon: '✈️', color: '#0088cc' },
    }
    const cfg = map[channel] || { icon: '💬', color: '#9ca3af' }
    return <span style={{ fontSize: 11 }}>{cfg.icon}</span>
}

function TierBadge({ tier }: { tier?: string }) {
    if (!tier || tier === 'standard') return null
    const styles: Record<string, { label: string; color: string; bg: string }> = {
        vip: { label: '⭐ VIP', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
        premium: { label: '💎 Premium', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
    }
    const s = styles[tier]
    if (!s) return null
    return (
        <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            color: s.color, background: s.bg, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.3px',
        }}>
            {s.label}
        </span>
    )
}

function TypeIcon({ item }: { item: ActivityItem }) {
    if (item.type === 'chat') {
        return <MessageSquare size={16} style={{ color: 'var(--primary)' }} />
    }
    if (item.status === 'missed' || item.status === 'no_answer' || item.status === 'cancelled') {
        return <PhoneMissed size={16} style={{ color: '#ef4444' }} />
    }
    if (item.direction === 'inbound') {
        return <PhoneIncoming size={16} style={{ color: '#22c55e' }} />
    }
    return <PhoneOutgoing size={16} style={{ color: '#6366f1' }} />
}

// ── Stats Bar ───────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: { totalCalls: number; totalChats: number; missedToday: number } }) {
    return (
        <div className="stats-bar">
            <span className="stats-today-label">Today</span>
            <span className="stat-chip"><Phone size={11} /> {stats.totalCalls}</span>
            <span className="stat-chip"><MessageSquare size={11} /> {stats.totalChats}</span>
            {stats.missedToday > 0 && (
                <span className="stat-chip stat-missed"><PhoneMissed size={11} /> {stats.missedToday} missed</span>
            )}
        </div>
    )
}

// ── Agent Action Timeline (shared) ──────────────────────────────────

const ACTION_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
    crm_lookup: { icon: '🔍', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
    refund: { icon: '💳', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
    voucher: { icon: '🎟️', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
    transfer: { icon: '↗️', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
    note: { icon: '📝', color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
    accept: { icon: '✅', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
    resolve: { icon: '🏁', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
    tag: { icon: '🏷️', color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
    hold: { icon: '⏸️', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
}

function ChatAgentActionTimeline({ actions }: { actions: AgentAction[] }) {
    if (!actions || actions.length === 0) return null
    return (
        <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
            <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
                <Zap size={16} style={{ color: 'var(--primary)' }} />
                <span className="font-semibold">Agent Actions</span>
                <span className="text-xs text-muted">{actions.length} events</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                <div style={{
                    position: 'absolute', left: 14, top: 8, bottom: 8,
                    width: 2, background: 'var(--border-light)', borderRadius: 2, zIndex: 0,
                }} />
                {actions.map((action: AgentAction, i: number) => {
                    const cfg = ACTION_CONFIG[action.type] || { icon: '⚡', color: '#64748b', bg: 'rgba(100,116,139,0.08)' }
                    const timeStr = safeDate(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    return (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', position: 'relative', zIndex: 1 }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                background: cfg.bg, border: `1.5px solid ${cfg.color}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                            }}>{cfg.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{action.label}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
                                </div>
                                {action.detail && (
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>{action.detail}</div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Chat Detail View ────────────────────────────────────────────────

function ChatDetailView({ conversationId, contactPhone, onBack }: { conversationId: string; contactPhone?: string; onBack: () => void }) {
    const { fetchApi, isInitialized } = useApi()
    const [data, setData] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!isInitialized) return
        let cancelled = false

        async function load() {
            try {
                setIsLoading(true)
                const res = await fetchApi<{ data: any }>(`/api/conversations/${conversationId}`)
                if (!cancelled) {
                    setData(res.data)
                    setIsLoading(false)
                }
            } catch {
                if (!cancelled) setIsLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [conversationId, fetchApi, isInitialized])

    if (isLoading) {
        return (
            <div className="flex justify-center items-center" style={{ padding: 40 }}>
                <Loader2 size={24} className="spin" style={{ color: "var(--primary)" }} />
            </div>
        )
    }

    const conversation = data?.conversation
    const messages = data?.messages || []
    const agentActions: AgentAction[] = data?.agentActions || []

    return (
        <div className="call-detail-view animate-fade-in">
            <button className="btn btn-sm btn-secondary" onClick={onBack}>
                <ArrowLeft size={14} /> Back
            </button>

            {/* Contact 360 — 嵌入联系人画像 */}
            {contactPhone && (
                <div style={{ marginTop: 12 }}>
                    <ContactContext360 callerId={contactPhone} />
                </div>
            )}

            {/* Chat Info Card */}
            <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
                <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
                    <MessageSquare size={16} style={{ color: "var(--primary)" }} />
                    <span className="font-semibold">Conversation Details</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Channel</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                            {conversation?.channel || '—'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Messages</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{conversation?.messageCount || messages.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                            {conversation?.status || '—'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolved</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                            {conversation?.resolvedAt ? safeDate(conversation.resolvedAt).toLocaleString() : '—'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Messages */}
            {messages.length > 0 && (
                <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
                    <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
                        <MessageCircle size={16} style={{ color: "var(--primary)" }} />
                        <span className="font-semibold">Messages</span>
                        <span className="text-xs text-muted">{messages.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
                        {messages.map((msg: any, i: number) => {
                            const isAgent = msg.sender_role === 'agent' || msg.senderRole === 'agent'
                            const isBot = msg.sender_role === 'bot' || msg.senderRole === 'bot'
                            return (
                                <div key={i} style={{
                                    display: 'flex',
                                    flexDirection: isAgent ? 'row-reverse' : 'row',
                                    alignItems: 'flex-end',
                                    gap: 8,
                                }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: isAgent ? 'var(--primary)' : isBot ? '#8b5cf6' : '#9ca3af',
                                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, fontWeight: 600, flexShrink: 0,
                                    }}>
                                        {isAgent ? 'A' : isBot ? 'B' : 'C'}
                                    </div>
                                    <div style={{ maxWidth: '80%' }}>
                                        <div style={{
                                            fontSize: 11, fontWeight: 500, marginBottom: 2,
                                            color: isAgent ? 'var(--primary)' : isBot ? '#8b5cf6' : '#6b7280',
                                            textAlign: isAgent ? 'right' as const : 'left' as const,
                                        }}>
                                            {msg.sender_name || (isAgent ? 'Agent' : 'Customer')} · {isAgent ? 'Agent' : isBot ? 'Bot' : 'Customer'}
                                        </div>
                                        <div style={{
                                            padding: '8px 12px',
                                            borderRadius: isAgent ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                            background: isAgent ? 'var(--primary)' : 'var(--surface-bg)',
                                            color: isAgent ? 'white' : 'var(--text-primary)',
                                            fontSize: 13, lineHeight: 1.5,
                                            border: isAgent ? 'none' : '1px solid var(--border-light)',
                                        }}>
                                            {msg.content_text || msg.text || msg.content || ''}
                                            <div style={{
                                                fontSize: 10, marginTop: 4, opacity: 0.6,
                                            }}>
                                                {safeDate(msg.created_at || msg.timestamp).toLocaleTimeString([], {
                                                    hour: '2-digit', minute: '2-digit'
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Agent Actions Timeline */}
            <ChatAgentActionTimeline actions={agentActions} />
        </div>
    )
}

// ── Contact Group Card (手风琴) ─────────────────────────────────────

function ContactGroupCard({
    group,
    onToggle,
    onSelectCall,
    onSelectChat,
}: {
    group: ContactGroup
    onToggle: () => void
    onSelectCall: (id: string) => void
    onSelectChat: (id: string) => void
}) {
    const displayName = group.contact?.name || normalizeSIP(group.contactNumber)
    const totalInteractions = group.callCount + group.chatCount

    return (
        <div className="contact-group-card">
            {/* 折叠态卡片 */}
            <div className="group-header" onClick={onToggle}>
                <div className="group-avatar">
                    {group.contact?.name ? group.contact.name.charAt(0).toUpperCase() : (
                        <User size={14} />
                    )}
                </div>
                <div className="group-info">
                    <div className="group-top-row">
                        <span className="group-name">
                            {displayName}
                            {group.contact?.verified && <span title="Verified" style={{ marginLeft: 4, fontSize: 11 }}>✅</span>}
                        </span>
                        <TierBadge tier={group.contact?.tier} />
                        <span className="group-time">{formatTime(group.latestTime)}</span>
                    </div>
                    {group.contact?.company && (
                        <div className="group-company">{group.contact.company}</div>
                    )}
                    <div className="group-stats-row">
                        {group.callCount > 0 && (
                            <span className="group-stat"><Phone size={10} /> {group.callCount}</span>
                        )}
                        {group.chatCount > 0 && (
                            <span className="group-stat"><MessageSquare size={10} /> {group.chatCount}</span>
                        )}
                        {group.totalDuration > 0 && (
                            <span className="group-stat"><Timer size={10} /> {formatDuration(group.totalDuration)}</span>
                        )}
                        {group.successCount > 0 && (
                            <span className="group-stat group-stat-success">✅ {group.successCount}</span>
                        )}
                        {group.missedCount > 0 && (
                            <span className="group-stat group-stat-missed">❌ {group.missedCount}</span>
                        )}
                    </div>
                    {group.latestSummary && (
                        <div className="summary-preview">{group.latestSummary}</div>
                    )}
                </div>
                <div className="group-expand-icon">
                    {group.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
            </div>

            {/* 展开态明细 */}
            {group.expanded && (
                <div className="group-detail-list">
                    {group.detailLoading && (
                        <div className="flex justify-center items-center" style={{ padding: 16 }}>
                            <Loader2 size={16} className="spin" style={{ color: 'var(--primary)' }} />
                        </div>
                    )}
                    {group.detailItems?.map((item, idx) => {
                        const isMissed = item.type === 'call' && (item.status === 'missed' || item.status === 'no_answer' || item.status === 'cancelled')
                        return (
                            <div
                                key={`${item.type}-${item.id}-${idx}`}
                                className={`detail-item ${isMissed ? 'missed' : ''}`}
                                onClick={() => {
                                    if (item.type === 'call') onSelectCall(item.id)
                                    else onSelectChat(item.id)
                                }}
                            >
                                <div className="item-icon-sm">
                                    <TypeIcon item={item} />
                                </div>
                                <div className="detail-item-info">
                                    <span className="detail-item-time">{formatTime(item.startTime)}</span>
                                    <ChannelBadge channel={item.channel} />
                                    {item.type === 'call' && item.duration > 0 && (
                                        <span className="meta-chip"><Timer size={9} /> {formatDuration(item.duration)}</span>
                                    )}
                                    {item.type === 'chat' && item.messageCount > 0 && (
                                        <span className="meta-chip"><MessageCircle size={9} /> {item.messageCount}</span>
                                    )}
                                    <OutcomeBadge outcome={item.outcome} />
                                </div>
                                <ChevronRight size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />
                            </div>
                        )
                    })}
                    {!group.detailLoading && group.detailItems?.length === 0 && (
                        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No detail records</div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main HistoryList Component ──────────────────────────────────────

export function HistoryList() {
    const {
        viewMode, switchView,
        groups, groupsTotal, hasMoreGroups, toggleGroupExpand,
        items, hasMore,
        stats, isLoading, error,
        isInitialized, typeFilter, search, setTypeFilter, setSearch,
        loadMore, refresh
    } = useActivityHistory()

    const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
    const [selectedContactPhone, setSelectedContactPhone] = useState<string | undefined>()
    const [searchInput, setSearchInput] = useState('')
    const [initialLoaded, setInitialLoaded] = useState(false)

    // Initial load
    useEffect(() => {
        if (isInitialized && !initialLoaded) {
            loadMore(true)
            setInitialLoaded(true)
        }
    }, [isInitialized, loadMore, initialLoaded])

    // Re-load when filter or viewMode changes
    useEffect(() => {
        if (initialLoaded && isInitialized) {
            loadMore(true)
        }
    }, [typeFilter, viewMode])

    // Search debounce
    useEffect(() => {
        if (!initialLoaded) return
        const timer = setTimeout(() => {
            setSearch(searchInput)
            loadMore(true)
        }, 400)
        return () => clearTimeout(timer)
    }, [searchInput])

    // ── Detail Views ──

    if (selectedCallId) {
        return <CallDetailView callId={selectedCallId} onBack={() => setSelectedCallId(null)} />
    }
    if (selectedChatId) {
        return <ChatDetailView
            conversationId={selectedChatId}
            contactPhone={selectedContactPhone}
            onBack={() => { setSelectedChatId(null); setSelectedContactPhone(undefined) }}
        />
    }

    // ── Timeline view items ──
    const timelineGroups = groupByDate(items)
    const isMissed = (item: ActivityItem) =>
        item.type === 'call' && (item.status === 'missed' || item.status === 'no_answer' || item.status === 'cancelled')

    return (
        <div className="history-timeline animate-fade-in">
            <StatsBar stats={stats} />

            {/* Search + Filters + View Toggle */}
            <div className="history-controls">
                <div className="search-row">
                    <Search size={14} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search by number or name..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="search-input"
                    />
                </div>
                <div className="filter-row">
                    {(['all', 'call', 'chat'] as TypeFilter[]).map((f) => (
                        <button
                            key={f}
                            className={`filter-btn ${typeFilter === f ? 'active' : ''}`}
                            onClick={() => setTypeFilter(f)}
                        >
                            {f === 'all' ? 'All' : f === 'call' ? '📞 Calls' : '💬 Chats'}
                        </button>
                    ))}
                    <div className="view-toggle">
                        <button
                            className={`view-btn ${viewMode === 'grouped' ? 'active' : ''}`}
                            onClick={() => switchView('grouped')}
                            title="Contact View"
                        >
                            <Users size={13} />
                        </button>
                        <button
                            className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                            onClick={() => switchView('timeline')}
                            title="Timeline View"
                        >
                            <List size={13} />
                        </button>
                    </div>
                    <button className="filter-btn refresh-btn" onClick={refresh} title="Refresh">
                        <RefreshCw size={13} />
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {isLoading && ((viewMode === 'grouped' && groups.length === 0) || (viewMode === 'timeline' && items.length === 0)) && (
                <div className="flex justify-center items-center" style={{ padding: 40 }}>
                    <Loader2 size={24} className="spin" style={{ color: "var(--primary)" }} />
                </div>
            )}

            {/* Empty State */}
            {!isLoading && ((viewMode === 'grouped' && groups.length === 0) || (viewMode === 'timeline' && items.length === 0)) && (
                <div className="empty-state">
                    <Clock size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                    <p className="text-sm text-muted">No activity history yet</p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="error-banner">
                    <p className="text-sm">{error}</p>
                    <button className="btn btn-sm btn-secondary" onClick={refresh}>Retry</button>
                </div>
            )}

            {/* ═══ GROUPED VIEW ═══ */}
            {viewMode === 'grouped' && (
                <div className="contact-groups">
                    {groups.map((group) => (
                        <ContactGroupCard
                            key={group.contactNumber}
                            group={group}
                            onToggle={() => toggleGroupExpand(group.contactNumber)}
                            onSelectCall={(id) => {
                                setSelectedContactPhone(group.contactNumber)
                                setSelectedCallId(id)
                            }}
                            onSelectChat={(id) => {
                                setSelectedContactPhone(group.contactNumber)
                                setSelectedChatId(id)
                            }}
                        />
                    ))}
                </div>
            )}

            {/* ═══ TIMELINE VIEW ═══ */}
            {viewMode === 'timeline' && (
                <div className="timeline-groups">
                    {timelineGroups.map((group) => (
                        <div key={group.label} className="timeline-group">
                            <div className="date-header">{group.label}</div>
                            {group.items.map((item, idx) => (
                                <div
                                    key={`${item.type}-${item.id || 'noid'}-${idx}`}
                                    className={`timeline-item ${isMissed(item) ? 'missed' : ''}`}
                                    onClick={() => {
                                        if (item.type === 'call') setSelectedCallId(item.id)
                                        else setSelectedChatId(item.id)
                                    }}
                                >
                                    <div className="item-icon">
                                        <TypeIcon item={item} />
                                    </div>
                                    <div className="item-info">
                                        <div className="item-top-row">
                                            <span className="item-name">
                                                {item.displayName ? normalizeSIP(item.displayName) : (
                                                    item.type === 'chat' ? `Chat #${item.id.slice(-6)}` : 'Unknown'
                                                )}
                                            </span>
                                            <span className="item-time">{formatTime(item.startTime)}</span>
                                        </div>
                                        <div className="item-meta-row">
                                            <ChannelBadge channel={item.channel} />
                                            {item.type === 'call' && item.duration > 0 && (
                                                <span className="meta-chip">
                                                    <Timer size={10} /> {formatDuration(item.duration)}
                                                </span>
                                            )}
                                            {item.type === 'chat' && item.messageCount > 0 && (
                                                <span className="meta-chip">
                                                    <MessageCircle size={10} /> {item.messageCount} msgs
                                                </span>
                                            )}
                                            <OutcomeBadge outcome={item.outcome} />
                                        </div>
                                        {item.summaryPreview && (
                                            <div className="summary-preview">{item.summaryPreview}</div>
                                        )}
                                    </div>
                                    <ChevronDown size={14} className="item-chevron" style={{ transform: 'rotate(-90deg)' }} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {/* Load More */}
            {((viewMode === 'grouped' && hasMoreGroups && groups.length > 0) ||
                (viewMode === 'timeline' && hasMore && items.length > 0)) && (
                    <button
                        className="btn btn-sm btn-secondary load-more-btn"
                        onClick={() => loadMore(false)}
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 size={14} className="spin" /> : 'Load More'}
                    </button>
                )}

            <style>{`
                .history-timeline {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                /* Stats Bar */
                .stats-bar {
                    display: flex; align-items: center; gap: 8px;
                    padding: 6px 0; margin-bottom: 4px;
                }
                .stats-today-label {
                    font-size: 11px; font-weight: 600; color: var(--text-muted);
                    text-transform: uppercase; letter-spacing: 0.05em;
                }
                .stat-chip {
                    display: inline-flex; align-items: center; gap: 3px;
                    font-size: 12px; font-weight: 600; color: var(--text-primary);
                    padding: 2px 8px; border-radius: 10px;
                    background: var(--surface-bg); border: 1px solid var(--border-light);
                }
                .stat-chip.stat-missed {
                    color: #ef4444; border-color: rgba(239,68,68,0.3);
                    background: rgba(239,68,68,0.05); font-weight: 500;
                }

                /* Controls */
                .history-controls { display: flex; flex-direction: column; gap: 8px; }
                .search-row { position: relative; display: flex; align-items: center; }
                .search-icon { position: absolute; left: 10px; color: var(--text-muted); }
                .search-input {
                    width: 100%; padding: 8px 8px 8px 30px;
                    border: 1px solid var(--border-light); border-radius: var(--radius-sm);
                    background: var(--surface-bg); font-size: 13px; color: var(--text-primary);
                    outline: none; transition: border-color 0.2s;
                }
                .search-input:focus { border-color: var(--primary); }
                .filter-row { display: flex; gap: 4px; align-items: center; }
                .filter-btn {
                    padding: 4px 10px; border: 1px solid var(--border-light);
                    border-radius: 14px; background: var(--surface-bg);
                    font-size: 12px; color: var(--text-muted); cursor: pointer;
                    transition: all 0.2s; font-family: inherit;
                }
                .filter-btn:hover { background: var(--hover-bg); }
                .filter-btn.active {
                    background: var(--primary); color: white; border-color: var(--primary);
                }
                .refresh-btn { margin-left: auto; padding: 4px 8px; }

                /* View Toggle */
                .view-toggle {
                    display: flex; border: 1px solid var(--border-light);
                    border-radius: 6px; overflow: hidden; margin-left: 4px;
                }
                .view-btn {
                    padding: 4px 8px; background: var(--surface-bg);
                    border: none; cursor: pointer; display: flex;
                    align-items: center; color: var(--text-muted);
                    transition: all 0.2s; font-family: inherit;
                }
                .view-btn:first-child { border-right: 1px solid var(--border-light); }
                .view-btn.active {
                    background: var(--primary); color: white;
                }
                .view-btn:hover:not(.active) { background: var(--hover-bg); }

                /* ═══ Contact Group Card ═══ */
                .contact-groups { display: flex; flex-direction: column; gap: 6px; }
                .contact-group-card {
                    border: 1px solid var(--border-light); border-radius: var(--radius-md);
                    overflow: hidden; background: var(--surface-bg);
                    transition: border-color 0.2s;
                }
                .contact-group-card:hover { border-color: var(--primary); }

                .group-header {
                    display: flex; align-items: flex-start; gap: 10px;
                    padding: 12px; cursor: pointer; transition: background 0.15s;
                }
                .group-header:hover { background: var(--hover-bg); }

                .group-avatar {
                    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
                    background: linear-gradient(135deg, var(--primary), #a855f7);
                    color: white; font-weight: 700; font-size: 14px;
                    display: flex; align-items: center; justify-content: center;
                    margin-top: 2px;
                }
                .group-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
                .group-top-row {
                    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
                }
                .group-name {
                    font-size: 14px; font-weight: 600; color: var(--text-primary);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .group-company {
                    font-size: 11px; color: var(--text-muted); margin-top: -1px;
                }
                .group-time {
                    font-size: 11px; color: var(--text-muted); margin-left: auto; flex-shrink: 0;
                }
                .group-stats-row {
                    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                }
                .group-stat {
                    display: inline-flex; align-items: center; gap: 3px;
                    font-size: 11px; color: var(--text-muted); font-weight: 500;
                }
                .group-stat-success { color: #16a34a; }
                .group-stat-missed { color: #ef4444; }
                .group-expand-icon {
                    color: var(--text-muted); opacity: 0.5; margin-top: 4px; flex-shrink: 0;
                }

                /* Group Detail List */
                .group-detail-list {
                    border-top: 1px solid var(--border-light);
                    background: rgba(0,0,0,0.02);
                }
                .detail-item {
                    display: flex; align-items: center; gap: 8px;
                    padding: 8px 12px 8px 20px; cursor: pointer;
                    transition: background 0.15s;
                    border-bottom: 1px solid var(--border-light);
                }
                .detail-item:last-child { border-bottom: none; }
                .detail-item:hover { background: var(--hover-bg); }
                .detail-item.missed { background: rgba(239,68,68,0.03); }
                .item-icon-sm {
                    flex-shrink: 0; width: 22px; height: 22px;
                    display: flex; align-items: center; justify-content: center;
                }
                .detail-item-info {
                    flex: 1; display: flex; align-items: center; gap: 6px;
                    flex-wrap: wrap; min-width: 0;
                }
                .detail-item-time {
                    font-size: 12px; font-weight: 600; color: var(--text-primary);
                    font-variant-numeric: tabular-nums;
                }

                /* ═══ Timeline View (preserved) ═══ */
                .timeline-groups { display: flex; flex-direction: column; gap: 4px; }
                .date-header {
                    font-size: 11px; font-weight: 600; color: var(--text-muted);
                    text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 4px 4px;
                }
                .timeline-item {
                    display: flex; align-items: flex-start; gap: 10px;
                    padding: 10px 12px; border-radius: var(--radius-md);
                    cursor: pointer; transition: background 0.15s;
                    border-left: 3px solid transparent;
                }
                .timeline-item:hover { background: var(--hover-bg); }
                .timeline-item.missed {
                    border-left-color: #ef4444; background: rgba(239,68,68,0.03);
                }
                .timeline-item.missed:hover { background: rgba(239,68,68,0.06); }

                .item-icon {
                    flex-shrink: 0; width: 28px; height: 28px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 50%; background: var(--surface-bg);
                    border: 1px solid var(--border-light); margin-top: 2px;
                }
                .item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
                .item-top-row { display: flex; justify-content: space-between; align-items: center; }
                .item-name {
                    font-size: 13px; font-weight: 600; color: var(--text-primary);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .item-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; margin-left: 8px; }
                .item-meta-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .meta-chip {
                    display: inline-flex; align-items: center; gap: 3px;
                    font-size: 11px; color: var(--text-muted);
                }
                .summary-preview {
                    font-size: 12px; color: var(--text-muted); line-height: 1.4;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    margin-top: 2px; font-style: italic; opacity: 0.8;
                }
                .item-chevron {
                    flex-shrink: 0; color: var(--text-muted); opacity: 0.4; margin-top: 6px;
                }
                .badge-neutral {
                    font-size: 10px; padding: 2px 6px; border-radius: 4px;
                    color: var(--text-muted); background: var(--surface-bg);
                    border: 1px solid var(--border-light);
                }

                /* Empty / Error */
                .empty-state {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; padding: 40px 20px; text-align: center;
                }
                .error-banner {
                    padding: 12px; background: rgba(239,68,68,0.05);
                    border: 1px solid rgba(239,68,68,0.2); border-radius: var(--radius-sm);
                    display: flex; align-items: center; justify-content: space-between; gap: 8px;
                }
                .load-more-btn { align-self: center; margin: 8px 0; }

                .spin { animation: spin 1s linear infinite; }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
