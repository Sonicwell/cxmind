import { useState, useEffect, useRef } from "react"
import { useAuth } from "~/hooks/useAuth"
import { useApi } from "~/hooks/useApi"
import { useModules } from "~/hooks/useModules"
import { AchievementsPanel, StreakIndicator } from "~/components/AchievementsPanel"
import { LiveFeed } from "~/components/LiveFeed"
import { SOPGuidePanel } from "~/components/SOPGuidePanel"
import { PolicyBadges } from "~/components/PolicyBadges"
import { Phone, MessageSquare, TrendingUp, Clock, ChevronRight, RefreshCw, CalendarClock, MessageCircle } from "lucide-react"
import { AgentStatusCard } from "./AgentStatusCard"
import { useTranslation } from "react-i18next"
import { DEMO_ENABLED } from "~/utils/demo-flag"

interface DailyStats {
    callsToday: number
    avgDuration: number    // seconds
    avgCSAT: number
    compliance: number     // percentage
    chatsResolved: number
    totalCalls: number
    statusDurations?: Record<string, number>
    firstLoginTime?: string | null
    avgWrapupTime?: number
    manualBreakCount?: number
    longestWorkSession?: number
    maxConcurrentChats?: number
}

interface YesterdayStats {
    callCount: number
    avgDuration: number
    quickResolves: number
}

interface TeamAvg {
    avgCalls: number
    avgDuration: number
}

interface HomeDashboardProps {
    hasActiveCall: boolean
    callCount: number             // calls this session
    onNavigate: (tab: string) => void
}

