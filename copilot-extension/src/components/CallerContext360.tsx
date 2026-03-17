import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { User, Phone, Mail, Clock, MapPin, Star, AlertTriangle, ChevronDown, ChevronUp, ShoppingBag, History, ExternalLink, Sparkles } from "lucide-react"
import { useApi } from "~/hooks/useApi"
import { useModules } from "~/hooks/useModules"

interface CallerInfo {
    id?: string
    name: string
    phone: string
    email?: string
    company?: string
    location?: string
    tier?: 'standard' | 'premium' | 'vip'
    sentiment?: 'positive' | 'neutral' | 'negative'
    totalCalls?: number
    totalContacts?: number
    lastContact?: string
    lastContactAt?: string
    openTickets?: number
    lastOutcome?: { ai?: string; agent?: string }
    ltv?: number           // lifetime value
    tags?: string[]
    notes?: string
    verification?: {
        verified: boolean
        verifiedAt?: string
        method?: string
    }
}

interface ContactContext360Props {
    callerId?: string       // phone number or SIP URI (for calls)
    callerName?: string     // from call event
    activeCallId?: string   // for associating socket events (call only)
    activeConvId?: string   // for associating omni context_brief (chat only)
    contactId?: string      // MongoDB _id (from conversation.contactId)
    email?: string          // visitor email (from conversation metadata)
    visitorId?: string      // webchat visitor ID
    contextBrief?: any      // AI-generated context brief (from parent's useWebSocket)
}

