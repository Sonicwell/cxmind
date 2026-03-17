import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AGENT_STATUS_MAP, resolveStatusColor } from './utils';
import type { ConfiguredStatus } from './utils';
import { Button } from '../ui/button';

/* ─── Inline style constants ─── */
const COLORS = {
    available: AGENT_STATUS_MAP.available.color,
    oncall: AGENT_STATUS_MAP.oncall.color,
    ring: AGENT_STATUS_MAP.ring.color,
    offline: AGENT_STATUS_MAP.offline.color,
    wrapup: AGENT_STATUS_MAP.wrapup.color,
    break: AGENT_STATUS_MAP.break.color,
    away: AGENT_STATUS_MAP.away.color,
    wallWarning: '#eab308',
    wallCritical: '#ef4444',
    heatLow: '#3b82f6',
    heatMid: '#22c55e',
    heatHigh: '#ef4444',
    pulse: '#eab308',
    critical: '#dc2626',
    text: '#e2e8f0',
    textDim: '#94a3b8',
    textMuted: '#64748b',
    bg: 'rgba(2, 6, 23, 0.97)',
    border: 'rgba(255,255,255,0.08)',
    sectionBar: '#06b6d4',
};

const s = {
    panel: {
        background: COLORS.bg,
        backdropFilter: 'blur(16px)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
        marginTop: 8,
        width: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
    } as React.CSSProperties,
    sectionTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        color: COLORS.textDim,
        marginBottom: 10,
    } as React.CSSProperties,
    sectionBar: (color: string) => ({
        width: 3,
        height: 14,
        borderRadius: 2,
        background: color,
    }) as React.CSSProperties,
    statusGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 8px',
    } as React.CSSProperties,
    statusItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: COLORS.text,
    } as React.CSSProperties,
    dot: (color: string, size = 8) => ({
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
        flexShrink: 0,
    }) as React.CSSProperties,
    divider: {
        borderTop: `1px solid ${COLORS.border}`,
        margin: '12px 0',
    } as React.CSSProperties,
    row: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        color: COLORS.text,
    } as React.CSSProperties,
    gradientBar: {
        height: 6,
        width: '100%',
        borderRadius: 4,
        background: `linear-gradient(to right, ${COLORS.heatLow}, ${COLORS.heatMid}, #eab308, ${COLORS.heatHigh})`,
    } as React.CSSProperties,
    gradientLabels: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 9,
        color: COLORS.textMuted,
        marginTop: 3,
    } as React.CSSProperties,
    wallSample: (color: string) => ({
        width: 20,
        height: 4,
        borderRadius: 2,
        background: `linear-gradient(to right, ${color}, ${color})`,
        boxShadow: `0 0 6px ${color}55`,
        flexShrink: 0,
    }) as React.CSSProperties,
    pulseContainer: {
        position: 'relative' as const,
        width: 18,
        height: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    } as React.CSSProperties,
    alertBox: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: 'rgba(220, 38, 38, 0.12)',
        border: '1px solid rgba(220, 38, 38, 0.25)',
        borderRadius: 6,
        color: COLORS.text,
    } as React.CSSProperties,
};

/* ─── Mini animated pulse ring ─── */
const PulseRing: React.FC = () => (
    <div style={s.pulseContainer}>
        <motion.div
            style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `${COLORS.pulse}30`,
            }}
            animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
        />
        <div style={s.dot(COLORS.pulse, 6)} />
    </div>
);

/* ─── Component ─── */
interface MapLegendProps {
    configuredStatuses?: ConfiguredStatus[];
}

