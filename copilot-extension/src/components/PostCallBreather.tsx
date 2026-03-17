import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslation } from "react-i18next"
import i18n from "~/i18n/config"

interface BreatherProps {
    duration: number          // call duration in seconds
    complianceScore?: number  // 0-100, or undefined
    consecutiveCalls: number  // how many calls in a row
    onDismiss: () => void
}

function getBreatherMessage(duration: number, compliance?: number, consecutive?: number) {
    const t = i18n.t.bind(i18n)
    const messages: { emoji: string; text: string; sub: string }[] = []

    if (duration > 900) {
        messages.push({ emoji: "💪", text: t('breather.longCall'), sub: t('breather.longCallSub', { min: Math.round(duration / 60) }) })
    } else if (duration > 300) {
        messages.push({ emoji: "✅", text: t('breather.niceWork'), sub: t('breather.niceWorkSub', { min: Math.round(duration / 60) }) })
    } else {
        messages.push({ emoji: "⚡", text: t('breather.quickClean'), sub: t('breather.quickCleanSub') })
    }

    if (compliance !== undefined && compliance === 100) {
        messages.push({ emoji: "🎯", text: t('breather.perfectCompliance'), sub: t('breather.perfectComplianceSub') })
    }

    if ((consecutive ?? 0) >= 5) {
        messages.push({ emoji: "☕", text: t('breather.streakWarning', { count: consecutive }), sub: t('breather.streakWarningSub') })
    }

    if ((consecutive ?? 0) >= 5) return messages[messages.length - 1]
    if (compliance === 100) return messages.find(m => m.emoji === "🎯")!
    return messages[0]
}

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// 紧凑 Toast 样式，不假设任何父容器布局，5s 自动消失
export function PostCallBreather({ duration, complianceScore, consecutiveCalls, onDismiss }: BreatherProps) {
    const [visible, setVisible] = useState(true)
    const [progress, setProgress] = useState(0)

    const msg = getBreatherMessage(duration, complianceScore, consecutiveCalls)

    useEffect(() => {
        const start = Date.now()
        const timer = setInterval(() => {
            const elapsed = Date.now() - start
            setProgress(Math.min(elapsed / 3000, 1))
            if (elapsed >= 3000) {
                clearInterval(timer)
                setVisible(false)
                setTimeout(onDismiss, 350)
            }
        }, 50)
        return () => clearInterval(timer)
    }, [onDismiss])

    const handleClick = () => {
        setVisible(false)
        setTimeout(onDismiss, 300)
    }

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    onClick={handleClick}
                    style={{ cursor: 'pointer', padding: '0 12px' }}
                >
                    <div style={{
                        borderRadius: 12,
                        border: '1px solid rgba(108, 75, 245, 0.18)',
                        boxShadow: '0 6px 20px rgba(108, 75, 245, 0.12), 0 2px 8px rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                        background: 'var(--bg-card)',
                    }}>
                        {/* 倒计时进度条 */}
                        <div style={{ height: 3, background: 'var(--glass-highlight)' }}>
                            <div style={{
                                height: '100%',
                                width: `${progress * 100}%`,
                                background: 'linear-gradient(90deg, var(--primary), #a855f7)',
                                borderRadius: '0 2px 2px 0',
                                transition: 'width 0.05s linear',
                            }} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 11px' }}>
                            <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{msg.emoji}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>{msg.text}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>{msg.sub}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                                <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--primary)' }}>
                                    {formatDuration(duration)}
                                </span>
                                {complianceScore !== undefined && (
                                    <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--primary)' }}>
                                        {complianceScore}%
                                    </span>
                                )}
                                <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--primary)' }}>
                                    #{consecutiveCalls}
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
