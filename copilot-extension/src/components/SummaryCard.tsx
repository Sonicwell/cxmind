import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { Target, FileText, ArrowRight, Tag, SmilePlus, X, Loader2, Sparkles, CheckCircle2, XCircle, Clock, PhoneIncoming, PhoneOutgoing, AlertTriangle } from "lucide-react"
import type { CallSummary } from "~/hooks/useWebSocket"
import { useApi } from "~/hooks/useApi"
import { useAuth } from "~/hooks/useAuth"

interface SummaryCardProps {
    callId: string | null
    callInfo: { caller: string; callee: string; startTime: string; endTime?: string } | null
    summary: CallSummary | null
    loading: boolean
    onDismiss: () => void
    outcome?: { outcome: string; confidence: number; reasoning: string } | null
    onSave?: (editedSummary: string) => void
    autoSaveDelay?: number // seconds, default 30
    onWrapupComplete?: () => void
    onOutcomeSelect?: (outcome: string) => void
    timedOut?: boolean
    summaryNotEnabled?: boolean
    summarySkipped?: boolean
}

const SENTIMENT_EMOJI: Record<string, string> = {
    positive: "😊",
    negative: "😟",
    neutral: "😐",
    frustrated: "😤",
    satisfied: "😌",
    angry: "😠",
    happy: "😄",
}

