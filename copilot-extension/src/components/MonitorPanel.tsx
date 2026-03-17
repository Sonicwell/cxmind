import { useState, useEffect, useCallback } from "react"
import { useApi } from "~/hooks/useApi"
import { useAgentStatus } from "~/hooks/useAgentStatus"
import { Users, Phone, Clock, MessageSquare, RefreshCw, ChevronLeft, AlertTriangle } from "lucide-react"

interface AgentInsights {
    abnormalWrapups: number
    statusFlapCount: number
    utilization: number
    nonAdherent?: boolean
}

interface AgentMonitorData {
    id: string
    name: string
    sipNumber: string
    online: boolean
    status: string
    callsToday: number
    avgDuration: number
    chatsToday: number
    avatar?: string | null
    insights?: AgentInsights
}

interface TeamSummary {
    total: number
    online: number
    calls: number
    avgDuration: number
}

function formatDuration(s: number): string {
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}m${sec > 0 ? ` ${sec}s` : ''}`
}

export function MonitorPanel() {
    const { fetchApi, hasToken, isInitialized, apiUrl } = useApi()
    const { getStatusColor } = useAgentStatus()
    const [agents, setAgents] = useState<AgentMonitorData[]>([])
    const [summary, setSummary] = useState<TeamSummary>({ total: 0, online: 0, calls: 0, avgDuration: 0 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Full data load (initial + periodic stats refresh)
    const load = useCallback(async () => {
        try {
            setError(null)
            const data = await fetchApi<{ agents: AgentMonitorData[]; summary: TeamSummary }>('/api/team-monitor')
            setAgents(data.agents || [])
            setSummary(data.summary || { total: 0, online: 0, calls: 0, avgDuration: 0 })
        } catch (e: any) {
            setError(e.message || 'Failed to load')
        } finally {
            setLoading(false)
        }
    }, [fetchApi])

    // Initial load + 60s stats polling (calls/chats change slowly)
    useEffect(() => {
        if (!isInitialized || !hasToken) return
        load()
        const timer = setInterval(load, 60000) // 60s for stats refresh
        return () => clearInterval(timer)
    }, [isInitialized, hasToken, load])

    // Real-time: listen for agent:status_change via WebSocket
    useEffect(() => {
        const listener = (msg: any) => {
            if (msg.type !== 'agent:status_change' || !msg.data) return
            const { agentId, status } = msg.data
            if (!agentId || !status) return

            setAgents(prev => {
                const updated = prev.map(a => {
                    if (a.id !== agentId) return a
                    return { ...a, status, online: status !== 'offline' }
                })
                // Recalculate online count
                setSummary(s => ({ ...s, online: updated.filter(a => a.online).length }))
                return updated
            })
        }
        chrome.runtime?.onMessage?.addListener(listener)
        return () => chrome.runtime?.onMessage?.removeListener(listener)
    }, [])

    return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Team Monitor
                    </h2>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Real-time agent overview
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 4,
                    }}
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                <SummaryCard label="Total" value={String(summary.total)} icon={<Users size={12} />} color="var(--primary)" />
                <SummaryCard label="Online" value={String(summary.online)} icon={<span style={{ fontSize: 10 }}>🟢</span>} color="var(--success)" />
                <SummaryCard label="Calls" value={String(summary.calls)} icon={<Phone size={12} />} color="#f59e0b" />
                <SummaryCard label="Avg Dur" value={formatDuration(summary.avgDuration)} icon={<Clock size={12} />} color="#8b5cf6" />
            </div>

            {/* Agent List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {error ? (
                    <div className="glass-panel" style={{ padding: 16, textAlign: 'center', color: 'var(--danger)', fontSize: '0.75rem' }}>
                        {error}
                    </div>
                ) : agents.length === 0 && !loading ? (
                    <div className="glass-panel" style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No agents found
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {agents.map(agent => {
                            const borderColor = getStatusColor(agent.status)
                            const avatarSrc = agent.avatar
                                ? (agent.avatar.startsWith('http') ? agent.avatar : `${apiUrl}${agent.avatar}`)
                                : null
                            const initial = agent.name?.charAt(0)?.toUpperCase() || '?'
                            return (
                                <div key={agent.id} className="glass-panel" style={{
                                    padding: '8px 12px',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    opacity: agent.online ? 1 : 0.45,
                                    transition: 'opacity 0.3s',
                                }}>
                                    {/* Avatar with status border */}
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                        border: `2px solid ${borderColor}`,
                                        boxShadow: agent.online ? `0 0 6px ${borderColor}40` : 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        overflow: 'hidden',
                                        background: avatarSrc ? 'transparent' : 'rgba(108,75,245,0.15)',
                                        fontSize: '0.65rem', fontWeight: 700, color: 'var(--primary)',
                                    }}>
                                        {avatarSrc ? (
                                            <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).parentElement!.textContent = initial); }} />
                                        ) : initial}
                                    </div>

                                    {/* Name + SIP + status */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.78rem', fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                        }}>
                                            {agent.name}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                            {agent.sipNumber} · {agent.status}
                                            {agent.insights && agent.insights.utilization > 0 && (
                                                <span style={{ marginLeft: 6, color: 'var(--primary)' }}>
                                                    · {agent.insights.utilization}% util
                                                </span>
                                            )}
                                        </div>
                                        {agent.insights && (agent.insights.abnormalWrapups > 0 || agent.insights.statusFlapCount > 3 || agent.insights.nonAdherent) && (
                                            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                                {agent.insights.nonAdherent && (
                                                    <span style={{ fontSize: '0.55rem', padding: '1px 4px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        <AlertTriangle size={8} /> Late Login
                                                    </span>
                                                )}
                                                {agent.insights.abnormalWrapups > 0 && (
                                                    <span style={{ fontSize: '0.55rem', padding: '1px 4px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        <AlertTriangle size={8} /> Long Wrapups
                                                    </span>
                                                )}
                                                {agent.insights.statusFlapCount > 3 && (
                                                    <span style={{ fontSize: '0.55rem', padding: '1px 4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        <AlertTriangle size={8} /> High Flaps
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Stats */}
                                    <div style={{ display: 'flex', gap: 12, flexShrink: 0, fontSize: '0.7rem' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{agent.callsToday}</div>
                                            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>calls</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatDuration(agent.avgDuration)}</div>
                                            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>avg</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{agent.chatsToday}</div>
                                            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>chats</div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    )
}

function SummaryCard({ label, value, icon, color }: {
    label: string; value: string; icon: React.ReactNode; color: string
}) {
    return (
        <div className="glass-panel" style={{
            padding: '6px 8px', textAlign: 'center',
        }}>
            <div style={{ color, marginBottom: 2 }}>{icon}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{label}</div>
        </div>
    )
}
