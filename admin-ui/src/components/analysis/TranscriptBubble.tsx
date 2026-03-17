import React from 'react';

export interface EmotionSegmentData {
    startSec: number;
    endSec: number;
    speaker: 'caller' | 'callee' | 'mixed';
    emotion: 'angry' | 'happy' | 'neutral' | 'sad' | 'frustrated';
    confidence: number;
    source: 'text' | 'acoustic' | 'text_anchor';
}

interface TranscriptBubbleProps {
    text: string;
    speaker: string;
    timestamp: string;
    emotion?: EmotionSegmentData;
    isRight?: boolean; // callee = right aligned
}

const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊',
    neutral: '😐',
    sad: '😢',
    frustrated: '😤',
    angry: '😡',
};

const EMOTION_COLOR: Record<string, string> = {
    happy: 'var(--success)',
    neutral: 'var(--text-muted)',
    sad: '#4A90D9',
    frustrated: 'var(--warning)',
    angry: 'var(--danger)',
};

export const TranscriptBubble: React.FC<TranscriptBubbleProps & { isCurrent?: boolean }> = ({
    text,
    speaker,
    timestamp,
    emotion,
    isRight = false,
    isCurrent = false,
}) => {
    const bubbleRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (isCurrent && bubbleRef.current) {
            bubbleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isCurrent]);

    const formatTime = (ts: string) => {
        try {
            const d = new Date(ts);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch { return ts; }
    };

    const emoji = emotion ? EMOTION_EMOJI[emotion.emotion] || '😐' : null;
    const emojiColor = emotion ? EMOTION_COLOR[emotion.emotion] || 'var(--text-muted)' : undefined;

    return (
        <div
            ref={bubbleRef}
            style={{
                display: 'flex',
                justifyContent: isRight ? 'flex-end' : 'flex-start',
                marginBottom: '0.5rem',
                paddingLeft: isRight ? '20%' : 0,
                paddingRight: isRight ? 0 : '20%',
                opacity: isCurrent ? 1 : 0.7,
                transition: 'opacity 0.3s ease',
            }}
        >
            <div style={{
                background: isCurrent
                    ? (isRight ? 'rgba(var(--primary-rgb, 99, 102, 241), 0.25)' : 'rgba(255, 255, 255, 0.15)')
                    : (isRight ? 'rgba(var(--primary-rgb, 99, 102, 241), 0.1)' : 'rgba(var(--text-rgb, 255, 255, 255), 0.05)'),
                border: isCurrent
                    ? `1px solid ${isRight ? 'var(--primary)' : 'rgba(255, 255, 255, 0.5)'}`
                    : `1px solid ${isRight ? 'rgba(var(--primary-rgb, 99, 102, 241), 0.2)' : 'var(--glass-border)'}`,
                borderRadius: isRight ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '0.5rem 0.75rem',
                maxWidth: '100%',
                position: 'relative',
                boxShadow: isCurrent ? '0 0 15px rgba(var(--primary-rgb, 99, 102, 241), 0.2)' : 'none',
                transition: 'all 0.3s ease',
            }}>
                {/* Header: speaker + time + emoji */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.25rem',
                    fontSize: '0.7rem',
                    color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                        {speaker}
                    </span>
                    <span>{formatTime(timestamp)}</span>
                    {emoji && (
                        <span
                            title={`${emotion!.emotion} (${Math.round(emotion!.confidence * 100)}%)`}
                            style={{
                                cursor: 'help',
                                fontSize: '0.85rem',
                                filter: `drop-shadow(0 0 2px ${emojiColor})`,
                            }}
                        >
                            {emoji}
                        </span>
                    )}
                </div>

                {/* Text */}
                <div style={{ fontSize: '0.85rem', lineHeight: 1.5, color: isCurrent ? 'var(--text-primary)' : 'inherit' }}>
                    {text}
                </div>
            </div>
        </div>
    );
};

export default TranscriptBubble;
