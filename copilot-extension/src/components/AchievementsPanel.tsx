import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, Flame, Star, Zap, Heart, Shield, Target, Award } from "lucide-react"

// ──── Achievement Definitions ────

interface Achievement {
    id: string
    icon: string
    title: string
    description: string
    tier: 'bronze' | 'silver' | 'gold'
    category: 'calls' | 'quality' | 'streaks' | 'special'
    check: (stats: AgentStats) => boolean
}

interface AgentStats {
    totalCalls: number
    todayCalls: number
    avgCSAT: number
    perfectCompliance: number   // count of 100% compliance calls
    consecutiveCalls: number    // calls today without break
    longestCall: number         // seconds
    quickResolves: number       // calls < 3min
    daysActive: number
}

const ACHIEVEMENTS: Achievement[] = [
    // Calls
    { id: 'first-call', icon: '📞', title: 'First Ring', description: 'Complete your first call', tier: 'bronze', category: 'calls', check: s => s.totalCalls >= 1 },
    { id: 'call-10', icon: '🔟', title: 'Double Digits', description: '10 calls handled', tier: 'bronze', category: 'calls', check: s => s.totalCalls >= 10 },
    { id: 'call-50', icon: '🌟', title: 'Half Century', description: '50 calls handled', tier: 'silver', category: 'calls', check: s => s.totalCalls >= 50 },
    { id: 'call-100', icon: '💯', title: 'Centurion', description: '100 calls handled', tier: 'gold', category: 'calls', check: s => s.totalCalls >= 100 },
    { id: 'busy-day', icon: '🔥', title: 'On Fire', description: '10+ calls in one day', tier: 'silver', category: 'calls', check: s => s.todayCalls >= 10 },

    // Quality
    { id: 'csat-4', icon: '😊', title: 'People Person', description: 'Avg CSAT ≥ 4.0', tier: 'bronze', category: 'quality', check: s => s.avgCSAT >= 4.0 },
    { id: 'csat-45', icon: '🌈', title: 'Joy Maker', description: 'Avg CSAT ≥ 4.5', tier: 'silver', category: 'quality', check: s => s.avgCSAT >= 4.5 },
    { id: 'csat-48', icon: '👑', title: 'Customer Champion', description: 'Avg CSAT ≥ 4.8', tier: 'gold', category: 'quality', check: s => s.avgCSAT >= 4.8 },
    { id: 'compliance-5', icon: '🎯', title: 'By the Book', description: '5 perfect compliance calls', tier: 'bronze', category: 'quality', check: s => s.perfectCompliance >= 5 },
    { id: 'compliance-20', icon: '🛡️', title: 'Shield Bearer', description: '20 perfect compliance calls', tier: 'silver', category: 'quality', check: s => s.perfectCompliance >= 20 },

    // Streaks
    { id: 'quick-3', icon: '⚡', title: 'Lightning', description: '3 calls resolved under 3min', tier: 'bronze', category: 'streaks', check: s => s.quickResolves >= 3 },
    { id: 'quick-10', icon: '🚀', title: 'Rocket', description: '10 calls resolved under 3min', tier: 'silver', category: 'streaks', check: s => s.quickResolves >= 10 },
    { id: 'marathon', icon: '🏃', title: 'Marathon', description: 'Handle a 30min+ call', tier: 'silver', category: 'streaks', check: s => s.longestCall >= 1800 },

    // Special
    { id: 'week-1', icon: '📅', title: 'First Week', description: 'Active for 7 days', tier: 'bronze', category: 'special', check: s => s.daysActive >= 7 },
    { id: 'month-1', icon: '🎊', title: 'One Month', description: 'Active for 30 days', tier: 'silver', category: 'special', check: s => s.daysActive >= 30 },
]

const TIER_COLORS = {
    bronze: { bg: 'linear-gradient(135deg, #cd7f32, #b8860b)', border: '#cd7f32' },
    silver: { bg: 'linear-gradient(135deg, #c0c0c0, #a8a8a8)', border: '#c0c0c0' },
    gold: { bg: 'linear-gradient(135deg, #ffd700, #ffaa00)', border: '#ffd700' },
}

// ──── Component ────

interface AchievementsPanelProps {
    stats: AgentStats
    compact?: boolean  // for Home tab summary
}