const MapLegend: React.FC<MapLegendProps> = ({ configuredStatuses = [] }) => {
    const [expanded, setExpanded] = useState(true);

    const safeStatuses = configuredStatuses || [];
    const statusItems = safeStatuses.length > 0
        ? safeStatuses.map(s => ({
            id: s.id,
            label: s.label,
            color: resolveStatusColor(s.color),
        }))
        : [
            { id: 'available', label: 'Available', color: COLORS.available },
            { id: 'oncall', label: 'On Call', color: COLORS.oncall },
            { id: 'ring', label: 'Ringing', color: COLORS.ring },
            { id: 'away', label: 'Away', color: COLORS.away },
            { id: 'wrapup', label: 'Wrap-up', color: COLORS.wrapup },
            { id: 'break', label: 'Break', color: COLORS.break },
            { id: 'offline', label: 'Offline', color: COLORS.offline },
        ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontFamily: 'ui-monospace, monospace' }}>
            <Button
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(15, 23, 42, 0.9)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: '8px 14px',
                    color: COLORS.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
            >
                <span style={{ color: '#22d3ee', fontSize: 13 }}>◉</span>
                <span>LIVE SIGNALS</span>
                <span style={{ fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>
            </Button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        style={s.panel}
                    >
                        {/* ── 1. Agent Status ── */}
                        <div style={s.sectionTitle}>
                            <div style={s.sectionBar('#22d3ee')} />
                            Agent Status
                        </div>
                        <div style={s.statusGrid}>
                            {statusItems.map(si => (
                                <div key={si.id} style={s.statusItem}>
                                    {si.id === 'ring' ? (
                                        <motion.div
                                            style={s.dot(si.color)}
                                            animate={{ opacity: [1, 0.3, 1] }}
                                            transition={{ duration: 0.8, repeat: Infinity }}
                                        />
                                    ) : (
                                        <div style={s.dot(si.color)} />
                                    )}
                                    {si.label}
                                </div>
                            ))}
                        </div>

                        <div style={s.divider} />

                        {/* ── 2. Call Duration (ring breathing) ── */}
                        <div style={s.sectionTitle}>
                            <div style={s.sectionBar('#06b6d4')} />
                            Call Duration
                        </div>
                        <div style={s.row}>
                            <motion.div
                                style={s.dot(COLORS.oncall, 10)}
                                animate={{ opacity: [0.4, 0.7, 0.4] }}
                                transition={{ duration: 3, repeat: Infinity }}
                            />
                            <span>Slow pulse → Short call</span>
                        </div>
                        <div style={s.row}>
                            <motion.div
                                style={s.dot(COLORS.oncall, 10)}
                                animate={{ opacity: [0.4, 0.7, 0.4] }}
                                transition={{ duration: 1.2, repeat: Infinity }}
                            />
                            <span>Fast pulse → Long call (&gt;8min)</span>
                        </div>

                        <div style={s.divider} />

                        {/* ── 3. Stress Level (avatar border) ── */}
                        <div style={s.sectionTitle}>
                            <div style={s.sectionBar('#facc15')} />
                            Stress Level
                        </div>
                        <div style={s.row}>
                            <div style={{
                                width: 18, height: 18, borderRadius: '50%',
                                border: '2px solid #facc15', background: 'rgba(250,204,21,0.1)',
                                flexShrink: 0,
                            }} />
                            <span>Yellow border → Medium stress</span>
                        </div>
                        <div style={s.row}>
                            <div style={{
                                width: 18, height: 18, borderRadius: '50%',
                                border: '3px solid #ef4444', background: 'rgba(239,68,68,0.15)',
                                flexShrink: 0,
                            }} />
                            <span>Red border → High stress</span>
                        </div>

                        <div style={s.divider} />

                        {/* ── 4. Zone Alerts ── */}
                        <div style={s.sectionTitle}>
                            <div style={s.sectionBar('#a855f7')} />
                            Zone Alerts
                        </div>
                        <div style={s.row}>
                            <PulseRing />
                            <span>Zone Pulse = Ringing Agents</span>
                        </div>
                        <div style={s.row}>
                            <div style={s.wallSample(COLORS.wallCritical)} />
                            <span>Red Wall → &gt;80% On Call</span>
                        </div>
                        <div style={s.row}>
                            <div style={s.wallSample(COLORS.wallWarning)} />
                            <span>Yellow Wall → &gt;50% On Call</span>
                        </div>

                        <div style={s.divider} />

                        {/* ── 3. Stress Heatmap ── */}
                        <div style={s.sectionTitle}>
                            <div style={s.sectionBar('#ec4899')} />
                            Stress Heatmap
                        </div>
                        <div style={s.gradientBar} />
                        <div style={s.gradientLabels}>
                            <span>Low</span>
                            <span>Medium</span>
                            <span>High</span>
                        </div>

                        <div style={s.divider} />

                        {/* ── 4. System Health ── */}
                        <div style={s.sectionTitle}>
                            <div style={s.sectionBar(COLORS.critical)} />
                            System Health
                        </div>
                        <div style={s.alertBox}>
                            <motion.span
                                animate={{ opacity: [1, 0.4, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                                style={{ fontSize: 14 }}
                            >
                                ⚡
                            </motion.span>
                            <span>Red Environment = Critical Alert</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export { MapLegend };
