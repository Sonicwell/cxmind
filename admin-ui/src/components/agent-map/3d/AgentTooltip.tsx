

import React, { useMemo, useEffect, useState } from 'react';
import { AGENT_STATUS_MAP, DEFAULT_STATUS, getStatusLabel } from '../utils';
import { Button } from '../../ui/button';

/* ─── Types ─── */

interface AgentTooltipProps {
    agent: any;
    isLocked: boolean;
    onLock: () => void;
    onClose: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    visible?: boolean;
}

/* ─── Helpers ─── */

const formatDuration = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
};

/* ─── Component ─── */

export const AgentTooltip: React.FC<AgentTooltipProps> = ({ agent, isLocked, onLock, onClose, onMouseEnter, onMouseLeave, visible = true }) => {
    const status = agent?.status || 'offline';
    const statusDef = AGENT_STATUS_MAP[status] || DEFAULT_STATUS;
    const statusColor = statusDef.color;
    const statusLabel = getStatusLabel(status);

    // Live duration timer
    const [elapsed, setElapsed] = useState('');
    useEffect(() => {
        if (!agent?.lastStatusChange) { setElapsed(''); return; }
        const tick = () => {
            const ms = Date.now() - new Date(agent.lastStatusChange).getTime();
            setElapsed(formatDuration(Math.max(0, ms)));
        };
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [agent?.lastStatusChange]);

    // 从 agent 对象读取真实指标（由 AgentMap 批量 API 注入），不再随机 fallback
    const metrics = useMemo(() => ({
        aht: agent?.avgHandleTime || '—',
        sentiment: agent?.sentimentScore ?? '—',
        callsToday: agent?.callsToday ?? 0,
    }), [agent?.id, agent?.callsToday, agent?.avgHandleTime, agent?.sentimentScore]);

    const name = agent?.boundUser?.displayName || agent?.name || agent?.id?.slice(-6) || 'Unknown';
    const sipNumber = agent?.sipNumber || agent?.extension || '';

    if (!visible) return null;

    return (
        <div
            onClick={(e) => { e.stopPropagation(); if (!isLocked) onLock(); }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                ...styles.container,
                borderColor: statusColor + '66',
                cursor: isLocked ? 'default' : 'pointer',
                // pointer events要能穿透
                pointerEvents: 'auto',
            }}
        >
            {/* Close button (locked only) */}
            {isLocked && (
                <Button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    style={styles.closeBtn}
                    title="Unpin"
                >
                    ✕
                </Button>
            )}

            {/* ── Header ── */}
            <div style={styles.header}>
                <div style={styles.avatarWrap}>
                    <img
                        src={agent?.avatar || '/avatars/agent_1.png'}
                        alt=""
                        style={styles.avatar}
                    />
                    <span style={{ ...styles.statusDot, backgroundColor: statusColor }} />
                </div>
                <div style={styles.headerText}>
                    <div style={styles.name}>{name}</div>
                    {sipNumber && <div style={styles.sip}>{sipNumber}</div>}
                </div>
                <div style={{ ...styles.statusPill, backgroundColor: statusColor + '30', color: statusColor }}>
                    {status !== 'available' && statusLabel}
                    {elapsed && <span style={styles.timer}>{status !== 'available' ? ' ' : ''}{elapsed}</span>}
                </div>
            </div>

            {/* ── Metrics Grid ── */}
            <div style={styles.metricsGrid}>
                <div style={styles.metric}>
                    <span style={styles.metricLabel}>AHT</span>
                    <span style={styles.metricValue}>{metrics.aht}</span>
                </div>
                <div style={styles.metric}>
                    <span style={styles.metricLabel}>Sentiment</span>
                    <span style={styles.metricValue}>{metrics.sentiment}</span>
                </div>
                <div style={styles.metric}>
                    <span style={styles.metricLabel}>Calls</span>
                    <span style={styles.metricValue}>{metrics.callsToday}</span>
                </div>
            </div>

            {/* ── Lock hint ── */}
            {!isLocked && (
                <div style={styles.hint}>Click to pin</div>
            )}
        </div>
    );
};

/* ─── Styles ─── */

const styles: Record<string, React.CSSProperties> = {
    container: {
        width: 220,
        background: 'rgba(10, 15, 30, 0.92)',
        backdropFilter: 'blur(12px)',
        borderRadius: 10,
        border: '1px solid',
        padding: '10px 12px',
        fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
        color: '#e2e8f0',
        fontSize: 12,
        lineHeight: 1.4,
        position: 'relative',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        userSelect: 'none',
    },
    closeBtn: {
        position: 'absolute',
        top: 4,
        right: 6,
        background: 'none',
        border: 'none',
        color: '#94a3b8',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 'bold',
        lineHeight: 1,
        padding: '2px 4px',
        borderRadius: 4,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    avatarWrap: {
        position: 'relative',
        flexShrink: 0,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        objectFit: 'cover',
        border: '2px solid #334155',
    },
    statusDot: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: '2px solid #0a0f1e',
    },
    headerText: {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
    },
    name: {
        fontWeight: 600,
        fontSize: 13,
        color: '#f1f5f9',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    sip: {
        fontSize: 10,
        color: '#64748b',
        fontFamily: "'Roboto Mono', monospace",
    },
    statusPill: {
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
    },
    timer: {
        fontFamily: "'Roboto Mono', monospace",
        fontWeight: 400,
    },
    metricsGrid: {
        display: 'flex',
        gap: 4,
        borderTop: '1px solid rgba(148,163,184,0.12)',
        paddingTop: 8,
    },
    metric: {
        flex: 1,
        textAlign: 'center',
    },
    metricLabel: {
        display: 'block',
        fontSize: 9,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 2,
    },
    metricValue: {
        display: 'block',
        fontSize: 13,
        fontWeight: 600,
        color: '#e2e8f0',
        fontFamily: "'Roboto Mono', monospace",
    },
    hint: {
        textAlign: 'center',
        fontSize: 9,
        color: '#475569',
        marginTop: 6,
        letterSpacing: '0.05em',
    },
};