export function AchievementsPanel({ stats, compact }: AchievementsPanelProps) {
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [justUnlocked, setJustUnlocked] = useState<string | null>(null)

    const unlocked = useMemo(() =>
        ACHIEVEMENTS.filter(a => a.check(stats)).map(a => a.id),
        [stats]
    )

    const progress = unlocked.length
    const total = ACHIEVEMENTS.length

    // Celebration effect for newly unlocked
    useEffect(() => {
        const stored = localStorage.getItem('copilot_achievements')
        const prev: string[] = stored ? JSON.parse(stored) : []
        const newOnes = unlocked.filter(id => !prev.includes(id))
        if (newOnes.length > 0) {
            setJustUnlocked(newOnes[0])
            localStorage.setItem('copilot_achievements', JSON.stringify(unlocked))
            setTimeout(() => setJustUnlocked(null), 4000)
        }
    }, [unlocked])

    const filtered = selectedCategory === 'all'
        ? ACHIEVEMENTS
        : ACHIEVEMENTS.filter(a => a.category === selectedCategory)

    if (compact) {
        return (
            <div className="glass-panel" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Achievements</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)' }}>{progress}/{total}</div>
                </div>
                {/* Progress bar */}
                <div style={{ height: 4, background: 'var(--glass-highlight)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                        width: `${(progress / total) * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--primary), #a855f7)',
                        borderRadius: 2,
                        transition: 'width 0.5s ease',
                    }} />
                </div>
                {/* Recent unlocks */}
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {ACHIEVEMENTS.filter(a => unlocked.includes(a.id)).slice(-5).map(a => (
                        <span key={a.id} title={a.title} style={{
                            fontSize: '1rem', cursor: 'default',
                            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))',
                        }}>{a.icon}</span>
                    ))}
                    {progress === 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Start earning badges!</span>}
                </div>
            </div>
        )
    }

    return (
        <div style={{ padding: 12 }}>
            {/* Unlock celebration */}
            <AnimatePresence>
                {justUnlocked && (() => {
                    const ach = ACHIEVEMENTS.find(a => a.id === justUnlocked)!
                    return (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: -20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: -20 }}
                            className="glass-panel"
                            style={{
                                padding: '16px', marginBottom: 12, textAlign: 'center',
                                border: `1px solid ${TIER_COLORS[ach.tier].border}40`,
                                background: `${TIER_COLORS[ach.tier].border}08`,
                            }}
                        >
                            <div style={{ fontSize: '2rem', marginBottom: 4 }}>{ach.icon}</div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>🎉 Achievement Unlocked!</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: 2 }}>{ach.title}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{ach.description}</div>
                        </motion.div>
                    )
                })()}
            </AnimatePresence>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🏆 Achievements</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600 }}>{progress}/{total}</span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--glass-highlight)', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress / total) * 100}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--primary), #a855f7, #ec4899)',
                        borderRadius: 3,
                    }}
                />
            </div>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {[
                    { id: 'all', label: 'All' },
                    { id: 'calls', label: '📞' },
                    { id: 'quality', label: '⭐' },
                    { id: 'streaks', label: '⚡' },
                    { id: 'special', label: '🎁' },
                ].map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        style={{
                            padding: '4px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600,
                            border: '1px solid var(--glass-border)', cursor: 'pointer', fontFamily: 'inherit',
                            background: selectedCategory === cat.id ? 'var(--primary)' : 'var(--glass-bg)',
                            color: selectedCategory === cat.id ? 'white' : 'var(--text-primary)',
                            transition: 'all 0.2s',
                        }}
                    >{cat.label}</button>
                ))}
            </div>

            {/* Achievement grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {filtered.map(ach => {
                    const isUnlocked = unlocked.includes(ach.id)
                    return (
                        <div
                            key={ach.id}
                            className="glass-panel"
                            style={{
                                padding: '10px 12px',
                                opacity: isUnlocked ? 1 : 0.45,
                                filter: isUnlocked ? 'none' : 'grayscale(0.8)',
                                transition: 'all 0.3s',
                                borderColor: isUnlocked ? `${TIER_COLORS[ach.tier].border}30` : undefined,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: '1.1rem' }}>{ach.icon}</span>
                                <span style={{
                                    fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase',
                                    padding: '1px 4px', borderRadius: 3, letterSpacing: 0.5,
                                    background: isUnlocked ? TIER_COLORS[ach.tier].bg : 'var(--glass-highlight)',
                                    color: isUnlocked ? 'white' : 'var(--text-muted)',
                                }}>{ach.tier}</span>
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '0.72rem', color: 'var(--text-primary)' }}>{ach.title}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 1 }}>{ach.description}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ──── Daily Stats Streak Indicator ────

export function StreakIndicator({ consecutiveDays }: { consecutiveDays: number }) {
    if (consecutiveDays <= 0) return null
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 10,
            background: 'linear-gradient(90deg, rgba(249,115,22,0.1), rgba(239,68,68,0.08))',
            fontSize: '0.7rem', fontWeight: 600, color: '#ea580c',
        }}>
            <Flame size={12} />
            {consecutiveDays} day streak
        </div>
    )
}
