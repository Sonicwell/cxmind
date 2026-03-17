import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, XCircle, Clock, Brain, Target, TrendingUp, Smile, BookOpen } from 'lucide-react';
import { getMockCallDetails } from '../../services/mock-data';
import { TranscriptPanel } from './TranscriptPanel';
import { InsightsPanel } from './InsightsPanel';
import type { InsightsData } from './InsightsPanel';
import { EmotionTrack } from './EmotionTrack';

import { AcousticEmotionTrack } from './AcousticEmotionTrack';
import type { EmotionSegmentData } from './TranscriptBubble';
import { StereoAudioPlayer } from '../StereoAudioPlayer';
import { Badge } from '../ui/badge';

interface StructuredSummary {
    intent: string;
    outcome: string;
    nextAction: string;
    entities: Record<string, string>;
    sentiment: string;
    rawSummary: string;
    llmModel: string;
    createdAt: string;
}

const SENTIMENT_EMOJI: Record<string, string> = {
    positive: '😊', negative: '😠', neutral: '😐', mixed: '🤔',
};
function getSentimentEmoji(s: string): string {
    const l = s.toLowerCase();
    for (const [k, e] of Object.entries(SENTIMENT_EMOJI)) {
        if (l.includes(k)) return e;
    }
    return '💬';
}

interface CallAnalysisModalProps {
    callId: string;
    demo?: boolean;
}

interface CallData {
    callId: string;
    startTime: string;
    endTime: string;
    caller: string;
    callee: string;
    lastStatus: number;
    transcriptions: Array<{ timestamp: string; text: string; speaker: string }>;
    summary: string | null;
    quality: {
        mos: number;
        jitter: number;
        packetLoss: number;
        codec?: string;
        pdd_ms?: number;
        r_factor?: number;
        quality_grade?: string;
    };
    hasFullPcap: boolean;
    direction?: string;
}



// ─── Components ───

const StatCard: React.FC<{ label: string; value: string | number; unit?: string; color?: string }> = ({
    label, value, unit, color
}) => (
    <div style={{
        background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.5rem 0.75rem',
        textAlign: 'center',
        minWidth: '80px',
    }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
            {label}
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: color || 'var(--text-primary)' }}>
            {value}
            {unit && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)' }}> {unit}</span>}
        </div>
    </div>
);

