import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';

/**
 * EmotionCurve — Real-time valence line chart for a single call.
 *
 * Subscribes to `call:emotion` WS events and renders a sparkline showing:
 * - Valence (0.0–1.0) over time as a smooth gradient line
 * - Emotion label bubbles at key points
 * - Color zones: red (<0.3), yellow (0.3–0.6), green (>0.6)
 *
 * Usage: Drop inside a Monitoring session card to show live SER data.
 */

interface EmotionPoint {
    ts: number;         // Unix ms
    valence: number;    // 0.0 – 1.0
    emotion: string;    // e.g. "angry", "happy"
    confidence: number;
}

interface EmotionCurveProps {
    callId: string;
    height?: number;
}

const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊', neutral: '😐', sad: '😢',
    angry: '😡', fearful: '😰', disgusted: '🤢', surprised: '😲',
};

const MAX_POINTS = 60; // ~5 min at 5s intervals

export const EmotionCurve: React.FC<EmotionCurveProps> = ({ callId, height = 80 }) => {
    const { subscribe } = useWebSocket();
    const [points, setPoints] = useState<EmotionPoint[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    // Subscribe to call:emotion events for this specific call
    useEffect(() => {
        const unsubscribe = subscribe('call:emotion', (message: any) => {
            const data = message.data || message;
            if (data.call_id !== callId) return;

            const point: EmotionPoint = {
                ts: data.ts || Date.now(),
                valence: data.valence ?? 0.5,
                emotion: data.emotion || 'neutral',
                confidence: data.confidence ?? 0,
            };

            setPoints(prev => [...prev, point].slice(-MAX_POINTS));
        });

        return () => unsubscribe();
    }, [callId, subscribe]);

    // Build SVG path from points
    const { pathD, areaD, labelPoints } = useMemo(() => {
        if (points.length < 2) return { pathD: '', areaD: '', labelPoints: [] as EmotionPoint[] };

        const w = 100; // viewBox width percentage
        const h = height;
        const padding = 4;
        const usableH = h - padding * 2;

        const xStep = w / (points.length - 1);

        const coords = points.map((p, i) => ({
            x: i * xStep,
            y: padding + usableH * (1 - p.valence), // Invert: high valence = top
            point: p,
        }));

        // Smooth line path (quadratic bezier)
        let d = `M ${coords[0].x} ${coords[0].y}`;
        for (let i = 1; i < coords.length; i++) {
            const prev = coords[i - 1];
            const curr = coords[i];
            const cpx = (prev.x + curr.x) / 2;
            d += ` Q ${cpx} ${prev.y} ${curr.x} ${curr.y}`;
        }

        // Area fill (down to bottom)
        const area = d + ` L ${coords[coords.length - 1].x} ${h} L ${coords[0].x} ${h} Z`;

        // Pick label points: first, last, and any emotion change
        const labels: EmotionPoint[] = [points[0]];
        for (let i = 1; i < points.length; i++) {
            if (points[i].emotion !== points[i - 1].emotion) {
                labels.push(points[i]);
            }
        }
        if (points.length > 1) labels.push(points[points.length - 1]);

        return { pathD: d, areaD: area, labelPoints: labels };
    }, [points, height]);

    // Current (latest) emotion
    const latest = points[points.length - 1];
    const latestColor = latest
        ? (latest.valence > 0.6 ? '#22c55e' : latest.valence > 0.3 ? '#f59e0b' : '#ef4444')
        : '#64748b';

    const getPointX = useCallback((p: EmotionPoint) => {
        if (points.length < 2) return 50;
        const idx = points.indexOf(p);
        return idx >= 0 ? (idx / (points.length - 1)) * 100 : 50;
    }, [points]);

    const getPointY = useCallback((p: EmotionPoint) => {
        const padding = 4;
        const usableH = height - padding * 2;
        return padding + usableH * (1 - p.valence);
    }, [height]);

    if (points.length === 0) {
        return (
            <div style={{
                padding: '8px 12px', fontSize: 11, color: '#64748b',
                borderTop: '1px solid var(--glass-border)',
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <span>🧠</span> Waiting for emotion data...
            </div>
        );
    }

    // Apply CSS custom property to parent session-card for glow effect
    useEffect(() => {
        if (!containerRef.current || !latest) return;
        const card = containerRef.current.closest('.session-card');
        if (card instanceof HTMLElement) {
            card.style.setProperty('--emotion-glow-color', latestColor);
            card.style.setProperty('--emotion-glow-opacity', latest.valence < 0.3 ? '0.6' : '0.3');
            card.classList.add('emotion-active');
            if (latest.valence < 0.25) {
                card.classList.add('emotion-critical');
            } else {
                card.classList.remove('emotion-critical');
            }
        }
    }, [latest, latestColor]);

    return (
        <div ref={containerRef} style={{
            borderTop: '1px solid var(--glass-border)',
            padding: '6px 12px 8px',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 4, fontSize: 10,
            }}>
                <span style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🧠 Emotion SER
                </span>
                {latest && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 14 }}>{EMOTION_EMOJI[latest.emotion] || '😐'}</span>
                        <span style={{ color: latestColor, fontWeight: 600 }}>
                            {(latest.valence * 100).toFixed(0)}%
                        </span>
                    </span>
                )}
            </div>

            {/* SVG Chart */}
            <svg
                viewBox={`0 0 100 ${height}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height, display: 'block' }}
            >
                {/* Zone backgrounds */}
                <rect x="0" y="0" width="100" height={height * 0.4} fill="rgba(34, 197, 94, 0.06)" />
                <rect x="0" y={height * 0.4} width="100" height={height * 0.3} fill="rgba(245, 158, 11, 0.06)" />
                <rect x="0" y={height * 0.7} width="100" height={height * 0.3} fill="rgba(239, 68, 68, 0.06)" />

                {/* Zone lines */}
                <line x1="0" y1={height * 0.4} x2="100" y2={height * 0.4}
                    stroke="rgba(245, 158, 11, 0.15)" strokeWidth="0.3" strokeDasharray="2 2" />
                <line x1="0" y1={height * 0.7} x2="100" y2={height * 0.7}
                    stroke="rgba(239, 68, 68, 0.15)" strokeWidth="0.3" strokeDasharray="2 2" />

                {/* Area fill */}
                {areaD && (
                    <path d={areaD} fill="url(#valenceGrad)" opacity="0.2" />
                )}

                {/* Line */}
                {pathD && (
                    <path d={pathD} fill="none" stroke={latestColor} strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* Emotion change dots */}
                {labelPoints.map((p, i) => (
                    <circle key={i} cx={getPointX(p)} cy={getPointY(p)} r="2"
                        fill={p.valence > 0.6 ? '#22c55e' : p.valence > 0.3 ? '#f59e0b' : '#ef4444'}
                        stroke="#0f172a" strokeWidth="0.5" />
                ))}

                {/* Gradient definition */}
                <defs>
                    <linearGradient id="valenceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                        <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Valence Glow Bar — pulsing color bar at bottom */}
            <div style={{
                height: 3,
                borderRadius: 2,
                marginTop: 4,
                background: `linear-gradient(90deg, transparent, ${latestColor}, transparent)`,
                opacity: latest && latest.valence < 0.3 ? 0.8 : 0.4,
                animation: latest && latest.valence < 0.3 ? 'emotion-pulse 1.5s ease-in-out infinite' : 'none',
            }} />

            <style>{`
                @keyframes emotion-pulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 1; }
                }
            `}</style>
        </div>
    );
};
