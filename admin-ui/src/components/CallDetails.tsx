import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, MessageSquare, Loader2, CheckCircle2, XCircle, Clock, Brain, Target, TrendingUp, Smile, BookOpen, PhoneOff, ChevronDown, Shield, Hammer, Trash2 } from 'lucide-react';
import { MotionButton } from './ui/MotionButton';
import QualityTimeline from './QualityTimeline';
import { StereoAudioPlayer } from './StereoAudioPlayer';
import { DtmfEvents } from './DtmfEvents';

import { getMockCallDetails } from '../services/mock-data';
import { Button } from './ui/button';
import { ConfirmModal } from './ui/ConfirmModal';
import { STORAGE_KEYS } from '../constants/storage-keys';

// SOP Cart helpers (shared with TranscriptPanel)
interface SopCartItem {
    callId: string;
    caller: string;
    callee: string;
    intent: string;
    addedAt: string;
}

function getSopCart(): SopCartItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SOP_CART);
        if (!raw) return [];
        const data = JSON.parse(raw);
        const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
        return (data.calls || []).filter((c: SopCartItem) => new Date(c.addedAt).getTime() > sevenDaysAgo);
    } catch { return []; }
}

function saveSopCart(calls: SopCartItem[]) {
    localStorage.setItem(STORAGE_KEYS.SOP_CART, JSON.stringify({ calls }));
}

interface CallDetailsProps {
    callId: string;
    onOpenSipDialog: () => void;
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
        rtt?: number;
        quality_grade?: string;
        directions?: Array<{
            direction: string;
            mos_score: number;
            jitter_avg: number;
            packet_loss_rate: number;
            rtt_avg: number;
        }>;
        sig_src_country?: string;
        sig_dst_country?: string;
        media_src_country?: string;
        media_dst_country?: string;
        oneWayAudio?: {
            detected: boolean;
            details: string;
        };
    };
    hasFullPcap: boolean;
}

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
    positive: '😊',
    negative: '😠',
    neutral: '😐',
    mixed: '🤔',
};

function getSentimentEmoji(sentiment: string): string {
    const lower = sentiment.toLowerCase();
    for (const [key, emoji] of Object.entries(SENTIMENT_EMOJI)) {
        if (lower.includes(key)) return emoji;
    }
    if (lower.includes('satisfied') || lower.includes('happy')) return '😊';
    if (lower.includes('frustrated') || lower.includes('angry')) return '😠';
    return '💬';
}

