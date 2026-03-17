import React from 'react';
import type { EmotionSegmentData } from './TranscriptBubble';

interface EmotionTrackProps {
    emotionSegments: EmotionSegmentData[];
    durationSec: number;
    callerLabel?: string;
    calleeLabel?: string;
}

const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊',
    neutral: '😐',
    sad: '😢',
    frustrated: '😤',
    angry: '😡',
};

const EMOTION_BG: Record<string, string> = {
    happy: 'rgba(34, 197, 94, 0.15)',
    neutral: 'rgba(148, 163, 184, 0.1)',
    sad: 'rgba(59, 130, 246, 0.15)',
    frustrated: 'rgba(245, 158, 11, 0.15)',
    angry: 'rgba(239, 68, 68, 0.15)',
};

export const EmotionTrack: React.FC<EmotionTrackProps> = ({ emotionSegments, durationSec, callerLabel, calleeLabel }) => {
    if (emotionSegments.length === 0 || durationSec <= 0) return null;

    const callerSegments = emotionSegments.filter(e => e.speaker === 'caller');
    const calleeSegments = emotionSegments.filter(e => e.speaker === 'callee');

    const renderTrack = (segments: EmotionSegmentData[], label: string) => {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', height: '20px' }}>
                <span style={{
                    fontSize: '0.6rem', color: 'var(--text-muted)', width: '60px',
                    textAlign: 'right', flexShrink: 0,
                }}>
                    {label}
                </span>
                <div style={{
                    flex: 1, position: 'relative', height: '18px',
                    background: 'rgba(var(--text-rgb, 255, 255, 255), 0.02)',
                    borderRadius: '4px', overflow: 'hidden',
                }}>
                    {segments.map((seg, idx) => {
                        const left = (seg.startSec / durationSec) * 100;
                        const width = Math.max(((seg.endSec - seg.startSec) / durationSec) * 100, 2);
                        // 透明度按 confidence 缩放: 低置信度更淡
                        const opacity = Math.max(0.3, Math.min(1, seg.confidence * 5));

                        return (
                            <div
                                key={idx}
                                title={`${seg.emotion} (${Math.round(seg.confidence * 100)}%) at ${seg.startSec.toFixed(1)}s`}
                                style={{
                                    position: 'absolute',
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    height: '100%',
                                    background: EMOTION_BG[seg.emotion] || EMOTION_BG.neutral,
                                    opacity,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    cursor: 'help',
                                    borderRadius: '2px',
                                    transition: 'transform 0.2s ease',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.transform = 'scaleY(1.4)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.transform = 'scaleY(1)';
                                }}
                            >
                                {EMOTION_EMOJI[seg.emotion] || '😐'}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div style={{
            padding: '0.25rem 0',
            borderBottom: '1px solid var(--glass-border)',
            marginBottom: '0.25rem',
        }}>
            {renderTrack(callerSegments, callerLabel || 'Caller')}
            {renderTrack(calleeSegments, calleeLabel || 'Callee')}
        </div>
    );
};

export default EmotionTrack;
