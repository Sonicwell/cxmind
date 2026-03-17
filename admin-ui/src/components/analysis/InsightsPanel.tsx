import React, { useState } from 'react';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import { MotionButton } from '../ui/MotionButton';
import { Loader2, Rocket, RefreshCw } from 'lucide-react';

interface ScoreBreakdown {
    talkBalance: number;
    responsiveness: number;
    noInterruption: number;
    paceControl: number;
}

interface SilenceEvent {
    startSec: number;
    durationSec: number;
}

interface InterruptionEvent {
    timeSec: number;
    durationSec: number;
    initiator: 'caller' | 'callee';
}

export interface InsightsData {
    callId: string;
    analyzedAt: string;
    callerTalkRatio: number;
    calleeTalkRatio: number;
    silenceRatio: number;
    overlapRatio: number;
    silenceEvents: SilenceEvent[];
    longestSilenceSec: number;
    interruptionCount: number;
    interruptions: InterruptionEvent[];
    callerWPM: number;
    calleeWPM: number;
    callerSentiment: string;
    calleeSentiment: string;
    agentScore: number;
    scoreBreakdown: ScoreBreakdown;
    emotionSegments?: Array<{
        startSec: number;
        endSec: number;
        speaker: 'caller' | 'callee';
        emotion: string;
        confidence: number;
        source: string;
    }>;
    energyTimelineDurationSec?: number;
}

interface InsightsPanelProps {
    callId: string;
    insights: InsightsData | null;
    onInsightsLoaded: (data: InsightsData) => void;
    hasFullPcap?: boolean;
    acousticSegments?: Array<{ speaker: string; emotion: string; confidence: number }>;
    callerLabel?: string;
    calleeLabel?: string;
}

const SENTIMENT_EMOJI: Record<string, string> = {
    positive: '😊',
    neutral: '😐',
    negative: '😤',
    happy: '😊',
    sad: '😢',
    angry: '😡',
    frustrated: '😤',
    fear: '😨',
    disgust: '🤢',
    disgusted: '🤢',
    surprise: '😲',
    surprised: '😲',
};

const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 80 }) => {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="var(--glass-border)" strokeWidth="4" />
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={color} strokeWidth="4"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{score}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>/100</span>
            </div>
        </div>
    );
};

const RatioBar: React.FC<{ caller: number; callee: number; silence: number; callerLabel?: string; calleeLabel?: string }> = ({ caller, callee, silence, callerLabel, calleeLabel }) => (
    <div style={{ width: '100%' }}>
        <div style={{
            display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden',
            background: 'var(--glass-border)',
        }}>
            <div style={{ width: `${caller * 100}%`, background: '#6366f1' }}
                title={`Caller: ${Math.round(caller * 100)}%`} />
            <div style={{ width: `${callee * 100}%`, background: '#22c55e' }}
                title={`Callee: ${Math.round(callee * 100)}%`} />
            <div style={{ width: `${silence * 100}%`, background: 'var(--glass-border)' }}
                title={`Silence: ${Math.round(silence * 100)}%`} />
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.7rem' }}>
            <span style={{ color: '#6366f1' }}>● {callerLabel || 'Caller'} {Math.round(caller * 100)}%</span>
            <span style={{ color: '#22c55e' }}>● {calleeLabel || 'Callee'} {Math.round(callee * 100)}%</span>
            <span style={{ color: 'var(--text-muted)' }}>● Silence {Math.round(silence * 100)}%</span>
        </div>
    </div>
);

