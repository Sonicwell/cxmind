// OutcomeCard: compact AI outcome prediction display
// UX: single-line badge with confidence indicator, renders after SummaryCard
import React from 'react'
import { TrendingUp, TrendingDown, RotateCw, HelpCircle } from 'lucide-react'

interface OutcomeCardProps {
    outcome: string
    confidence: number
    reasoning: string
    sessionId?: string
}

const OUTCOME_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
    success: { icon: <TrendingUp size={14} />, label: 'Success', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },
    failure: { icon: <TrendingDown size={14} />, label: 'Failed', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
    follow_up: { icon: <RotateCw size={14} />, label: 'Follow-up', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    unknown: { icon: <HelpCircle size={14} />, label: 'Unknown', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
}

export const OutcomeCard: React.FC<OutcomeCardProps> = ({ outcome, confidence, reasoning }) => {
    const config = OUTCOME_CONFIG[outcome] || OUTCOME_CONFIG.unknown
    const pct = Math.round(confidence * 100)
    const isLowConfidence = confidence < 0.6

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            background: config.bg,
            border: `1px solid ${config.color}33`,
            fontSize: '0.78rem',
        }}>
            <span style={{ color: config.color, display: 'flex', alignItems: 'center' }}>
                {config.icon}
            </span>
            <span style={{ fontWeight: 600, color: config.color }}>
                AI Outcome: {config.label}
            </span>
            <span style={{
                marginLeft: 'auto',
                padding: '1px 8px', borderRadius: 10,
                fontSize: '0.7rem', fontWeight: 500,
                background: isLowConfidence ? 'transparent' : config.color + '20',
                color: config.color,
                border: isLowConfidence ? `1px dashed ${config.color}60` : 'none',
            }}>
                {pct}%
            </span>
            {reasoning && (
                <span style={{
                    color: 'var(--text-muted)', fontSize: '0.7rem',
                    maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={reasoning}>
                    {reasoning}
                </span>
            )}
        </div>
    )
}