const TIER_STYLES = {
    standard: { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', label: 'Standard' },
    premium: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', label: 'Premium' },
    vip: { bg: 'rgba(255,215,0,0.1)', color: '#eab308', label: '⭐ VIP' },
}

const SENTIMENT_STYLES = {
    positive: { icon: '😊', label: 'Positive', color: '#22c55e' },
    neutral: { icon: '😐', label: 'Neutral', color: '#94a3b8' },
    negative: { icon: '😟', label: 'At Risk', color: '#ef4444' },
}

export function ContactContext360({ callerId, callerName, activeCallId, activeConvId, contactId, email, visitorId, contextBrief }: ContactContext360Props) {
    const { fetchApi, isInitialized } = useApi()
    const { isModuleEnabled } = useModules()
    const [caller, setCaller] = useState<CallerInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [showSearch, setShowSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)

    const [expanded, setExpanded] = useState(true)

    // 通话或会话均可触发 brief 渲染
    const hasActiveSession = !!(activeCallId || activeConvId)

    const load = async (cancelled: boolean) => {
        setLoading(true)
        if (!isModuleEnabled('contacts')) {
            console.log('[C360] contacts module disabled, using fallback')
            if (!cancelled) {
                setCaller({
                    name: callerName || callerId || email || 'Unknown',
                    phone: callerId || '',
                    tier: 'standard',
                    sentiment: 'neutral',
                    totalContacts: 0,
                    lastOutcome: {},
                })
                setLoading(false)
            }
            return
        }

        try {
            // 按优先级拼 lookup URL：contactId > email > visitorId > phone
            let lookupParam = ''
            if (contactId) lookupParam = `contactId=${encodeURIComponent(contactId)}`
            else if (email) lookupParam = `email=${encodeURIComponent(email)}`
            else if (visitorId) lookupParam = `visitorId=${encodeURIComponent(visitorId)}`
            else if (callerId) lookupParam = `phone=${encodeURIComponent(callerId)}`

            const data = await fetchApi(`/api/contact-lookup?${lookupParam}`)
            console.log('[C360] lookup response:', JSON.stringify(data))
            if (!cancelled && data) {
                setCaller({
                    id: data.id,
                    name: data.name || callerName || callerId,
                    phone: data.phone || callerId,
                    email: data.email,
                    company: data.company,
                    location: data.location,
                    tier: data.tier || 'standard',
                    sentiment: data.sentiment || 'neutral',
                    totalCalls: data.totalCalls || 0,
                    totalContacts: data.totalContacts || data.totalCalls || 0,
                    lastContact: data.lastContact,
                    lastContactAt: data.lastContactAt || data.lastContact,
                    openTickets: data.openTickets || 0,
                    lastOutcome: data.lastOutcome || {},
                    ltv: data.ltv,
                    tags: data.tags || [],
                    notes: data.notes,
                    verification: data.verification,
                })
            }
        } catch (err) {
            console.warn('[C360] lookup failed:', err)
            if (!cancelled) {
                setCaller({
                    name: callerName || callerId || email || 'Unknown',
                    phone: callerId || '',
                    tier: 'standard',
                    sentiment: 'neutral',
                    totalContacts: 0,
                    lastOutcome: {},
                })
            }
        }
        if (!cancelled) setLoading(false)
    } // end load()

    useEffect(() => {
        // 至少需要一个标识符才能 lookup
        if (!callerId && !contactId && !email && !visitorId) {
            setLoading(false)
            return
        }
        // 等待 useApi token 加载完成后再发请求
        if (!isInitialized) return
        let cancelled = false
        load(cancelled)
        return () => { cancelled = true }
    }, [callerId, contactId, email, visitorId, isInitialized])

    const handleVerify = async () => {
        if (!caller?.id) return
        try {
            await fetchApi(`/api/copilot/contacts/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId: caller.id, method: 'kba', notes: 'Verified via Copilot' })
            })
            setCaller({ ...caller, verification: { verified: true, method: 'kba' } })
        } catch (e) { console.error('Verify failed', e) }
    }

    const handleUnlink = async () => {
        if (!activeConvId) return
        try {
            await fetchApi(`/api/conversations/${activeConvId}/unlink-contact`, { method: 'POST' })
            setCaller({ ...caller, name: 'Unknown', phone: caller?.phone || '', id: undefined }) // Reset UI temporarily
        } catch (e) { console.error('Unlink failed', e) }
    }

    const doSearch = async (q: string) => {
        setSearchQuery(q)
        if (q.length < 2) { setSearchResults([]); return }
        setSearching(true)
        try {
            const res = await fetchApi(`/api/contacts/search?q=${encodeURIComponent(q)}`)
            setSearchResults(res.data || [])
        } catch (e) {
            console.error('Search failed', e)
        } finally {
            setSearching(false)
        }
    }

    const handleLinkOrMerge = async (targetContactId: string) => {
        if (!activeConvId) return
        try {
            // First bind conversation
            await fetchApi(`/api/conversations/${activeConvId}/link-contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId: targetContactId })
            })
            // If we already had a contactId but it's different, maybe we want to merge?
            // For MVP: simply relink. If user explicitly wants merge, we call merge API.
            if (caller?.id && caller.id !== targetContactId) {
                if (confirm('Do you want to merge the current contact into the selected one?')) {
                    await fetchApi(`/api/contacts/${targetContactId}/merge`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sourceContactId: caller.id })
                    })
                }
            }
            setShowSearch(false)
            load(false) // Reload profile
        } catch (e) {
            console.error('Link/Merge failed', e)
            alert('Operation failed')
        }
    }


    if (loading) {
        return (
            <div className="glass-panel ctx360-card ctx360-loading">
                <div className="ctx360-skeleton" />
                <div className="ctx360-skeleton ctx360-skeleton-short" />
                <Ctx360Styles />
            </div>
        )
    }

    if (!caller) return null

    const tier = TIER_STYLES[caller.tier || 'standard']
    const sentiment = SENTIMENT_STYLES[caller.sentiment || 'neutral']

    const hasExtraDetails = !!(caller.email || caller.company || caller.location || caller.ltv !== undefined || (caller.tags && caller.tags.length > 0) || caller.notes)
    const hasExpandableContent = hasExtraDetails || (hasActiveSession || !!contextBrief)

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel ctx360-card"
        >
            {/* Header row */}
            <div className="ctx360-header" onClick={() => hasExpandableContent && setExpanded(!expanded)} style={{ cursor: hasExpandableContent ? 'pointer' : 'default' }}>
                <div className="ctx360-avatar">
                    {caller.name ? caller.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="ctx360-info">
                    <div className="ctx360-name">
                        {caller.name || 'Unknown Caller'}
                        {caller.verification?.verified ?
                            <span title="Verified identity" style={{ fontSize: '0.8rem', marginLeft: 4 }}>✅</span> :
                            <span title="Unverified" style={{ fontSize: '0.8rem', marginLeft: 4 }}>⚠️</span>
                        }
                        <span className="ctx360-tier" style={{ background: tier.bg, color: tier.color, marginLeft: 'auto' }}>{tier.label}</span>
                    </div>
                    <div className="ctx360-phone">{caller.phone}</div>
                </div>
                {!caller.verification?.verified && caller.id && (
                    <button onClick={(e) => { e.stopPropagation(); handleVerify() }} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}>
                        Verify
                    </button>
                )}
                {(!caller.id && isModuleEnabled('contacts')) && (
                    <button onClick={(e) => { e.stopPropagation(); setShowSearch(true) }} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        🔍 Link
                    </button>
                )}
                <div className="ctx360-sentiment" title={`Sentiment: ${sentiment.label}`}>
                    <span>{sentiment.icon}</span>
                </div>
                {hasExpandableContent && (
                    <button className="ctx360-expand" style={{ pointerEvents: 'none', background: 'transparent', border: 'none', display: 'flex' }}>
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                )}
            </div>

            {/* Quick stats (always visible) */}
            <div className="ctx360-stats">
                {(caller.totalContacts ?? caller.totalCalls) !== undefined && (
                    <div className="ctx360-stat">
                        <Phone size={10} />
                        <span>{caller.totalContacts ?? caller.totalCalls} contacts</span>
                    </div>
                )}
                {(caller.lastContactAt || caller.lastContact) && (
                    <div className="ctx360-stat">
                        <Clock size={10} />
                        <span>Last: {formatRelative(caller.lastContactAt || caller.lastContact!)}</span>
                    </div>
                )}
                {caller.lastOutcome && (caller.lastOutcome.ai || caller.lastOutcome.agent) && (() => {
                    const emojiMap: Record<string, string> = { success: '✅', failure: '❌', follow_up: '🔄' }
                    const ai = caller.lastOutcome!.ai ? emojiMap[caller.lastOutcome!.ai] : null
                    const agent = caller.lastOutcome!.agent ? emojiMap[caller.lastOutcome!.agent] : null
                    const same = ai && agent && caller.lastOutcome!.ai === caller.lastOutcome!.agent
                    return (
                        <div className="ctx360-stat" title="Last outcome">
                            <History size={10} />
                            {same ? (
                                <span>{agent}</span>
                            ) : (
                                <span>
                                    {ai && <span title={`AI: ${caller.lastOutcome!.ai}`}>🤖{ai}</span>}
                                    {agent && <span title={`Agent: ${caller.lastOutcome!.agent}`}> 👤{agent}</span>}
                                </span>
                            )}
                        </div>
                    )
                })()}
                {caller.openTickets !== undefined && caller.openTickets > 0 && (
                    <div className="ctx360-stat ctx360-stat-warn">
                        <AlertTriangle size={10} />
                        <span>{caller.openTickets} open tickets</span>
                    </div>
                )}
            </div>

            <AnimatePresence mode="wait">
                {expanded && hasActiveSession && contextBrief ? (
                    <motion.div
                        key="ctx-brief"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                        className="ctx360-brief-container"
                    >
                        <div className={`ctx360-brief ${contextBrief?.severity === 'critical' || contextBrief?.severity === 'red' ? 'critical' : ''}`}>
                            <div className="ctx360-brief-header">
                                <Sparkles size={14} className={contextBrief?.severity === 'critical' || contextBrief?.severity === 'red' ? 'text-danger' : 'text-primary'} />
                                <span>Context Brief</span>
                            </div>
                            {contextBrief?.actionable_opening && (
                                <p className="ctx360-brief-opening">"{contextBrief.actionable_opening}"</p>
                            )}
                            {contextBrief?.bullets && contextBrief.bullets.length > 0 && (
                                <ul className="ctx360-brief-bullets">
                                    {contextBrief.bullets.map((bullet: string, i: number) => (
                                        <li key={i}>{bullet}</li>
                                    ))}
                                </ul>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                                {caller.id && (
                                    <button className="ctx360-btn-unlink" onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Unlink this conversation from the contact?')) handleUnlink()
                                    }}>
                                        [Unlink]
                                    </button>
                                )}
                                {isModuleEnabled('contacts') && (
                                    <button className="ctx360-btn-unlink" onClick={(e) => {
                                        e.stopPropagation();
                                        setShowSearch(true)
                                    }}>
                                        [Merge Contact]
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ) : expanded && hasActiveSession ? (
                    <motion.div
                        key="ctx-brief-loading"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                        className="ctx360-brief-container"
                    >
                        <div className="ctx360-brief-loading">
                            <Sparkles size={14} className="pulse-animation text-primary" />
                            <span>Generating C9 Context Brief...</span>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {/* Expanded details */}
            <AnimatePresence>
                {expanded && hasExtraDetails && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="ctx360-details">
                            {caller.email && (
                                <div className="ctx360-detail-row">
                                    <Mail size={12} /> <span>{caller.email}</span>
                                </div>
                            )}
                            {caller.company && (
                                <div className="ctx360-detail-row">
                                    <ShoppingBag size={12} /> <span>{caller.company}</span>
                                </div>
                            )}
                            {caller.location && (
                                <div className="ctx360-detail-row">
                                    <MapPin size={12} /> <span>{caller.location}</span>
                                </div>
                            )}
                            {caller.ltv !== undefined && (
                                <div className="ctx360-detail-row">
                                    <Star size={12} /> <span>LTV: ${caller.ltv.toLocaleString()}</span>
                                </div>
                            )}
                            {caller.tags && caller.tags.length > 0 && (
                                <div className="ctx360-tags">
                                    {caller.tags.map(t => (
                                        <span key={t} className="ctx360-tag">{t}</span>
                                    ))}
                                </div>
                            )}
                            {caller.notes && (
                                <div className="ctx360-notes">
                                    <div className="ctx360-notes-label">Notes</div>
                                    <div className="ctx360-notes-text">{caller.notes}</div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Ctx360Styles />

            {/* Search Modal */}
            <AnimatePresence>
                {showSearch && (
                    <div onClick={() => setShowSearch(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, zIndex: 9999 }}>
                        <motion.div onClick={e => e.stopPropagation()} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: 'var(--bg-panel, #1e1e2e)', padding: 16, borderRadius: 12, width: 'calc(100% - 32px)', maxWidth: 320, border: '1px solid var(--glass-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                Find & Bind Contact
                                <button onClick={() => setShowSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', padding: '4px 8px', lineHeight: 1 }}>✕</button>
                            </div>
                            <input
                                autoFocus
                                value={searchQuery}
                                onChange={e => doSearch(e.target.value)}
                                placeholder="Search name, phone, email..."
                                style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary, white)', borderRadius: 6, marginBottom: 12, outline: 'none', boxSizing: 'border-box' }}
                            />
                            {searching && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Searching...</div>}
                            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {searchResults.map(res => (
                                    <div key={res._id} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{res.displayName || 'Unknown'} {res.verification?.verified ? '✅' : ''}</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{(res.identifiers?.phone || []).join(', ') || res.phoneNumber}</div>
                                        </div>
                                        <button onClick={() => handleLinkOrMerge(res._id)} style={{ padding: '4px 10px', fontSize: '0.7rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                            {caller?.id ? 'Merge' : 'Link'}
                                        </button>
                                    </div>
                                ))}
                                {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>No contacts found</div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

function formatRelative(dateStr: string): string {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const days = Math.floor(diffMs / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    return `${Math.floor(days / 30)}mo ago`
}

function Ctx360Styles() {
    return (
        <style>{`
      .ctx360-card { padding: 0; overflow: hidden; }
      .ctx360-loading { padding: 12px; }
      .ctx360-skeleton {
        height: 14px; border-radius: 4px; background: var(--glass-highlight);
        animation: ctx360-shimmer 1.5s infinite;
        margin-bottom: 6px;
      }
      .ctx360-skeleton-short { width: 60%; }
      @keyframes ctx360-shimmer {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.8; }
      }

      .ctx360-header {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; cursor: pointer;
        transition: background 0.2s;
      }
      .ctx360-header:hover { background: var(--glass-highlight); }
      .ctx360-avatar {
        width: 32px; height: 32px; border-radius: 50%;
        background: linear-gradient(135deg, var(--primary), #a855f7);
        color: white; font-weight: 700; font-size: 0.8rem;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .ctx360-info { flex: 1; min-width: 0; }
      .ctx360-name {
        font-weight: 600; font-size: 0.8rem; color: var(--text-primary);
        display: flex; align-items: center; gap: 6px;
      }
      .ctx360-tier {
        font-size: 0.5rem; font-weight: 700; padding: 1px 5px;
        border-radius: 2px; text-transform: uppercase; letter-spacing: 0.3px;
      }
      .ctx360-phone { font-size: 0.68rem; color: var(--text-muted); }
      .ctx360-sentiment { font-size: 1rem; }
      .ctx360-expand {
        background: none; border: none; color: var(--text-muted);
        cursor: pointer; padding: 4px; display: flex;
      }

      .ctx360-stats {
        display: flex; gap: 10px; padding: 6px 12px 10px;
        border-top: 1px solid var(--glass-border);
        flex-wrap: wrap;
      }
      .ctx360-stat {
        display: flex; align-items: center; gap: 3px;
        font-size: 0.62rem; color: var(--text-muted);
      }
      .ctx360-stat-warn { color: #f59e0b; font-weight: 600; }

      .ctx360-brief-container {
        padding: 0 12px 12px;
      }
      .ctx360-brief-loading {
        background: rgba(168, 85, 247, 0.05);
        border: 1px dashed rgba(168, 85, 247, 0.3);
        border-radius: 2px;
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        color: var(--primary);
        font-weight: 500;
        animation: ctx360-pulse 2s infinite;
      }
      @keyframes ctx360-pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      .ctx360-brief {
        background: linear-gradient(145deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.02) 100%);
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: 2px;
        padding: 12px;
        position: relative;
        overflow: hidden;
      }
      .ctx360-brief::before {
        content: '';
        position: absolute;
        top: 0; left: 0; width: 3px; height: 100%;
        background: var(--primary);
      }
      .ctx360-brief.critical {
        background: linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%);
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      .ctx360-brief.critical::before { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
      .ctx360-brief-header {
        display: flex; align-items: center; gap: 6px;
        font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.5px; margin-bottom: 8px;
        color: var(--text-primary);
      }
      .ctx360-brief-opening {
        font-size: 0.85rem; font-weight: 600; color: var(--text-primary);
        line-height: 1.4; margin: 0 0 10px 0; font-style: italic;
      }
      .ctx360-brief-bullets {
        margin: 0; padding-left: 16px; font-size: 0.75rem;
        color: var(--text-secondary); line-height: 1.5;
      }
      .ctx360-brief-bullets li { margin-bottom: 4px; }
      .ctx360-btn-unlink {
        background: none; border: none; font-size: 0.65rem; color: var(--text-muted);
        text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; padding: 2px 4px;
      }
      .ctx360-btn-unlink:hover { color: var(--danger); }

      .ctx360-details {
        padding: 8px 12px 12px;
        border-top: 1px solid var(--glass-border);
        display: flex; flex-direction: column; gap: 6px;
      }
      .ctx360-detail-row {
        display: flex; align-items: center; gap: 6px;
        font-size: 0.7rem; color: var(--text-primary);
      }
      .ctx360-detail-row svg { color: var(--text-muted); flex-shrink: 0; }
      .ctx360-tags {
        display: flex; gap: 4px; flex-wrap: wrap; padding-top: 2px;
      }
      .ctx360-tag {
        font-size: 0.55rem; padding: 2px 6px; border-radius: 2px;
        background: rgba(108,75,245,0.08); color: var(--primary);
        font-weight: 600;
      }
      .ctx360-notes {
        background: var(--glass-highlight); border-radius: 6px; padding: 8px;
      }
      .ctx360-notes-label {
        font-size: 0.6rem; color: var(--text-muted); font-weight: 600;
        text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.3px;
      }
      .ctx360-notes-text {
        font-size: 0.68rem; color: var(--text-primary); line-height: 1.4;
      }
    `}</style>
    )
}

// 兼容旧名称
export const CallerContext360 = ContactContext360