const ScoreItem: React.FC<{ label: string; value: number; max: number }> = ({ label, value, max }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
        <span style={{ flex: 1, color: 'var(--text-muted)' }}>{label}</span>
        <div style={{
            width: '60px', height: '4px', background: 'var(--glass-border)',
            borderRadius: '2px', overflow: 'hidden',
        }}>
            <div style={{
                width: `${(value / max) * 100}%`, height: '100%',
                background: value / max >= 0.8 ? 'var(--success)' : value / max >= 0.5 ? 'var(--warning)' : 'var(--danger)',
                borderRadius: '2px', transition: 'width 0.5s ease',
            }} />
        </div>
        <span style={{ fontWeight: 600, minWidth: '30px', textAlign: 'right' }}>{value}/{max}</span>
    </div>
);

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ callId, insights, onInsightsLoaded, hasFullPcap, acousticSegments, callerLabel, calleeLabel }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const triggerAnalysis = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.post(`/platform/calls/${callId}/insights`);
            if (res.data.insights) {
                onInsightsLoaded(res.data.insights);
            } else {
                setError('Analysis completed but no data returned');
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Analysis failed');
        } finally {
            setLoading(false);
        }
    };

    // PCAP 未开启时显示与音频播放器一致的提示
    if (hasFullPcap === false && !insights) {
        return (
            <div style={{
                padding: '0.75rem',
                background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-border)',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
            }}>
                {t('callDetailsPage.noPcap', '未为此通话开启PCAP捕获')}
            </div>
        );
    }

    if (!insights) {
        return (
            <div style={{
                padding: '2rem', textAlign: 'center',
                background: 'rgba(var(--text-rgb, 255, 255, 255), 0.02)',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
            }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>📊</div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                    {t('insightsPanel.noData', 'No analysis data yet')}
                </div>
                {error && (
                    <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                        ⚠️ {error}
                    </div>
                )}
                <MotionButton
                    className="flex items-center gap-sm"
                    onClick={triggerAnalysis}
                    disabled={loading}
                    style={{ margin: '0 auto' }}
                >
                    {loading ? (
                        <><Loader2 size={14} className="animate-spin" /> {t('insightsPanel.analyzing', 'Analyzing...')}</>
                    ) : (
                        <><Rocket size={14} /> {t('insightsPanel.runAnalysis', 'Run Analysis')}</>
                    )}
                </MotionButton>
            </div>
        );
    }

    const { agentScore, scoreBreakdown, callerTalkRatio, calleeTalkRatio, silenceRatio,
        overlapRatio, callerWPM, calleeWPM,
        interruptionCount, longestSilenceSec, silenceEvents, emotionSegments } = insights;

    // 计算 per-speaker top 3 非 neutral 情绪
    const topEmotions = (speaker: string) => {
        const source = acousticSegments && acousticSegments.length > 0 ? acousticSegments : (emotionSegments || []);
        const segs = source.filter(e => e.speaker === speaker);
        if (segs.length === 0) return [];

        const counts: Record<string, number> = {};
        segs.forEach(e => { counts[e.emotion] = (counts[e.emotion] || 0) + 1; });

        return Object.entries(counts)
            .filter(([k]) => k !== 'neutral')
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([emotion, count]) => ({
                emotion,
                emoji: SENTIMENT_EMOJI[emotion] || '❓',
                pct: Math.round(count / segs.length * 100),
            }));
    };

    const callerTop = topEmotions('caller');
    const calleeTop = topEmotions('callee');

    const renderTopEmotions = (items: ReturnType<typeof topEmotions>) => {
        if (items.length === 0) return <span>😐 neutral</span>;
        return (
            <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {items.map((item, i) => (
                    <span key={i} title={item.emotion}>
                        {item.emoji}
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 1 }}>
                            {item.pct}%
                        </span>
                    </span>
                ))}
            </span>
        );
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '1rem', alignItems: 'start' }}>
            {/* Agent Score */}
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    {t('insightsPanel.agentScore', 'Agent Score')}
                </div>
                <ScoreRing score={agentScore} />
                <div style={{ marginTop: '0.5rem' }}>
                    <ScoreItem label={t('insightsPanel.talkBalance', 'Talk Balance')} value={scoreBreakdown.talkBalance} max={25} />
                    <ScoreItem label={t('insightsPanel.responsiveness', 'Responsiveness')} value={scoreBreakdown.responsiveness} max={25} />
                    <ScoreItem label={t('insightsPanel.noInterruption', 'No Interruption')} value={scoreBreakdown.noInterruption} max={25} />
                    <ScoreItem label={t('insightsPanel.paceControl', 'Pace Control')} value={scoreBreakdown.paceControl} max={25} />
                </div>
            </div>

            {/* Talk Distribution + Details */}
            <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {t('insightsPanel.talkDistribution', 'Talk Distribution')}
                </div>
                <RatioBar caller={callerTalkRatio} callee={calleeTalkRatio} silence={silenceRatio} callerLabel={callerLabel} calleeLabel={calleeLabel} />

                <div style={{
                    marginTop: '0.75rem', fontSize: '0.75rem',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem',
                }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('insightsPanel.overlap', 'Overlap')}</span>
                    <span style={{ fontWeight: 600 }}>{Math.round(overlapRatio * 100)}%</span>
                    <span style={{ color: 'var(--text-muted)' }}>{t('insightsPanel.interruptions', 'Interruptions')}</span>
                    <span style={{ fontWeight: 600 }}>{interruptionCount}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{t('insightsPanel.deadAirEvents', 'Dead Air Events')}</span>
                    <span style={{ fontWeight: 600 }}>
                        {silenceEvents.length}
                        {longestSilenceSec > 0 && ` (max ${longestSilenceSec.toFixed(1)}s)`}
                    </span>
                </div>
            </div>

            {/* Speech Pace + Sentiment */}
            <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {t('insightsPanel.speechPaceSentiment', 'Speech Pace & Sentiment')}
                </div>
                <div style={{ fontSize: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{callerLabel || t('insightsPanel.callerWpm', 'Caller')} WPM</span>
                    <span style={{ fontWeight: 600 }}>{callerWPM || '—'}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{calleeLabel || t('insightsPanel.calleeWpm', 'Callee')} WPM</span>
                    <span style={{ fontWeight: 600 }}>{calleeWPM || '—'}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{callerLabel || 'Caller'}</span>
                    {renderTopEmotions(callerTop)}
                    <span style={{ color: 'var(--text-muted)' }}>{calleeLabel || 'Callee'}</span>
                    {renderTopEmotions(calleeTop)}
                </div>

                {/* Re-analyze button */}
                <div style={{ marginTop: '1rem' }}>
                    <MotionButton
                        variant="ghost"
                        className="flex items-center gap-sm"
                        onClick={triggerAnalysis}
                        disabled={loading}
                    >
                        {loading ? (
                            <><Loader2 size={12} className="animate-spin" /> {t('insightsPanel.reAnalyzing', 'Re-analyzing...')}</>
                        ) : (
                            <><RefreshCw size={12} /> {t('insightsPanel.reAnalyze', 'Re-analyze')}</>
                        )}
                    </MotionButton>
                </div>
            </div>
        </div>
    );
};

export default InsightsPanel;
