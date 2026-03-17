import { useEffect, useState } from "react"
import { Phone, PhoneIncoming, PhoneOutgoing, CheckCircle2, XCircle, Clock } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useApi } from "~/hooks/useApi"
import { useAuth } from "~/hooks/useAuth"
import { useTranslation } from "react-i18next"

interface CallStageProps {
    call: any // Typed as any for now, should match CurrentCall interface
}

export function CallStage({ call }: CallStageProps) {
    const { fetchApi } = useApi()
    const { agentInfo } = useAuth()
    const { t } = useTranslation()
    const [duration, setDuration] = useState(0)

    // Outcome State
    const [showOutcome, setShowOutcome] = useState(false)
    const [submittingOutcome, setSubmittingOutcome] = useState<string | null>(null)
    const [outcomeSubmitted, setOutcomeSubmitted] = useState(false)

    // Determine direction
    const myExtension = agentInfo?.sipNumber || agentInfo?.userId
    const isIncoming = myExtension && (call.callee || call.callee_uri || "").includes(myExtension)

    // Icon Selection
    const CallIcon = isIncoming ? PhoneIncoming : PhoneOutgoing
    // Color: Green for Incoming, Blue for Outgoing? Or just Blue for both?
    // Usually Incoming = Green, Outgoing = Blue/Green.
    // Let's stick to Blue generally, but maybe differentiate if requested.
    // User just asked for "Icon".

    useEffect(() => {
        const start = call.startTime || call.start_time || new Date().toISOString()
        const startTime = new Date(start).getTime()

        if (isNaN(startTime)) {
            setDuration(0)
            return
        }

        const timer = setInterval(() => {
            const now = Date.now()
            const diff = Math.floor((now - startTime) / 1000)
            setDuration(diff > 0 ? diff : 0)
        }, 1000)

        // Initial set
        setDuration(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))

        return () => clearInterval(timer)
    }, [call])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const handleOutcome = async (outcome: 'success' | 'failure' | 'follow_up') => {
        try {
            setSubmittingOutcome(outcome)
            await fetchApi(`/api/platform/calls/${call.callId}/outcome`, {
                method: 'POST',
                body: JSON.stringify({ outcome })
            })
            setOutcomeSubmitted(true)
            setTimeout(() => setShowOutcome(false), 2000) // Auto hide
        } catch (e) {
            console.error("Failed to submit outcome", e)
            setSubmittingOutcome(null)
        }
    }

    return (
        <div className="glass-card" style={{
            padding: "12px 16px",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            marginBottom: 12,
            background: 'white',
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
            border: '1px solid rgba(0,0,0,0.05)',
            borderRadius: 12
        }}>
            {/* Left Side: Icon + Number */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: isIncoming ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                    color: isIncoming ? '#10b981' : '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <CallIcon size={16} />
                </div>

                <h2 style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#1a1a1a',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                }}>
                    {/* Extract number if URI */}
                    {(call.callee || call.callee_uri || t('common.unknown')).replace(/sip:|@.*/g, '')}
                    {/* 🎧 内部坐席标识 — 与 AU SipCalls 一致 */}
                    {(() => {
                        const callerNum = (call.caller || '').replace(/sip:|@.*/g, '')
                        const isCallerMe = !!(myExtension && callerNum === myExtension)
                        const targetType = isCallerMe ? call.callee_type : call.caller_type
                        return targetType === 'agent' ? (
                            <span title="Agent" style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 3, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontWeight: 500, whiteSpace: 'nowrap' }}>🎧 Agent</span>
                        ) : null
                    })()}
                </h2>
            </div>

            {/* Right Side: Timer + Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    fontSize: 18,
                    fontWeight: 500,
                    color: '#1a1a1a',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1
                }}>
                    {formatTime(duration)}
                </div>
                <div style={{
                    color: call.status === 'ringing' ? '#f59e0b' : '#10b981',
                    fontSize: 12,
                    fontWeight: 500,
                    background: call.status === 'ringing' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    padding: '2px 8px',
                    borderRadius: 12
                }}>
                    {call.status === 'ringing' ? t('call.ringing') : t('call.active')}
                </div>
            </div>

            {/* Wrap-up Overlay */}
            <AnimatePresence>
                {showOutcome && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="glass-card"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(255,255,255,0.98)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10,
                            padding: '0 16px',
                            gap: 16
                        }}
                    >
                        {!outcomeSubmitted ? (
                            <>
                                <span className="text-sm font-semibold truncate">{t('call.conversationEnded')}</span>
                                <div className="flex gap-xs">
                                    <button
                                        className="btn-icon-sm"
                                        style={{ background: submittingOutcome === 'success' ? 'var(--success-bg)' : 'var(--surface-bg)' }}
                                        onClick={() => handleOutcome('success')}
                                        disabled={!!submittingOutcome}
                                        title={t('call.success')}
                                    >
                                        <CheckCircle2 size={18} className="text-success" />
                                    </button>
                                    <button
                                        className="btn-icon-sm"
                                        style={{ background: submittingOutcome === 'failure' ? 'var(--danger-bg)' : 'var(--surface-bg)' }}
                                        onClick={() => handleOutcome('failure')}
                                        disabled={!!submittingOutcome}
                                        title={t('call.failure')}
                                    >
                                        <XCircle size={18} className="text-danger" />
                                    </button>
                                    <button
                                        className="btn-icon-sm"
                                        style={{ background: submittingOutcome === 'follow_up' ? 'var(--warning-bg)' : 'var(--surface-bg)' }}
                                        onClick={() => handleOutcome('follow_up')}
                                        disabled={!!submittingOutcome}
                                        title={t('call.followUp')}
                                    >
                                        <Clock size={18} className="text-warning" />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 text-success animate-scale-in">
                                <CheckCircle2 size={18} />
                                <span className="font-medium text-sm">{t('common.saved')}</span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