const CallDetails: React.FC<CallDetailsProps> = ({ callId, onOpenSipDialog, demo = false }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [call, setCall] = useState<CallData | null>(null);
    const [loading, setLoading] = useState(true);
    const [outcome, setOutcome] = useState<{ outcome: string; confidence: number; source: string } | null>(null);
    const [structuredSummary, setStructuredSummary] = useState<StructuredSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [pcapMenuOpen, setPcapMenuOpen] = useState<'sip' | 'full' | null>(null);

    // SOP Cart state
    const [sopCart, setSopCart] = useState<SopCartItem[]>([]);
    const [showBuildConfirm, setShowBuildConfirm] = useState(false);

    useEffect(() => {
        setSopCart(getSopCart());
        // storage event 同步多 tab
        const handleStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEYS.SOP_CART) setSopCart(getSopCart());
        };
        window.addEventListener('storage', handleStorage);
        // 也监听同 tab 内的变更 (TranscriptPanel 可能修改 cart)
        const interval = setInterval(() => setSopCart(getSopCart()), 2000);
        return () => { window.removeEventListener('storage', handleStorage); clearInterval(interval); };
    }, [callId]);


    useEffect(() => {
        const fetchDetails = async () => {
            if (demo) {
                const mockData = getMockCallDetails(callId);
                setCall(mockData.callData as any);
                setLoading(false);
                return;
            }

            try {
                // Use platform API prefix
                const response = await api.get(`/platform/calls/${callId}`);
                setCall(response.data);
            } catch (error) {
                console.error('Failed to fetch call details', error);
            } finally {
                setLoading(false);
            }
        };

        if (callId) {
            fetchDetails();
            // Fetch outcome
            if (demo) {
                const outcomes = ['success', 'failure', 'follow_up'];
                setOutcome({ outcome: outcomes[Math.floor(Math.random() * 3)], confidence: 0.75 + Math.random() * 0.2, source: 'ai' });
                // Demo structured summary
                setStructuredSummary({
                    intent: 'Product inquiry about premium subscription',
                    outcome: 'Resolved — customer upgraded to premium plan',
                    nextAction: 'Send confirmation email with plan details',
                    entities: { customer_name: 'John Doe', plan: 'Premium', amount: '$29.99/mo' },
                    sentiment: 'Curious → Satisfied',
                    rawSummary: '',
                    llmModel: 'gpt-4o-mini',
                    createdAt: new Date().toISOString(),
                });
            } else {
                api.get(`/platform/calls/${callId}/outcome`).then(r => {
                    if (r.data?.data) setOutcome(r.data.data);
                }).catch(() => { });

                // Fetch structured summary
                setSummaryLoading(true);
                api.get(`/platform/calls/${callId}/summary`).then(r => {
                    if (r.data?.data) setStructuredSummary(r.data.data);
                }).catch(() => { }).finally(() => setSummaryLoading(false));
            }
        }
    }, [callId, demo]);

    const handlePcapDownload = async (type: 'sip' | 'full', redact: boolean) => {
        setPcapMenuOpen(null);
        try {
            if (demo) {
                const link = document.createElement('a');
                link.href = '/mock/demo.pcap';
                link.setAttribute('download', `${callId}_${type}.pcap`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                return;
            }

            const endpoint = type === 'sip' ? 'pcap' : 'full-pcap';
            const params = redact ? '?redact=full' : '';
            const response = await api.get(`/platform/calls/${callId}/${endpoint}${params}`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const suffix = redact ? '_redacted' : '';
            link.setAttribute('download', `${callId}_${type}${suffix}.pcap`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error(`Failed to download ${type} PCAP`, error);
            alert(`Failed to download ${type.toUpperCase()} PCAP`);
        }
    };

    if (!callId) return null;

    if (loading) {
        return (
            <div className="flex justify-center items-center p-8 gap-sm text-muted">
                <Loader2 className="animate-spin" /> {t('callDetailsPage.loadingDetails', 'Loading details...')}
            </div>
        );
    }

    if (!call) return (
        <div className="p-8 text-center text-muted">
            {t('callDetailsPage.notFound', 'Call details not found.')}
        </div>
    );

    // Quality Colors
    let mosColor = 'var(--text-muted)';
    if (call.quality?.mos) {
        if (call.quality.mos >= 4.0) mosColor = 'var(--success)';
        else if (call.quality.mos >= 3.0) mosColor = 'var(--warning)';
        else mosColor = 'var(--danger)';
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: '1rem',
        }}>
            {/* Outcome Badge */}
            {outcome && (
                <div className="card" style={{
                    padding: '0.5rem 0.75rem',
                    background: outcome.outcome === 'success' ? 'rgba(16, 185, 129, 0.15)' :
                        outcome.outcome === 'failure' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${outcome.outcome === 'success' ? 'rgba(16, 185, 129, 0.3)' :
                        outcome.outcome === 'failure' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    gridColumn: '1 / -1',
                }}
                >
                    {outcome.outcome === 'success' ? <CheckCircle2 size={16} color="#10b981" /> :
                        outcome.outcome === 'failure' ? <XCircle size={16} color="#ef4444" /> :
                            <Clock size={16} color="#f59e0b" />}
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>
                        {outcome.outcome === 'follow_up' ? 'Follow-up' : outcome.outcome}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {outcome.source === 'ai' ? '🤖 AI' : '👤 Manual'}
                        {outcome.confidence > 0 && ` · ${Math.round(outcome.confidence * 100)}%`}
                    </span>
                </div>
            )}

            {/* One-Way Audio Warning */}
            {call.quality?.oneWayAudio?.detected && (
                <div className="card animate-fade-in" style={{
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    gridColumn: '1 / -1',
                }}>
                    <PhoneOff size={16} color="#ef4444" className="animate-pulse" />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ef4444' }}>
                        ⚠️ {t('callDetailsPage.oneWayAudio', 'One-Way Audio Detected')}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        — {call.quality.oneWayAudio.details}
                    </span>
                </div>
            )}

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{t('callDetailsPage.caller', 'Caller')}</div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{call.caller}</div>
                </div>
                <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{t('callDetailsPage.callee', 'Callee')}</div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{call.callee}</div>
                </div>
                <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{t('callDetailsPage.qualityMos', 'Quality (MOS)')}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: mosColor }}>
                        {call.quality?.mos !== undefined && call.quality?.mos !== null ? call.quality.mos.toFixed(2) : 'N/A'}
                        {call.quality?.quality_grade && (
                            <span style={{ fontSize: '0.7rem', marginLeft: '4px', opacity: 0.7 }}>({call.quality.quality_grade})</span>
                        )}
                    </div>
                </div>
                {call.quality?.r_factor !== undefined && call.quality?.r_factor !== null && call.quality.r_factor > 0 && (
                    <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>R-Factor</div>
                        <div style={{
                            fontSize: '1rem', fontWeight: 600,
                            color: call.quality.r_factor >= 80 ? 'var(--success)' : call.quality.r_factor >= 70 ? 'var(--warning)' : 'var(--danger)'
                        }}>
                            {call.quality.r_factor}
                            <span style={{ fontSize: '0.7rem', marginLeft: '4px', opacity: 0.7 }}>
                                ({call.quality.r_factor >= 90 ? 'Excellent' : call.quality.r_factor >= 80 ? 'Good' : call.quality.r_factor >= 70 ? 'Fair' : 'Poor'})
                            </span>
                        </div>
                    </div>
                )}
                <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{t('callDetailsPage.jitter', 'Jitter')}</div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                        {call.quality?.jitter !== undefined && call.quality?.jitter !== null ? call.quality.jitter.toFixed(2) + ' ms' : 'N/A'}
                    </div>
                </div>
                <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{t('callDetailsPage.packetLoss', 'Packet Loss')}</div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                        {call.quality?.packetLoss !== undefined && call.quality?.packetLoss !== null ? (call.quality.packetLoss * 100).toFixed(2) + '%' : 'N/A'}
                    </div>
                </div>
                {call.quality?.codec && (
                    <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Codec</div>
                        <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{call.quality.codec}</div>
                    </div>
                )}
                {call.quality?.pdd_ms !== undefined && call.quality.pdd_ms > 0 && (
                    <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>PDD</div>
                        <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{(call.quality.pdd_ms / 1000).toFixed(1)}s</div>
                    </div>
                )}
                {call.quality?.rtt !== undefined && (
                    <div className="card" style={{ padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>RTT</div>
                        <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{call.quality.rtt.toFixed(0)}ms</div>
                    </div>
                )}
            </div>

            {/* Directional Quality Comparison */}
            {call.quality?.directions && call.quality.directions.length > 0 && (
                <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{t('callDetailsPage.directionalQuality', 'Directional Quality')}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${call.quality.directions.length}, 1fr)`, gap: '0.75rem' }}>
                        {call.quality.directions.map((dir, i) => (
                            <div key={i} style={{ padding: '0.5rem', border: '1px solid var(--glass-border)', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.4rem', textTransform: 'capitalize' }}>
                                    {dir.direction === 'caller' ? '📤 Caller → Callee' : dir.direction === 'callee' ? '📥 Callee → Caller' : dir.direction}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', fontSize: '0.78rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>MOS</span>
                                    <span style={{ fontWeight: 600, color: dir.mos_score >= 4.0 ? 'var(--success)' : dir.mos_score >= 3.0 ? 'var(--warning)' : 'var(--danger)' }}>
                                        {dir.mos_score.toFixed(2)}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)' }}>Jitter</span>
                                    <span>{dir.jitter_avg.toFixed(1)}ms</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Loss</span>
                                    <span>{(dir.packet_loss_rate * 100).toFixed(2)}%</span>
                                    <span style={{ color: 'var(--text-muted)' }}>RTT</span>
                                    <span>{dir.rtt_avg.toFixed(0)}ms</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Quality Timeline Charts */}
            <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>📈 {t('callDetailsPage.qualityTimeline', 'Quality Timeline')}</h3>
                <QualityTimeline callId={callId} />
            </div>

            {/* Signaling / Media Path */}
            {(call.quality?.sig_src_country || call.quality?.media_src_country) && (
                <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{t('callDetailsPage.networkPath', 'Network Path')}</h3>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.8' }}>
                        {call.quality.sig_src_country && (
                            <div>📡 SIP: <strong>{call.quality.sig_src_country}</strong> → <strong>{call.quality.sig_dst_country || '?'}</strong></div>
                        )}
                        {call.quality.media_src_country && (
                            <div>🎵 RTP: <strong>{call.quality.media_src_country}</strong> → <strong>{call.quality.media_dst_country || '?'}</strong></div>
                        )}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {/* SIP PCAP Dropdown */}
                <div style={{ position: 'relative' }}>
                    <MotionButton
                        variant="ghost"
                        className="flex items-center gap-sm"
                        onClick={() => setPcapMenuOpen(pcapMenuOpen === 'sip' ? null : 'sip')}
                        title="Download SIP Signaling PCAP"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    >
                        <ArrowDownToLine size={14} /> SIP PCAP <ChevronDown size={12} />
                    </MotionButton>
                    {pcapMenuOpen === 'sip' && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                            background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                            borderRadius: 'var(--radius-md)', padding: '4px', zIndex: 50,
                            minWidth: '180px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        }}>
                            <Button
                                onClick={() => handlePcapDownload('sip', false)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '6px 10px', border: 'none',
                                    background: 'transparent', color: 'var(--text-primary)',
                                    cursor: 'pointer', borderRadius: '4px', fontSize: '0.82rem',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                <ArrowDownToLine size={13} /> Original
                            </Button>
                            <Button
                                onClick={() => handlePcapDownload('sip', true)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '6px 10px', border: 'none',
                                    background: 'transparent', color: 'var(--text-primary)',
                                    cursor: 'pointer', borderRadius: '4px', fontSize: '0.82rem',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                <Shield size={13} /> Redacted
                            </Button>
                        </div>
                    )}
                </div>

                {/* Full PCAP Dropdown — 仅在有录制时显示 */}
                {call.hasFullPcap && (
                    <div style={{ position: 'relative' }}>
                        <MotionButton
                            variant="ghost"
                            className="flex items-center gap-sm"
                            onClick={() => setPcapMenuOpen(pcapMenuOpen === 'full' ? null : 'full')}
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                            title="Download full RTP PCAP from disk"
                        >
                            <ArrowDownToLine size={14} /> Full PCAP <ChevronDown size={12} />
                        </MotionButton>
                        {pcapMenuOpen === 'full' && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                                background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-md)', padding: '4px', zIndex: 50,
                                minWidth: '180px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                            }}>
                                <Button
                                    onClick={() => handlePcapDownload('full', false)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        width: '100%', padding: '6px 10px', border: 'none',
                                        background: 'transparent', color: 'var(--text-primary)',
                                        cursor: 'pointer', borderRadius: '4px', fontSize: '0.82rem',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <ArrowDownToLine size={13} /> Original
                                </Button>
                                <Button
                                    onClick={() => handlePcapDownload('full', true)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        width: '100%', padding: '6px 10px', border: 'none',
                                        background: 'transparent', color: 'var(--text-primary)',
                                        cursor: 'pointer', borderRadius: '4px', fontSize: '0.82rem',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <Shield size={13} /> Redacted
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                <MotionButton
                    variant="ghost"
                    className="flex items-center gap-sm"
                    onClick={onOpenSipDialog}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                >
                    <MessageSquare size={14} /> SIP Diagram
                </MotionButton>

            </div>

            {/* Structured AI Summary Card */}
            {summaryLoading && (
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={16} className="animate-spin" /> {t('callDetailsPage.loadingSummary', 'Loading AI Summary...')}
                </div>
            )}

            {/* Stereo Audio Player — only when PCAP exists */}
            {call.hasFullPcap ? (
                <StereoAudioPlayer callId={callId} />
            ) : (
                <div className="card" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {t('callDetailsPage.noPcap', 'PCAP recording not enabled for this call')}
                </div>
            )}

            {/* DTMF Events (Offline PCAP Parsing) */}
            <DtmfEvents callId={callId} hasFullPcap={call.hasFullPcap} />

            {structuredSummary && (
                <div className="card" style={{
                    padding: '1rem',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(16,185,129,0.06) 100%)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(99,102,241,0.2)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <Brain size={18} color="var(--primary)" />
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>{t('callDetailsPage.aiSummary', 'AI Summary')}</h3>
                        {structuredSummary.llmModel && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                                {structuredSummary.llmModel}
                            </span>
                        )}
                    </div>

                    {/* Summary Fields Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {structuredSummary.intent && (
                            <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                    <Target size={12} /> {t('callDetailsPage.intent', 'Intent')}
                                </div>
                                <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>{structuredSummary.intent}</div>
                            </div>
                        )}
                        {structuredSummary.outcome && (
                            <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                    <CheckCircle2 size={12} /> {t('callDetailsPage.outcome', 'Outcome')}
                                </div>
                                <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>{structuredSummary.outcome}</div>
                            </div>
                        )}
                        {structuredSummary.nextAction && structuredSummary.nextAction.toLowerCase() !== 'none' && (
                            <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                    <TrendingUp size={12} /> {t('callDetailsPage.nextAction', 'Next Action')}
                                </div>
                                <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>{structuredSummary.nextAction}</div>
                            </div>
                        )}
                        {structuredSummary.sentiment && (
                            <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                    <Smile size={12} /> {t('callDetailsPage.sentiment', 'Sentiment')}
                                </div>
                                <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                                    {getSentimentEmoji(structuredSummary.sentiment)} {structuredSummary.sentiment}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Entities Table */}
                    {structuredSummary.entities && Object.keys(structuredSummary.entities).length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.6rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                                <BookOpen size={12} /> {t('callDetailsPage.keyEntities', 'Key Entities')}
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'auto 1fr',
                                gap: '0.2rem 0.75rem',
                                fontSize: '0.8rem',
                                background: 'rgba(0,0,0,0.1)',
                                padding: '0.5rem',
                                borderRadius: '6px',
                            }}>
                                {Object.entries(structuredSummary.entities).map(([key, value]) => (
                                    <React.Fragment key={key}>
                                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {key.replace(/_/g, ' ')}
                                        </span>
                                        <span style={{ fontWeight: 500 }}>{String(value)}</span>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Fallback: plain text summary when no structured data */}
            {!structuredSummary && !summaryLoading && call.summary && (
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>{t('callDetailsPage.aiSummary', 'AI Summary')}</h3>
                    <div style={{ lineHeight: '1.6', color: 'var(--text-secondary)' }}>{call.summary}</div>
                </div>
            )}

            {/* SOP Cart Fixed Bar */}
            {sopCart.length > 0 && (
                <div style={{
                    padding: '0.75rem', borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.06))',
                    border: '1px solid rgba(99,102,241,0.2)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: sopCart.length > 0 ? '0.5rem' : 0 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
                            📋 {t('sopBuilder.cart.cartTitle', { count: sopCart.length }).replace('📋 ', '')}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '0.5rem' }}>
                        {sopCart.map((item) => (
                            <div key={item.callId} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '4px 8px', borderRadius: '4px',
                                background: 'rgba(0,0,0,0.1)', fontSize: '0.72rem',
                            }}>
                                <span style={{ color: 'var(--text-muted)' }}>
                                    {new Date(item.addedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span style={{ flex: 1 }}>
                                    {item.caller} → {item.callee}
                                </span>
                                {item.intent && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{item.intent}</span>
                                )}
                                <button
                                    onClick={() => {
                                        const updated = sopCart.filter(c => c.callId !== item.callId);
                                        saveSopCart(updated);
                                        setSopCart(updated);
                                    }}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', padding: '2px',
                                    }}
                                    title={t('sopBuilder.cart.removeFromCart')}
                                >
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <Button
                        onClick={() => setShowBuildConfirm(true)}
                        style={{
                            width: '100%', fontSize: '0.8rem', padding: '8px 12px',
                            background: 'var(--primary)', color: 'white', border: 'none',
                            borderRadius: '6px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                    >
                        <Hammer size={14} /> {t('sopBuilder.cart.buildSopCalls', { count: sopCart.length })}
                    </Button>

                    <ConfirmModal
                        open={showBuildConfirm}
                        onClose={() => setShowBuildConfirm(false)}
                        onConfirm={() => navigate('/sop/builder?from=calls')}
                        title={t('sopBuilder.cart.confirmTitle')}
                        description={t('sopBuilder.cart.confirmDesc', { count: sopCart.length })}
                        confirmText={t('sopBuilder.cart.confirmBtn')}
                        isDanger={false}
                    />
                </div>
            )}


        </div>
    );
};

export default CallDetails;
