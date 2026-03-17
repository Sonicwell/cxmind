
import { useEffect, useRef, useState, useCallback } from "react"
import { MessageSquare, PictureInPicture2, ChevronDown, ChevronUp, Search, X } from "lucide-react"
import type { Transcription } from "~/hooks/useWebSocket"
import { useAuth } from "~/hooks/useAuth"
import { useApi } from "~/hooks/useApi"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslation } from "react-i18next"

interface TranscriptionListProps {
    transcriptions: Transcription[]
    onPopOut?: () => void
    pipSupported?: boolean
    pipOpen?: boolean
    forceExpanded?: boolean
}

function normalizeSIP(uri: string): string {
    if (!uri) return ""
    const match = uri.match(/sip:([^@]+)/) || uri.match(/^(\d+)$/) || uri.match(/^([^"<]+)/)
    return match ? match[1].trim() : uri.trim()
}

function getInitials(name: string): string {
    const clean = normalizeSIP(name)
    return clean.slice(0, 1).toUpperCase()
}

// 关键字高亮：将匹配到的词包裹在 <mark> 标签（内联样式）中
function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"))
    return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
            ? <mark key={i} style={{ background: '#fde68a', borderRadius: 2, padding: '0 2px', color: '#92400e' }}>{part}</mark>
            : part
    )
}

export function TranscriptionList({ transcriptions, onPopOut, pipSupported, pipOpen, forceExpanded }: TranscriptionListProps) {
    const bottomRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const { agentInfo } = useAuth()
    const { fetchApi, apiUrl } = useApi()
    const { t } = useTranslation()

    const [isNearBottom, setIsNearBottom] = useState(true)
    const [hasNewMessages, setHasNewMessages] = useState(false)
    const prevLengthRef = useRef(transcriptions.length)

    // 折叠状态：默认折叠，但 forceExpanded 时始终展开
    const [collapsed, setCollapsed] = useState(!forceExpanded)
    // 未读计数（折叠时累积）
    const [unreadCount, setUnreadCount] = useState(0)
    // 搜索状态
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // 坐席头像 URL（拼接 apiUrl）
    const agentAvatarUrl = agentInfo?.avatar
        ? (agentInfo.avatar.startsWith('http') ? agentInfo.avatar : `${apiUrl}${agentInfo.avatar}`)
        : null

    // 客户头像：从 Contact 360 batch-lookup 获取（仅查一次）
    const [contactAvatarUrl, setContactAvatarUrl] = useState<string | null>(null)
    const contactLookedUpRef = useRef(false)

    // scroll 位置跟踪
    const handleScroll = useCallback(() => {
        const el = scrollContainerRef.current
        if (!el) return
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        setIsNearBottom(nearBottom)
        if (nearBottom) setHasNewMessages(false)
    }, [])

    // 新消息处理：展开时自动滚到底，折叠时累加未读
    useEffect(() => {
        if (transcriptions.length > prevLengthRef.current) {
            if (!collapsed && isNearBottom) {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" })
            } else if (!collapsed && !isNearBottom) {
                setHasNewMessages(true)
            } else if (collapsed) {
                setUnreadCount(c => c + (transcriptions.length - prevLengthRef.current))
            }
        }
        prevLengthRef.current = transcriptions.length
    }, [transcriptions.length, isNearBottom, collapsed])

    // 展开时清除未读
    const handleToggleCollapse = useCallback(() => {
        if (forceExpanded) return // 宽屏下禁止折叠
        setCollapsed(prev => {
            if (prev) {
                setUnreadCount(0)
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 200)
            } else {
                setSearchOpen(false)
                setSearchQuery("")
            }
            return !prev
        })
    }, [forceExpanded])

    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
        setHasNewMessages(false)
        setIsNearBottom(true)
    }, [])

    // 打开搜索框时聚焦
    const handleSearchToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        setSearchOpen(prev => {
            if (!prev) {
                setTimeout(() => searchInputRef.current?.focus(), 50)
            } else {
                setSearchQuery("")
            }
            return !prev
        })
    }, [])

    const myNumber = agentInfo ? normalizeSIP(agentInfo.sipNumber) : ""

    // 首条非坐席消息出现时查找客户 contact avatar
    useEffect(() => {
        if (contactLookedUpRef.current || !transcriptions.length || !myNumber) return
        const custMsg = transcriptions.find(tr => {
            const spk = normalizeSIP(tr.speaker || '')
            return !(spk === myNumber || tr.speaker?.includes(myNumber)) && !/^(Me|Agent)$/i.test(tr.speaker || '')
        })
        if (!custMsg) return
        contactLookedUpRef.current = true
        const custNumber = normalizeSIP(custMsg.speaker)
        fetchApi<{ contacts: Record<string, { avatar?: string; name?: string }> }>(
            '/api/contacts/batch-lookup',
            {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones: [custNumber] })
            }
        ).then(res => {
            const c = res.contacts?.[custNumber]
            if (c?.avatar) {
                setContactAvatarUrl(c.avatar.startsWith('http') ? c.avatar : `${apiUrl}${c.avatar}`)
            }
        }).catch(() => { })
    }, [transcriptions.length, myNumber, fetchApi, apiUrl])

    // 搜索过滤
    const filteredTranscriptions = searchQuery.trim()
        ? transcriptions.filter(t => (t.text || '').toLowerCase().includes(searchQuery.toLowerCase()))
        : transcriptions

    // 折叠时 preview：最新一条消息
    const latestMsg = transcriptions[transcriptions.length - 1]

    return (
        <div className="transcript-container glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>

            {/* ── Header（始终可见，点击折叠/展开）── */}
            <div
                className="transcript-header"
                onClick={handleToggleCollapse}
                style={{ cursor: 'pointer', userSelect: 'none' }}
            >
                <MessageSquare size={14} style={{ flexShrink: 0 }} />
                <span className="font-medium text-sm">{t('call.transcript')}</span>

                {/* 搜索按钮（展开时才显示） */}
                {!collapsed && (
                    <button
                        onClick={handleSearchToggle}
                        title={searchOpen ? "Close search" : "Search transcript"}
                        style={{
                            marginLeft: 4, padding: 4, borderRadius: '50%', border: 'none', background: searchOpen ? 'rgba(99,102,241,0.1)' : 'transparent',
                            color: searchOpen ? 'var(--primary, #6366f1)' : '#9ca3af', display: 'flex', alignItems: 'center', cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!searchOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)' }}
                        onMouseLeave={e => { if (!searchOpen) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                        {searchOpen ? <X size={13} /> : <Search size={13} />}
                    </button>
                )}

                {/* PiP 弹出按钮 */}
                {!collapsed && pipSupported && !pipOpen && onPopOut && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPopOut(); }}
                        title="Pop Out"
                        className="btn-icon-sm"
                        style={{ padding: 4, borderRadius: 6, color: '#6b7280', display: 'flex', alignItems: 'center' }}
                    >
                        <PictureInPicture2 size={14} />
                    </button>
                )}

                {/* 右侧：消息计数 / 未读角标 */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {unreadCount > 0 && collapsed && (
                        <span style={{
                            background: 'var(--primary)', color: '#fff',
                            borderRadius: 10, fontSize: 10, fontWeight: 700,
                            padding: '1px 6px', animation: 'pulse-badge 2s infinite',
                        }}>
                            +{unreadCount}
                        </span>
                    )}
                    <span className="text-xs text-muted">{t('call.msgsCount', { count: transcriptions.length })}</span>
                    {collapsed
                        ? <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        : <ChevronUp size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    }
                </div>
            </div>

            {/* ── 折叠态：最新消息 preview ── */}
            {collapsed && latestMsg && (
                <div
                    onClick={handleToggleCollapse}
                    style={{
                        padding: '7px 16px 8px',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        borderTop: '1px solid var(--glass-border)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(0,0,0,0.015)',
                    }}
                >
                    {/* speaker dot */}
                    <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: (() => {
                            const spk = normalizeSIP(latestMsg.speaker || '')
                            const isMe = (myNumber && (spk === myNumber || latestMsg.speaker?.includes(myNumber))) || /^(Me|Agent)$/i.test(latestMsg.speaker || '')
                            return isMe ? 'var(--primary)' : '#9ca3af'
                        })()
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {latestMsg.text}
                    </span>
                </div>
            )}

            {/* ── 展开态：搜索框 + 消息列表 ── */}
            {!collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* 搜索输入框（展开时显示） */}
                    <AnimatePresence>
                        {searchOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 36, opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                style={{ overflow: 'hidden', borderBottom: '1px solid var(--glass-border)' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', height: 36 }}>
                                    <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                    <input
                                        ref={searchInputRef}
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(""); setSearchOpen(false); } }}
                                        placeholder={t('call.searchTranscript')}
                                        style={{
                                            flex: 1, border: 'none', outline: 'none', background: 'transparent',
                                            fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'inherit',
                                        }}
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery("")}
                                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                    {searchQuery && (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                            {t('call.searchResults', { count: filteredTranscriptions.length })}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 消息列表 */}
                    <div style={{ position: 'relative', minHeight: 0 }}>
                        <div className="chat-container" ref={scrollContainerRef} onScroll={handleScroll}>
                            {filteredTranscriptions.length === 0 && searchQuery ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    {t('call.noResults', { query: searchQuery })}
                                </div>
                            ) : (
                                filteredTranscriptions.map((tr, i) => {
                                    const speaker = normalizeSIP(tr.speaker || '')
                                    const isMe = (myNumber && (speaker === myNumber || tr.speaker?.includes(myNumber))) || tr.speaker === "Me" || /^(Me|Agent)$/i.test(tr.speaker || '')
                                    const initials = isMe && agentInfo?.displayName
                                        ? getInitials(agentInfo.displayName)
                                        : getInitials(tr.speaker)
                                    // 头像优先级：坐席用 agentInfo.avatar，客户用 contact avatar，否则 initials
                                    const avatarUrl = isMe ? agentAvatarUrl : contactAvatarUrl

                                    return (
                                        <div key={i} className={`chat-row ${isMe ? "right" : "left"}`}>
                                            {avatarUrl ? (
                                                <img
                                                    src={avatarUrl}
                                                    alt={isMe ? 'Agent' : 'Customer'}
                                                    className="chat-avatar"
                                                    style={{ objectFit: 'cover' }}
                                                />
                                            ) : (
                                                <div
                                                    className="chat-avatar"
                                                    style={{ background: isMe ? 'var(--primary)' : '#9ca3af' }}
                                                >
                                                    {initials}
                                                </div>
                                            )}
                                            <div style={{ maxWidth: '85%' }}>
                                                <div className="chat-speaker-label">
                                                    {isMe ? t('common.agent') : t('common.customer')}
                                                </div>
                                                <div className="chat-bubble">
                                                    {highlightText(tr.text, searchQuery)}
                                                    <div className="chat-meta" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
                                                        {new Date(tr.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* 新消息提示（未滚到底时） */}
                        {hasNewMessages && (
                            <button
                                onClick={scrollToBottom}
                                style={{
                                    position: 'absolute', bottom: 12, left: '50%',
                                    transform: 'translateX(-50%)',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '6px 14px', borderRadius: 20,
                                    background: 'var(--primary, #6366f1)', color: '#fff',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: 500,
                                    boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
                                    zIndex: 20, animation: 'fadeInUp 0.2s ease-out'
                                }}
                            >
                                <ChevronDown size={14} />
                                {t('call.newMessages')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .transcript-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    background: rgba(255,255,255,0.5);
                    backdrop-filter: blur(8px);
                    transition: background 0.15s;
                }
                .transcript-header:hover {
                    background: rgba(255,255,255,0.75);
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes pulse-badge {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.6; }
                }
            `}</style>
        </div >
    )
}
