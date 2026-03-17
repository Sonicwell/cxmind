/**
 * Shared chart styling constants — Single Source of Truth
 * Replaces duplicate definitions across Analytics components
 */

export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--glass-border)',
    borderRadius: 10,
    color: 'var(--text-primary)',
    fontSize: '0.78rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
};

export const EMOTION_COLORS: Record<string, string> = {
    happy: '#22c55e',
    neutral: '#94a3b8',
    sad: '#3b82f6',
    angry: '#ef4444',
    frustrated: '#f59e0b',
    fear: '#a855f7',
    disgust: '#10b981',
};

export const PIE_COLORS = [
    '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4',
    '#14b8a6', '#10b981', '#22c55e', '#eab308', '#f97316',
];