export function HomeDashboard({ hasActiveCall, callCount, onNavigate }: HomeDashboardProps) {
    const { agentInfo } = useAuth()
    const { fetchApi, isInitialized: apiInitialized } = useApi()
    const { isModuleEnabled } = useModules()
    const { t } = useTranslation()
    const [stats, setStats] = useState<DailyStats>({
        callsToday: 0, avgDuration: 0, avgCSAT: 0, compliance: 0, chatsResolved: 0, totalCalls: 0,
    })
    const [loading, setLoading] = useState(true)
    const [nextShift, setNextShift] = useState<{ start: string; end: string } | null>(null)
    const [yesterday, setYesterday] = useState<YesterdayStats | null>(null)
    const [teamAvg, setTeamAvg] = useState<TeamAvg | null>(null)

    // Simulation feedback states
    const [simulatingCall, setSimulatingCall] = useState(false)
    const [simulatingOmni, setSimulatingOmni] = useState(false)

    // Greeting based on time
    const hour = new Date().getHours()
    const greeting = hour < 12 ? t('home.goodMorning') : hour < 17 ? t('home.goodAfternoon') : t('home.goodEvening')
    const firstName = agentInfo?.displayName?.split(' ')[0] || t('common.agent')

    // Load daily stats
    useEffect(() => {
        if (!apiInitialized) return
        let cancelled = false
        const load = async () => {
            setLoading(true)
            try {
                const today = new Date().toISOString().slice(0, 10)
                const data = await fetchApi(`/api/agent-stats?date=${today}`)
                if (!cancelled && data) {
                    setStats({
                        callsToday: data.callCount || 0,
                        avgDuration: data.avgDuration || 0,
                        avgCSAT: data.avgCSAT || 0,
                        compliance: data.compliance || 0,
                        chatsResolved: data.chatsResolved || 0,
                        totalCalls: data.totalCalls || 0,
                        statusDurations: data.statusDurations || {},
                        firstLoginTime: data.firstLoginTime,
                        avgWrapupTime: data.avgWrapupTime || 0,
                        manualBreakCount: data.manualBreakCount || 0,
                        longestWorkSession: data.longestWorkSession || 0,
                        maxConcurrentChats: data.maxConcurrentChats || 0,
                    })
                    if (data.yesterday) setYesterday(data.yesterday)
                    if (data.teamAvg) setTeamAvg(data.teamAvg)
                }
            } catch {
                // Stats API not available — show zeros
            }
            if (!cancelled) setLoading(false)
        }
        load()
        return () => { cancelled = true }
    }, [apiInitialized])

    // Load today's shift for countdown
    useEffect(() => {
        if (!apiInitialized || !isModuleEnabled('wfm')) return
        let cancelled = false
            ; (async () => {
                try {
                    const d = new Date()
                    const y = d.getFullYear()
                    const m = String(d.getMonth() + 1).padStart(2, '0')
                    const day = String(d.getDate()).padStart(2, '0')
                    const today = `${y}-${m}-${day}`
                    const data = await fetchApi(`/api/agent-wfm/my-shifts?startDate=${today}&endDate=${today}`)
                    if (!cancelled && data?.shifts?.length) {
                        const shift = data.shifts[0]
                        setNextShift({ start: shift.startTime, end: shift.endTime })
                    }
                } catch { /* non-critical */ }
            })()
        return () => { cancelled = true }
    }, [apiInitialized, isModuleEnabled])

    // Agent stats for achievements
    const achievementStats = {
        totalCalls: stats.totalCalls || callCount,
        todayCalls: stats.callsToday || callCount,
        avgCSAT: stats.avgCSAT,
        perfectCompliance: stats.compliance >= 90 ? stats.callsToday : 0, // QI score >= 90 算 compliance
        consecutiveCalls: callCount,
        longestCall: 0,
        quickResolves: 0,
        daysActive: 1,
    }

    const formatDuration = (s: number) => {
        if (s <= 0) return '—'
        const m = Math.floor(s / 60)
        return m > 0 ? `${m}m` : `${s}s`
    }

    return (
        <div className="home-dashboard-root" style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
            {/* Greeting */}
            <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {greeting}, {firstName} 👋
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {hasActiveCall ? t('home.onCall')
                        : nextShift ? t('home.shiftTime', { start: nextShift.start, end: nextShift.end })
                            : t('home.readyToHelp')}
                </div>
            </div>

            {/* Demo Control Panel (编译时 flag 控制) */}
            {DEMO_ENABLED && agentInfo?.isDemo && (
                <div className="glass-panel" style={{ padding: '12px 16px', border: '1px dashed #a855f7', background: 'rgba(168, 85, 247, 0.05)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#a855f7', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🎬</span> {t('home.demoConsole')}
                    </div>
                    <div className="demo-console-buttons" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* 统一按钮样式：flex + icon + label 对齐 */}
                        <button
                            onClick={() => {
                                setSimulatingCall(true)
                                setTimeout(() => setSimulatingCall(false), 3000)
                                chrome.runtime.sendMessage({
                                    type: "CALL_NUMBER",
                                    number: "+1(800)555-DEMO"
                                })

                            }}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8,
                                width: '100%', padding: '9px 16px', borderRadius: 8,
                                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: '0.78rem', fontWeight: 600,
                                background: simulatingCall ? '#22c55e' : 'linear-gradient(135deg, #a855f7, #6C4BF5)',
                                color: '#fff',
                                transform: simulatingCall ? 'scale(0.98)' : 'scale(1)',
                                transition: 'all 0.2s',
                                boxShadow: simulatingCall ? 'inset 0 2px 4px rgba(0,0,0,0.1)' : '0 2px 8px rgba(108,75,245,0.3)',
                            }}
                        >
                            <Phone size={15} strokeWidth={2.5} />
                            <span>{simulatingCall ? t('home.callSimSent') : t('home.simulateCall')}</span>
                        </button>
                        <button
                            onClick={() => {
                                setSimulatingOmni(true)
                                setTimeout(() => setSimulatingOmni(false), 8000)
                                chrome.runtime.sendMessage({
                                    type: "demo:trigger_all_omni",
                                })

                            }}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8,
                                width: '100%', padding: '9px 16px', borderRadius: 8,
                                cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: '0.78rem', fontWeight: 600,
                                background: simulatingOmni ? 'rgba(34,197,94,0.1)' : 'transparent',
                                border: `1.5px solid ${simulatingOmni ? '#22c55e' : '#a855f7'}`,
                                color: simulatingOmni ? '#22c55e' : '#a855f7',
                                transform: simulatingOmni ? 'scale(0.98)' : 'scale(1)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <MessageCircle size={15} strokeWidth={2.5} />
                            <span>{simulatingOmni ? t('home.multiIncoming') : t('home.simulateMulti')}</span>
                        </button>
                    </div>

                </div>
            )}

            {/* Status Banner */}
            {hasActiveCall ? (
                <div className="glass-panel" style={{
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, rgba(108,75,245,0.08), rgba(14,165,233,0.06))',
                    border: '1px solid rgba(108,75,245,0.15)',
                    cursor: 'pointer',
                }} onClick={() => onNavigate('current')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="live-dot" />
                            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{t('home.activeCall')}</span>
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                </div>
            ) : null}

            {/* SOP Guide Panel */}
            <SOPGuidePanel hasActiveCall={hasActiveCall} />

            {/* ASR + Summary Policy Badges */}
            <PolicyBadges />

            {/* Today's Stats Grid */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatCard
                    icon={<Phone size={14} />}
                    value={loading ? '...' : String(stats.callsToday || callCount)}
                    label={t('home.callsToday')}
                    color="var(--primary)"
                />
                <StatCard
                    icon={<TrendingUp size={14} />}
                    value={loading ? '...' : stats.avgCSAT > 0 ? stats.avgCSAT.toFixed(1) : '—'}
                    label={t('home.avgCsat')}
                    color="var(--success)"
                />
                <StatCard
                    icon={<Clock size={14} />}
                    value={loading ? '...' : formatDuration(stats.avgDuration)}
                    label={t('home.avgDuration')}
                    color="#f59e0b"
                />
                {isModuleEnabled('inbox') && <StatCard
                    icon={<MessageSquare size={14} />}
                    value={loading ? '...' : String(stats.chatsResolved)}
                    label={t('home.chatsResolved')}
                    color="#8b5cf6"
                />}
            </div>

            {/* Agent Status Duration Card */}
            {!loading && <AgentStatusCard stats={stats} />}

            {/* Yesterday + Team side by side on wide screens */}
            <div className="recap-team-row" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Yesterday's Recap (only if there's data) */}
                {yesterday && yesterday.callCount > 0 && !loading && (
                    <div className="glass-panel" style={{ padding: '10px 16px', flex: 1 }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t('home.yesterdayRecap')}</div>
                        <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem' }}>
                            <div>
                                <span style={{ fontWeight: 600 }}>{yesterday.callCount}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}> {t('common.calls')} </span>
                                <TrendArrow current={stats.callsToday} previous={yesterday.callCount} />
                            </div>
                            <div>
                                <span style={{ fontWeight: 600 }}>{formatDuration(yesterday.avgDuration)}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}> {t('common.avg')} </span>
                                <TrendArrow current={stats.avgDuration} previous={yesterday.avgDuration} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Team Comparison */}
                {teamAvg && (teamAvg.avgCalls > 0 || teamAvg.avgDuration > 0) && !loading && (
                    <div className="glass-panel" style={{ padding: '10px 16px', flex: 1 }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t('home.vsTeamAvg')}</div>
                        <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem' }}>
                            <div>
                                <span style={{ fontWeight: 600, color: stats.callsToday >= teamAvg.avgCalls ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {stats.callsToday}/{teamAvg.avgCalls}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}> {t('common.calls')}</span>
                            </div>
                            <div>
                                <span style={{ fontWeight: 600, color: stats.avgDuration <= teamAvg.avgDuration ? 'var(--success)' : '#f59e0b' }}>
                                    {formatDuration(stats.avgDuration)}/{formatDuration(teamAvg.avgDuration)}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}> {t('common.avgDur')}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Achievements compact */}
            <AchievementsPanel stats={achievementStats} compact />

            {/* Live Feed (Supervisors/Admins only) */}
            {agentInfo && (agentInfo.role === 'supervisor' || agentInfo.role === 'admin') && (
                <LiveFeed />
            )}

            {/* Quick Actions */}
            <div className="glass-panel" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>{t('home.quickActions')}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {isModuleEnabled('inbox') && <button onClick={() => onNavigate('chat:inbox')} className="btn btn-sm btn-secondary" style={{ flex: 1, fontSize: '0.72rem' }}>
                        {t('home.inbox')}
                    </button>}
                    <button onClick={() => onNavigate('me:history')} className="btn btn-sm btn-secondary" style={{ flex: 1, fontSize: '0.72rem' }}>
                        {t('home.history')}
                    </button>
                    {isModuleEnabled('wfm') && <button onClick={() => onNavigate('me:schedule')} className="btn btn-sm btn-secondary" style={{ flex: 1, fontSize: '0.72rem' }}>
                        {t('home.schedule')}
                    </button>}
                </div>
            </div>



            {/* Friendly footer */}
            {!hasActiveCall && (
                <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    {t('common.qualityAssist')}
                </div>
            )}

            <style>{`
        .live-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--success);
          animation: live-pulse 1.5s infinite;
        }
        @keyframes live-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
        /* 宽屏适配: Side Panel viewport 宽度 ≥ 520px */
        @media (min-width: 520px) {
          .stats-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .demo-console-buttons { flex-direction: row !important; }
          .demo-console-buttons button { flex: 1; }
          .status-duration-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .recap-team-row { flex-direction: row !important; }
          .insights-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
        </div>
    )
}

function StatCard({ icon, value, label, color }: {
    icon: React.ReactNode; value: string; label: string; color: string
}) {
    return (
        <div className="glass-panel" style={{ padding: '12px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                <div style={{ color }}>{icon}</div>
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        </div>
    )
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
    if (current > previous) return <span style={{ color: 'var(--success)', fontSize: '0.65rem' }}>↑</span>
    if (current < previous) return <span style={{ color: '#ef4444', fontSize: '0.65rem' }}>↓</span>
    return <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>→</span>
}
