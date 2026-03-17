import { Clock, Play, Pause, Coffee, AlertCircle, ShieldCheck, Flame, FastForward, Activity, Phone } from "lucide-react"
import { useTranslation } from "react-i18next"

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

interface AgentStatusCardProps {
    stats: DailyStats
}

export function AgentStatusCard({ stats }: AgentStatusCardProps) {
    const { t } = useTranslation()
    const formatDuration = (s: number) => {
        if (!s || s <= 0) return '0m'
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        if (h > 0) return `${h}h ${m}m`
        return `${m}m`
    }

    const {
        statusDurations = {},
        firstLoginTime,
        avgWrapupTime = 0,
        manualBreakCount = 0,
        longestWorkSession = 0,
        maxConcurrentChats = 0
    } = stats

    // 提取各状态时长
    const availableSec = statusDurations['available'] || 0
    const oncallSec = statusDurations['oncall'] || 0
    const wrapupSec = statusDurations['wrapup'] || 0
    const awaySec = (statusDurations['away'] || 0) + (statusDurations['break'] || 0)
        + (statusDurations['meeting'] || 0) + (statusDurations['dnd'] || 0)

    // Derived insights
    const totalWorkingSec = availableSec + oncallSec + wrapupSec
    const totalSessionSec = totalWorkingSec + awaySec

    // 算进度条百分比
    const totalPcnt = Math.max(totalSessionSec, 1) // prevent division by zero
    const availablePcnt = (availableSec / totalPcnt) * 100
    const oncallPcnt = (oncallSec / totalPcnt) * 100
    const wrapupPcnt = (wrapupSec / totalPcnt) * 100
    const awayPcnt = (awaySec / totalPcnt) * 100

    const formatTime = (isoString?: string | null) => {
        if (!isoString) return '--:--'
        const d = new Date(isoString)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    // Determine health message
    let healthMessage = t('agentStatus.healthGood')
    let healthIcon = <ShieldCheck size={14} color="var(--success)" />
    if (longestWorkSession > 4 * 3600) {
        healthMessage = t('agentStatus.healthLong')
        healthIcon = <AlertCircle size={14} color="#f59e0b" />
    } else if (oncallSec > 0.6 * totalSessionSec && totalSessionSec > 3600) {
        healthMessage = t('agentStatus.healthHigh')
        healthIcon = <Flame size={14} color="#ef4444" />
    } else if (manualBreakCount === 0 && totalSessionSec > 4 * 3600) {
        healthMessage = t('agentStatus.healthNoBreak')
        healthIcon = <Coffee size={14} color="#f59e0b" />
    }

    return (
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '4px' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Activity size={16} color="var(--primary)" />
                    {t('agentStatus.timeEfficiency')}
                </div>
                {firstLoginTime && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {t('agentStatus.firstLogin', { time: formatTime(firstLoginTime) })}
                    </div>
                )}
            </div>

            {/* Time Distribution Bar */}
            {totalSessionSec > 0 ? (
                <div>
                    <div style={{
                        height: 8,
                        width: '100%',
                        borderRadius: 4,
                        display: 'flex',
                        overflow: 'hidden',
                        background: 'rgba(255,255,255,0.05)',
                        marginBottom: 12
                    }}>
                        {oncallPcnt > 0 && <div style={{ width: `${oncallPcnt}%`, background: '#ef4444' }} title={`On Call: ${formatDuration(oncallSec)}`} />}
                        {wrapupPcnt > 0 && <div style={{ width: `${wrapupPcnt}%`, background: '#8b5cf6' }} title={`Wrap Up: ${formatDuration(wrapupSec)}`} />}
                        {availablePcnt > 0 && <div style={{ width: `${availablePcnt}%`, background: '#22c55e' }} title={`Available: ${formatDuration(availableSec)}`} />}
                        {awayPcnt > 0 && <div style={{ width: `${awayPcnt}%`, background: '#f59e0b' }} title={`Away: ${formatDuration(awaySec)}`} />}
                    </div>

                    <div className="status-duration-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <StatusItem icon={<Play size={12} color="#22c55e" />} label={t('agentStatus.available')} duration={formatDuration(availableSec)} bg="rgba(34,197,94,0.1)" color="#22c55e" />
                        <StatusItem icon={<Phone size={12} color="#ef4444" />} label={t('agentStatus.onCall')} duration={formatDuration(oncallSec)} bg="rgba(239,68,68,0.1)" color="#ef4444" />
                        <StatusItem icon={<Pause size={12} color="#8b5cf6" />} label={t('agentStatus.wrapUp')} duration={formatDuration(wrapupSec)} bg="rgba(139,92,246,0.1)" color="#8b5cf6" />
                        <StatusItem icon={<Coffee size={12} color="#f59e0b" />} label={t('agentStatus.away')} duration={formatDuration(awaySec)} bg="rgba(245,158,11,0.1)" color="#f59e0b" />
                    </div>
                </div>
            ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                    {t('agentStatus.noStatusData')}
                </div>
            )}

            {/* Efficiency Insights */}
            {(avgWrapupTime > 0 || maxConcurrentChats > 0 || longestWorkSession > 0 || manualBreakCount > 0) && (
                <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 8,
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {t('agentStatus.dailyInsights')}
                    </div>

                    <div className="insights-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {avgWrapupTime > 0 && (
                            <InsightItem label={t('agentStatus.avgWrapup')} value={formatDuration(avgWrapupTime)} />
                        )}
                        {longestWorkSession > 0 && (
                            <InsightItem label={t('agentStatus.longestSession')} value={formatDuration(longestWorkSession)} />
                        )}
                        {maxConcurrentChats > 0 && (
                            <InsightItem label={t('agentStatus.maxConcurrent')} value={maxConcurrentChats.toString()} />
                        )}
                        {manualBreakCount > 0 && (
                            <InsightItem label={t('agentStatus.manualAway')} value={manualBreakCount.toString()} />
                        )}
                    </div>
                </div>
            )}

            {/* Health Hint */}
            {totalSessionSec > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    <div style={{ marginTop: 2 }}>{healthIcon}</div>
                    <div>{healthMessage}</div>
                </div>
            )}
        </div>
    )
}

function StatusItem({ icon, label, duration, bg, color }: { icon: React.ReactNode; label: string; duration: string; bg: string; color: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: bg, borderRadius: 6, border: `1px solid ${color}20`, gap: 4, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: color, fontWeight: 500, minWidth: 0 }}>
                {icon}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{duration}</span>
        </div>
    )
}

function InsightItem({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
        </div>
    )
}
