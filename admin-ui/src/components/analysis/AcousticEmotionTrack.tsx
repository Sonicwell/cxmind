import React, { useMemo } from 'react';
import type { EmotionSegmentData } from './TranscriptBubble';
import { Activity } from 'lucide-react';

interface AcousticEmotionTrackProps {
    segments: EmotionSegmentData[];
    durationSec: number;
    onSegmentClick?: (timestamp: number) => void;
    callerLabel?: string;
    calleeLabel?: string;
}

const EMOTION_COLORS: Record<string, string> = {
    happy: '#22c55e',      // Green
    neutral: '#94a3b8',    // Slate/Gray
    sad: '#3b82f6',        // Blue
    angry: '#ef4444',      // Red
    frustrated: '#f59e0b', // Amber
    fear: '#a855f7',       // Purple
    disgust: '#10b981',    // Emerald (distinct from happy?)
    surprise: '#ec4899',   // Pink
};

export const AcousticEmotionTrack: React.FC<AcousticEmotionTrackProps> = ({ segments, durationSec, onSegmentClick, callerLabel, calleeLabel }) => {
    if (!segments || segments.length === 0 || durationSec <= 0) return null;

    const callerSegments = useMemo(() => segments.filter(s => s.speaker === 'caller'), [segments]);
    const calleeSegments = useMemo(() => segments.filter(s => s.speaker === 'callee'), [segments]);
    const mixedSegments = useMemo(() => segments.filter(s => s.speaker === 'mixed' || !s.speaker), [segments]);

    // 全部为 mixed 时单轨，否则双轨（mixed 归入 caller 轨道）
    const isSingleTrack = callerSegments.length === 0 && calleeSegments.length === 0;

    const renderTrack = (trackSegments: EmotionSegmentData[], label: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '24px', marginBottom: '4px' }}>
            <span style={{
                fontSize: '0.65rem', color: 'var(--text-muted)', width: '50px',
                textAlign: 'right', flexShrink: 0,
            }}>
                {label}
            </span>
            <div style={{
                flex: 1, position: 'relative', height: '100%',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px', overflow: 'hidden',
                border: '1px solid var(--glass-border)',
            }}>
                {trackSegments.map((seg, idx) => {
                    const startPercent = (seg.startSec / durationSec) * 100;
                    const widthPercent = ((seg.endSec - seg.startSec) / durationSec) * 100;
                    const color = EMOTION_COLORS[seg.emotion] || EMOTION_COLORS.neutral;

                    // Opacity based on confidence (min 0.3)
                    const opacity = Math.max(0.3, seg.confidence);

                    return (
                        <div
                            key={idx}
                            onClick={() => onSegmentClick?.(seg.startSec)}
                            title={`${seg.emotion} (${Math.round(seg.confidence * 100)}%) - ${seg.startSec.toFixed(1)}s`}
                            style={{
                                position: 'absolute',
                                left: `${startPercent}%`,
                                width: `${Math.max(widthPercent, 0.5)}%`,
                                height: '100%',
                                backgroundColor: color,
                                opacity: opacity,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.zIndex = '10';
                                e.currentTarget.style.transform = 'scaleY(1.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = String(opacity);
                                e.currentTarget.style.zIndex = '1';
                                e.currentTarget.style.transform = 'scaleY(1)';
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );

    return (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', paddingLeft: '58px' }}>
                <Activity size={12} color="var(--primary)" />
                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Acoustic Emotion
                </span>
            </div>
            {isSingleTrack ? (
                renderTrack(mixedSegments, 'All')
            ) : (
                <>
                    {renderTrack([...callerSegments, ...mixedSegments], callerLabel || 'Caller')}
                    {renderTrack(calleeSegments, calleeLabel || 'Callee')}
                </>
            )}
            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', paddingLeft: '58px', marginTop: '6px' }}>
                {Object.entries(EMOTION_COLORS).map(([emotion, color]) => (
                    <div key={emotion} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, opacity: 0.8 }} />
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{emotion}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