export function SummaryCard({ callId, callInfo, summary, loading, onDismiss, outcome, onSave, autoSaveDelay = 30, onWrapupComplete, onOutcomeSelect, timedOut, summaryNotEnabled, summarySkipped }: SummaryCardProps) {
    const { fetchApi } = useApi()
    const { agentInfo } = useAuth()
    const [submittingOutcome, setSubmittingOutcome] = useState<string | null>(null)
    const [outcomeSubmitted, setOutcomeSubmitted] = useState(false)
    const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)

    // 宽屏检测: detail rows 两列布局
    const detailRef = useRef<HTMLDivElement>(null)
    const [isDetailWide, setIsDetailWide] = useState(false)
    useEffect(() => {
        const el = detailRef.current
        if (!el) return
        const ro = new ResizeObserver(entries => {
            for (const e of entries) setIsDetailWide(e.contentRect.width > 400)
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [summary])

    // ── 可编辑 summary: 默认只读, 点击展开, blur 自动保存 ──
    const storageKey = callId ? `summary_draft_${callId}` : null
    const rawText = summary?.rawSummary || ''
    const [editText, setEditText] = useState(() => {
        if (storageKey) {
            try { return sessionStorage.getItem(storageKey) || rawText } catch { /* noop */ }
        }
        return rawText
    })
    const [userEdited, setUserEdited] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [isEditMode, setIsEditMode] = useState(false)
    const editTextRef = useRef(editText)
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => { editTextRef.current = editText }, [editText])

    // rawText 更新时同步（防止 summary 延迟到达时覆盖空值）
    useEffect(() => {
        if (rawText && !userEdited) setEditText(rawText)
    }, [rawText])

    // sessionStorage 缓存
    useEffect(() => {
        if (storageKey && editText && editText !== rawText) {
            try { sessionStorage.setItem(storageKey, editText) } catch { /* noop */ }
        }
    }, [editText, storageKey, rawText])

    // summary 到达后静默自动保存（不显示倒计时）
    useEffect(() => {
        if (!summary || !rawText || userEdited) return
        const t = setTimeout(() => {
            setSaveStatus('saving')
            onSave?.(editTextRef.current)
            setTimeout(() => setSaveStatus('saved'), 300)
            setTimeout(() => setSaveStatus('idle'), 2500)
            if (storageKey) try { sessionStorage.removeItem(storageKey) } catch { /* noop */ }
        }, autoSaveDelay * 1000)
        return () => clearTimeout(t)
    }, [summary, rawText, userEdited, autoSaveDelay])

    const handleEdit = useCallback((val: string) => {
        setEditText(val)
        setUserEdited(true)
    }, [])

    const handleBlurSave = useCallback(() => {
        setIsEditMode(false)
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
        saveDebounceRef.current = setTimeout(() => {
            if (editTextRef.current !== rawText || userEdited) {
                setSaveStatus('saving')
                onSave?.(editTextRef.current)
                setUserEdited(false)
                setTimeout(() => setSaveStatus('saved'), 300)
                setTimeout(() => setSaveStatus('idle'), 2500)
                if (storageKey) try { sessionStorage.removeItem(storageKey) } catch { /* noop */ }
            }
        }, 500)
    }, [onSave, rawText, userEdited, storageKey])

    // 算通话方向和对方号码
    const myExt = (agentInfo?.sipNumber || agentInfo?.userId || '').replace(/sip:|@.*/g, '')
    const callerNum = (callInfo?.caller || '').replace(/sip:|@.*/g, '')
    const calleeNum = (callInfo?.callee || '').replace(/sip:|@.*/g, '')
    const isIncoming = myExt && calleeNum.includes(myExt)
    const remoteNumber = isIncoming ? callerNum : calleeNum

    // 算时长 (endTime固定, 不是实时)
    const callDuration = (() => {
        if (!callInfo?.startTime) return ''
        const startMs = new Date(callInfo.startTime).getTime()
        if (isNaN(startMs)) return ''
        const endMs = callInfo.endTime ? new Date(callInfo.endTime).getTime() : Date.now()
        const secs = Math.max(0, Math.floor((endMs - startMs) / 1000))
        const mins = Math.floor(secs / 60)
        const s = secs % 60
        return `${mins}:${s.toString().padStart(2, '0')}`
    })()

    // Manual Outcome Handler
    const handleOutcome = async (outcome: 'success' | 'failure' | 'follow_up') => {
        if (!callId) return
        try {
            setSubmittingOutcome(outcome)
            await fetchApi(`/api/agent/calls/${callId}/outcome`, {
                method: 'POST',
                body: JSON.stringify({ outcome })
            })
            setOutcomeSubmitted(true)
            setSelectedOutcome(outcome)
            onOutcomeSelect?.(outcome)

            // Allow re-selection? Yes.
            setSubmittingOutcome(null)
        } catch (e) {
            console.error("Failed to submit outcome", e)
            setSubmittingOutcome(null)
        }
    }

    // Determine what to show for summary content
    const renderSummaryContent = () => {
        if (loading && !summary) {
            return (
                <div style={{ padding: '0 4px' }}>
                    <div className="flex items-center gap-sm" style={{ marginBottom: 16 }}>
                        <div className="flex items-center gap-xs" style={{ flex: 1 }}>
                            <Sparkles size={16} color="var(--primary)" />
                            <span className="font-semibold text-xs text-primary">Generating AI Summary...</span>
                        </div>
                        <Loader2 size={14} className="spin" color="var(--primary)" />
                    </div>
                    {/* Skeleton */}
                    {[1, 2, 3].map((i) => (
                        <div key={i} style={{ marginBottom: 8 }}>
                            <div style={{
                                height: 8, width: 60, borderRadius: 4,
                                background: 'var(--glass-border)', marginBottom: 4
                            }} />
                            <div style={{
                                height: 12, width: `${60 + i * 10}%`, borderRadius: 4,
                                background: 'var(--glass-border)',
                                animation: 'pulse 1.5s ease-in-out infinite',
                                animationDelay: `${i * 0.2}s`
                            }} />
                        </div>
                    ))}
                </div>
            )
        }

        // 无转写内容 → 跳过 AI, 直接手写
        if (summarySkipped && !summary?.intent) {
            return (
                <div style={{ padding: '0 4px' }}>
                    <div className="flex items-center gap-xs" style={{ marginBottom: 10 }}>
                        <AlertTriangle size={16} color="#f59e0b" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>
                            Not enough transcript, skip AI Summary
                        </span>
                    </div>
                    <textarea
                        autoFocus
                        placeholder="Write your summary here..."
                        value={editText}
                        onChange={e => handleEdit(e.target.value)}
                        onBlur={handleBlurSave}
                        style={{
                            width: '100%', minHeight: 60, border: '1px solid var(--glass-border)',
                            borderRadius: 6, padding: 8, fontSize: '0.72rem', lineHeight: 1.5,
                            background: 'var(--bg-card)', color: 'var(--text-primary)',
                            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--primary, #6366f1)' }}
                    />
                </div>
            )
        }

        // 偏好关闭或系统禁用 → 跳过 AI, 直接手写
        if (summaryNotEnabled && !summary?.intent) {
            return (
                <div style={{ padding: '0 4px' }}>
                    <div className="flex items-center gap-xs" style={{ marginBottom: 10 }}>
                        <AlertTriangle size={16} color="#94a3b8" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                            AI Summary not enabled
                        </span>
                    </div>
                    <textarea
                        autoFocus
                        placeholder="Write your summary here..."
                        value={editText}
                        onChange={e => handleEdit(e.target.value)}
                        onBlur={handleBlurSave}
                        style={{
                            width: '100%', minHeight: 60, border: '1px solid var(--glass-border)',
                            borderRadius: 6, padding: 8, fontSize: '0.72rem', lineHeight: 1.5,
                            background: 'var(--bg-card)', color: 'var(--text-primary)',
                            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--primary, #6366f1)' }}
                    />
                </div>
            )
        }

        // LLM 超时降级: summary 为 null 且 timedOut → 展示手写 textarea
        if (timedOut && !summary?.intent) {
            return (
                <div style={{ padding: '0 4px' }}>
                    <div className="flex items-center gap-xs" style={{ marginBottom: 10 }}>
                        <AlertTriangle size={16} color="#f59e0b" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>
                            AI Summary unavailable
                        </span>
                    </div>
                    <textarea
                        autoFocus
                        placeholder="Write your summary here..."
                        value={editText}
                        onChange={e => handleEdit(e.target.value)}
                        onBlur={handleBlurSave}
                        style={{
                            width: '100%', minHeight: 60, border: '1px solid var(--glass-border)',
                            borderRadius: 6, padding: 8, fontSize: '0.72rem', lineHeight: 1.5,
                            background: 'var(--bg-card)', color: 'var(--text-primary)',
                            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--primary, #6366f1)' }}
                    />
                </div>
            )
        }

        if (!summary) return null

        const sentimentEmoji = SENTIMENT_EMOJI[summary.sentiment?.toLowerCase()] || "💬"
        // entities 可能以 JSON string 到达, 需要安全解析
        let entities: Record<string, any> = {}
        try {
            const rawEnt = summary.entities
            entities = typeof rawEnt === 'string' ? JSON.parse(rawEnt) : (rawEnt || {})
        } catch { entities = {} }
        const entityKeys = Object.keys(entities).filter(k =>
            !["intent", "outcome", "next_action", "sentiment"].includes(k)
        )

        return (
            <div style={{ padding: '0 4px' }} ref={detailRef}>
                <div style={{
                    display: isDetailWide ? 'grid' : 'flex',
                    gridTemplateColumns: isDetailWide ? '1fr 1fr' : undefined,
                    gap: isDetailWide ? '0 16px' : 0,
                    flexDirection: isDetailWide ? undefined : 'column',
                }}>
                    {/* Intent */}
                    {summary.intent && (
                        <SummaryRow icon={<Target size={14} />} label="Intent" value={summary.intent} />
                    )}

                    {/* AI Outcome */}
                    {summary.outcome && (
                        <SummaryRow icon={<FileText size={14} />} label="AI Conclusion" value={summary.outcome} />
                    )}

                    {/* Next Action */}
                    {summary.nextAction && (
                        <SummaryRow icon={<ArrowRight size={14} />} label="Next Step" value={summary.nextAction} />
                    )}

                    {/* Sentiment */}
                    {summary.sentiment && (
                        <SummaryRow
                            icon={<SmilePlus size={14} />}
                            label="Sentiment"
                            value={`${sentimentEmoji} ${summary.sentiment}`}
                        />
                    )}
                </div>

                {/* Entities */}
                {entityKeys.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        <div className="flex items-center gap-xs" style={{ marginBottom: 6 }}>
                            <Tag size={12} color="var(--text-muted)" />
                            <span className="text-xs" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Entities</span>
                        </div>
                        <div className="flex" style={{ flexWrap: 'wrap', gap: 4 }}>
                            {entityKeys.map((key) => (
                                <span
                                    key={key}
                                    style={{
                                        fontSize: 10,
                                        padding: '2px 8px',
                                        borderRadius: 12,
                                        background: 'var(--primary-bg, rgba(108,75,245,0.1))',
                                        color: 'var(--primary)',
                                        fontWeight: 500
                                    }}
                                >
                                    {key}: {typeof entities[key] === 'string' ? entities[key] : JSON.stringify(entities[key])}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* AI Outcome — inline */}
                {outcome && (() => {
                    const OCONF: Record<string, { label: string; color: string; emoji: string }> = {
                        success: { label: 'Success', color: '#22c55e', emoji: '📈' },
                        failure: { label: 'Failed', color: '#ef4444', emoji: '📉' },
                        follow_up: { label: 'Follow-up', color: '#f59e0b', emoji: '🔄' },
                    }
                    const oc = OCONF[outcome.outcome] || { label: outcome.outcome, color: '#94a3b8', emoji: '❓' }
                    const pct = Math.round(outcome.confidence * 100)
                    return (
                        <div style={{
                            marginTop: 10, padding: '6px 10px', borderRadius: 8,
                            background: `${oc.color}15`, border: `1px solid ${oc.color}30`,
                            display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem',
                        }}>
                            <span>{oc.emoji}</span>
                            <span style={{ fontWeight: 600, color: oc.color }}>AI Outcome: {oc.label}</span>
                            <span style={{
                                marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 500,
                                color: oc.color, background: `${oc.color}20`,
                                padding: '1px 6px', borderRadius: 8,
                            }}>{pct}%</span>
                            {outcome.reasoning && (
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={outcome.reasoning}>
                                    {outcome.reasoning}
                                </span>
                            )}
                        </div>
                    )
                })()}
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card"
            style={{ padding: 16, marginBottom: 12, position: 'relative' }}
        >
            {/* Header — Conversation Ended 整合 */}

            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#22c55e' }}>✅</span>
                    <span className="font-semibold text-sm">Conversation Ended</span>
                    {callDuration && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>• {callDuration}</span>}
                    {summary?.intent && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>• {summary.intent}</span>}
                </div>
                <button
                    className="btn"
                    onClick={onDismiss}
                    style={{
                        width: 24, height: 24, borderRadius: '50%', padding: 0,
                        background: 'var(--surface-bg)', border: '1px solid var(--glass-border)',
                        color: 'var(--text-muted)'
                    }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Manual Outcome Selection (Always Visible if callId exists) */}
            {callId && (
                <div style={{ marginBottom: 16 }}>
                    {/* Call Info Bar */}
                    {callInfo && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', borderRadius: 8,
                            background: 'var(--surface-bg)',
                            border: '1px solid var(--glass-border)',
                            marginBottom: 10
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: 6,
                                background: isIncoming ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                                color: isIncoming ? '#10b981' : '#3b82f6',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                                {isIncoming ? <PhoneIncoming size={14} /> : <PhoneOutgoing size={14} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #1a1a1a)' }}>
                                    {remoteNumber || callerNum || calleeNum || 'Unknown'}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted, #9ca3af)' }}>
                                    {isIncoming ? 'Inbound' : 'Outbound'}{callDuration ? ` · ${callDuration}` : ''}
                                </div>
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-muted font-medium mb-2 uppercase tracking-wide">Select Outcome</p>
                    <div className="flex gap-xs">
                        <OutcomeButton
                            outcome="success"
                            icon={<CheckCircle2 size={16} />}
                            label="Success"
                            active={selectedOutcome === 'success'}
                            disabled={!!submittingOutcome}
                            onClick={() => handleOutcome('success')}
                            color="success"
                        />
                        <OutcomeButton
                            outcome="failure"
                            icon={<XCircle size={16} />}
                            label="Failure"
                            active={selectedOutcome === 'failure'}
                            disabled={!!submittingOutcome}
                            onClick={() => handleOutcome('failure')}
                            color="danger"
                        />
                        <OutcomeButton
                            outcome="follow_up"
                            icon={<Clock size={16} />}
                            label="Follow Up"
                            active={selectedOutcome === 'follow_up'}
                            disabled={!!submittingOutcome}
                            onClick={() => handleOutcome('follow_up')}
                            color="warning"
                        />
                    </div>
                </div>
            )}

            {outcomeSubmitted && (
                <div className="flex items-center gap-2 mb-4 p-2 bg-success-soft rounded text-success text-sm font-medium animate-scale-in">
                    <CheckCircle2 size={16} />
                    <span>Outcome Saved</span>
                </div>
            )}

            {/* Separator if both exist */}
            {(loading || summary) && <div style={{ height: 1, background: 'var(--glass-border)', marginBottom: 16 }} />}

            {/* Summary Content */}
            {renderSummaryContent()}

            {/* Summary — 默认只读, 点击展开编辑, blur 自动保存 */}
            {summary?.rawSummary && (
                <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#22c55e' }}>📝 Summary</span>
                        {saveStatus === 'saving' ? (
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Saving...</span>
                        ) : saveStatus === 'saved' ? (
                            <span style={{ fontSize: '0.6rem', color: '#22c55e', fontWeight: 600 }}>✓ Saved</span>
                        ) : isEditMode ? (
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Click outside to save</span>
                        ) : null}
                    </div>
                    {isEditMode ? (
                        <textarea
                            autoFocus
                            value={editText}
                            onChange={e => handleEdit(e.target.value)}
                            onBlur={handleBlurSave}
                            style={{
                                width: '100%', minHeight: 60, border: '1px solid var(--primary, #6366f1)',
                                borderRadius: 6, padding: 8, fontSize: '0.72rem', lineHeight: 1.5,
                                background: 'var(--bg-card)', color: 'var(--text-primary)',
                                resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                                boxShadow: '0 0 0 2px rgba(99,102,241,0.15)',
                                transition: 'border-color 0.2s, box-shadow 0.2s',
                            }}
                        />
                    ) : (
                        <div
                            onClick={() => setIsEditMode(true)}
                            title="Click to edit"
                            style={{
                                padding: '8px 10px', borderRadius: 6,
                                background: 'var(--surface-bg)',
                                border: '1px solid var(--glass-border)',
                                fontSize: '0.72rem', lineHeight: 1.5,
                                color: 'var(--text-primary)', cursor: 'text',
                                transition: 'border-color 0.2s',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary, #6366f1)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)' }}
                        >
                            {editText || rawText}
                        </div>
                    )}
                </div>
            )}

            {/* Quick Follow-up + Complete — 从 WrapupCard 合并 */}
            {onWrapupComplete && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--glass-border)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        <button className="toolkit-action-chip">
                            <FileText size={10} /> Send Follow-up
                        </button>
                        <button className="toolkit-action-chip">
                            <Tag size={10} /> Create Ticket
                        </button>
                        <button className="toolkit-action-chip">
                            <Clock size={10} /> Schedule Callback
                        </button>
                    </div>
                    <button
                        onClick={onWrapupComplete}
                        className="toolkit-complete-btn"
                    >
                        <CheckCircle2 size={12} /> Complete Wrap-up
                    </button>
                </div>
            )}
        </motion.div>
    )
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ marginBottom: 8 }}>
            <div className="flex items-center gap-xs" style={{ marginBottom: 2 }}>
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
            </div>
            <p className="text-sm" style={{ margin: 0, lineHeight: 1.4, paddingLeft: 20 }}>{value}</p>
        </div>
    )
}

function OutcomeButton({ outcome, icon, label, active, disabled, onClick, color }: any) {
    const colorMap: Record<string, { bg: string, border: string, text: string }> = {
        success: { bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#16a34a' },
        danger: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#dc2626' },
        warning: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#d97706' },
    }
    const c = colorMap[color] || colorMap.success
    const emoji: Record<string, string> = { success: '✅', danger: '❌', warning: '⏰' }

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                flex: 1,
                padding: '10px 8px',
                height: 'auto',
                borderRadius: 10,
                border: active ? `1.5px solid ${c.border}` : '1px solid var(--glass-border)',
                background: active ? c.bg : 'var(--surface-bg)',
                cursor: disabled ? 'default' : 'pointer',
                textAlign: 'center' as const,
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.2s',
                opacity: disabled && !active ? 0.5 : 1,
                fontFamily: 'inherit',
            }}
        >
            <span style={{ fontSize: 18 }}>{emoji[color] || '✅'}</span>
            <span style={{
                fontSize: 11,
                fontWeight: 500,
                color: active ? c.text : 'var(--text-muted, #6b7280)'
            }}>{label}</span>
        </button>
    )
}