export const CallAnalysisModal: React.FC<CallAnalysisModalProps> = ({ callId, demo = false }) => {
    const { t } = useTranslation();
    const [callData, setCallData] = useState<CallData | null>(null);
    const [loading, setLoading] = useState(true);
    const [insights, setInsights] = useState<InsightsData | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [seekTarget, setSeekTarget] = useState<number | undefined>(undefined);
    const [outcome, setOutcome] = useState<{ outcome: string; confidence: number; source: string; reasoning?: string } | null>(null);
    const [acousticSegments, setAcousticSegments] = useState<EmotionSegmentData[]>([]);
    const [textEmotionSegments, setTextEmotionSegments] = useState<EmotionSegmentData[]>([]);
    const [structuredSummary, setStructuredSummary] = useState<StructuredSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (demo) {
                // Use centralized mock data service with scenarios
                const mockData = getMockCallDetails(callId);
                setCallData(mockData.callData as any);
                setInsights(mockData.insights as any);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const callRes = await api.get(`/platform/calls/${callId}`);
                setCallData(callRes.data);

                try {
                    const insightsRes = await api.get(`/platform/calls/${callId}/insights`);
                    if (insightsRes.data.insights) {
                        setInsights(insightsRes.data.insights);
                    }
                } catch { /* No insights yet */ }

                try {
                    const outcomeRes = await api.get(`/platform/calls/${callId}/outcome`);
                    if (outcomeRes.data?.outcome) setOutcome(outcomeRes.data);
                } catch { /* No outcome yet */ }

                // 结构化 summary
                setSummaryLoading(true);
                try {
                    const sumRes = await api.get(`/platform/calls/${callId}/summary`);
                    if (sumRes.data?.data) setStructuredSummary(sumRes.data.data);
                } catch { /* 404 → no summary */ }
                setSummaryLoading(false);

                try {
                    const serRes = await api.get(`/speech-emotion/results/${callId}`);
                    if (serRes.data?.segments) {
                        setAcousticSegments(serRes.data.segments);
                    }
                } catch { /* No SER data */ }
            } catch (err) {
                console.error('Failed to load call data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [callId, demo]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
        );
    }

    if (!callData) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {t('callAnalysisPage.loadFailed', 'Failed to load call data')}
            </div>
        );
    }

    const { transcriptions, summary } = callData;
    const quality = callData.quality || {
        mos: 0,
        jitter: 0,
        packetLoss: 0,
        codec: undefined,
        pdd_ms: undefined,
        r_factor: undefined,
        quality_grade: undefined
    };

    const durationSec = callData.startTime && callData.endTime
        ? Math.round((new Date(callData.endTime).getTime() - new Date(callData.startTime).getTime()) / 1000)
        : 0;
    const durationStr = durationSec > 0
        ? `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`
        : '—';

    const mosColor = quality.mos >= 4 ? 'var(--success)' : quality.mos >= 3 ? 'var(--warning)' : 'var(--danger)';
    const gradeColor = quality.quality_grade === 'A' ? 'var(--success)'
        : quality.quality_grade === 'B' ? '#22c55e'
            : quality.quality_grade === 'C' ? 'var(--warning)'
                : 'var(--danger)';

    const emotionSegments: EmotionSegmentData[] = (insights?.emotionSegments || []) as EmotionSegmentData[];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* ── Quick Stats ── */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <StatCard label={t('callAnalysisPage.duration', 'Duration')} value={durationStr} />
                <StatCard label="MOS" value={quality.mos?.toFixed(2) || '—'} color={mosColor} />
                <StatCard label={t('callDetailsPage.jitter', 'Jitter')} value={quality.jitter?.toFixed(1) || '—'} unit="ms" />
                <StatCard label={t('callDetailsPage.packetLoss', 'Packet Loss')} value={quality.packetLoss != null ? `${(quality.packetLoss * 100).toFixed(1)}` : '—'} unit="%" />
                <StatCard label={t('callAnalysisPage.codec', 'Codec')} value={quality.codec || '—'} />
                {quality.quality_grade && (
                    <StatCard label={t('callAnalysisPage.grade', 'Grade')} value={quality.quality_grade} color={gradeColor} />
                )}
                {quality.pdd_ms != null && quality.pdd_ms > 0 && (
                    <StatCard label="PDD" value={quality.pdd_ms} unit="ms" />
                )}
            </div>

            {/* ── Outcome Intelligence ── */}
            {outcome && (
                <div style={{
                    background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem',
                }}>
                    <div style={{
                        fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                        marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {t('callAnalysisPage.outcomeIntelligence', 'Outcome Intelligence')}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '4px 12px', borderRadius: '20px',
                            fontSize: '0.85rem', fontWeight: 600,
                            background: outcome.outcome === 'success' ? 'rgba(16,185,129,0.15)'
                                : outcome.outcome === 'failure' ? 'rgba(239,68,68,0.15)'
                                    : 'rgba(245,158,11,0.15)',
                            color: outcome.outcome === 'success' ? '#10b981'
                                : outcome.outcome === 'failure' ? '#ef4444'
                                    : '#f59e0b',
                        }}>
                            {outcome.outcome === 'success' ? <CheckCircle2 size={14} />
                                : outcome.outcome === 'failure' ? <XCircle size={14} />
                                    : <Clock size={14} />}
                            {outcome.outcome.replace('_', ' ').toUpperCase()}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {t('callAnalysisPage.confidence', 'Confidence')}: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(outcome.confidence * 100)}%</strong>
                        </span>
                        <Badge style={{ fontSize: '0.6rem' }}>
                            {outcome.source === 'ai' ? '🤖 AI' : '👤 Manual'}
                        </Badge>
                    </div>
                    {outcome.reasoning && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                            💡 {outcome.reasoning}
                        </div>
                    )}
                </div>
            )}

            {/* ── AI Summary ── */}
            {summaryLoading ? (
                <div style={{
                    background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)',
                }}>
                    <Loader2 size={14} className="animate-spin" /> {t('callDetailsPage.loadingSummary', 'Loading AI Summary...')}
                </div>
            ) : structuredSummary ? (
                <div style={{
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(16,185,129,0.06) 100%)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(99,102,241,0.2)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                        <Brain size={16} color="var(--primary)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{t('callDetailsPage.aiSummary', 'AI Summary')}</span>
                        {structuredSummary.llmModel && (
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                                {structuredSummary.llmModel}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.5rem' }}>
                        {structuredSummary.intent && (
                            <div style={{ padding: '0.4rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                    <Target size={11} /> {t('callDetailsPage.intent', 'Intent')}
                                </div>
                                <div style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>{structuredSummary.intent}</div>
                            </div>
                        )}
                        {structuredSummary.outcome && (
                            <div style={{ padding: '0.4rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                    <CheckCircle2 size={11} /> {t('callDetailsPage.outcome', 'Outcome')}
                                </div>
                                <div style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>{structuredSummary.outcome}</div>
                            </div>
                        )}
                        {structuredSummary.nextAction && structuredSummary.nextAction.toLowerCase() !== 'none' && (
                            <div style={{ padding: '0.4rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                    <TrendingUp size={11} /> {t('callDetailsPage.nextAction', 'Next Action')}
                                </div>
                                <div style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>{structuredSummary.nextAction}</div>
                            </div>
                        )}
                        {structuredSummary.sentiment && (
                            <div style={{ padding: '0.4rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                    <Smile size={11} /> {t('callDetailsPage.sentiment', 'Sentiment')}
                                </div>
                                <div style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>{getSentimentEmoji(structuredSummary.sentiment)} {structuredSummary.sentiment}</div>
                            </div>
                        )}
                    </div>
                    {structuredSummary.entities && Object.keys(structuredSummary.entities).length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                                <BookOpen size={11} /> {t('callDetailsPage.keyEntities', 'Key Entities')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.6rem', fontSize: '0.75rem', background: 'rgba(0,0,0,0.1)', padding: '0.4rem', borderRadius: '6px' }}>
                                {Object.entries(structuredSummary.entities).map(([key, value]) => (
                                    <React.Fragment key={key}>
                                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{key.replace(/_/g, ' ')}</span>
                                        <span style={{ fontWeight: 500 }}>{String(value)}</span>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{
                    background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem',
                }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('callDetailsPage.aiSummary', 'AI Summary')}
                    </div>
                    {summary ? (
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{summary}</div>
                    ) : (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            ⚠️ {t('callAnalysisPage.summaryNotAvailable', 'Summary not available')}
                        </div>
                    )}
                </div>
            )}

            {/* ── Insights Panel ── */}
            <div style={{
                background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
            }}>
                <div style={{
                    fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                    marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                    {t('callAnalysisPage.callInsights', 'Call Insights')}
                </div>
                <InsightsPanel
                    callId={callId}
                    insights={insights}
                    onInsightsLoaded={(data) => setInsights(data)}
                    hasFullPcap={callData.hasFullPcap}
                    acousticSegments={acousticSegments}
                    callerLabel={callData.caller}
                    calleeLabel={callData.callee}
                />
            </div>

            {/* ── Transcript ── */}
            <div style={{
                background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
            }}>
                <div style={{
                    fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                    marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                    {t('callAnalysisPage.transcript', 'Transcript')}
                </div>
                <TranscriptPanel
                    callId={callId}
                    realtimeTranscripts={transcriptions || []}
                    emotionSegments={emotionSegments}
                    acousticEmotions={acousticSegments}
                    currentTime={currentTime}
                    startTime={callData.startTime}
                    caller={callData.caller}
                    callee={callData.callee}
                    direction={callData.direction}
                    onTextEmotionSegments={setTextEmotionSegments}
                />
            </div>

            {/* ── Audio Player with Emotion Track ── */}
            <div style={{
                background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '0.5rem'
                }}>
                    <div style={{
                        fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {t('callAnalysisPage.audioPlayer', 'Audio Player')}
                    </div>
                    {demo && <Badge style={{ fontSize: '0.6rem' }}>{t('callAnalysisPage.ttsGenerated', 'TTS Generated')}</Badge>}
                </div>

                {textEmotionSegments.length > 0 && (
                    <EmotionTrack
                        emotionSegments={textEmotionSegments}
                        durationSec={insights?.energyTimelineDurationSec || durationSec || 300}
                        callerLabel={callData.caller}
                        calleeLabel={callData.callee}
                    />
                )}


                {acousticSegments.length > 0 && (
                    <AcousticEmotionTrack
                        segments={acousticSegments}
                        durationSec={insights?.energyTimelineDurationSec || durationSec || 300}
                        onSegmentClick={(t) => setSeekTarget(t + Math.random() * 0.001)}
                        callerLabel={callData.caller}
                        calleeLabel={callData.callee}
                    />
                )}

                {callData.hasFullPcap ? (
                    <StereoAudioPlayer callId={callId} onTimeUpdate={setCurrentTime} seekTo={seekTarget} />
                ) : (
                    <div style={{
                        padding: '0.75rem',
                        background: 'rgba(var(--text-rgb, 255, 255, 255), 0.03)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.85rem',
                    }}>
                        {t('callDetailsPage.noPcap', '未为此通话开启PCAP捕获')}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CallAnalysisModal;
