import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Phone, Mail, Bot, Clock, ChevronLeft, Search, Activity, Sparkles, Brain, ArrowRight, MousePointerClick, Zap, Target, AlertTriangle, Link2Off, Users, Fingerprint, User, TrendingDown, MessageSquare, BarChart3, PhoneIncoming, PhoneOutgoing, Loader2, ChevronDown } from 'lucide-react';
import api, { getPlatformSettings } from '../services/api';
import { useDemoMode } from '../hooks/useDemoMode';
import AvatarInitials from '../components/ui/AvatarInitials';
import { Button } from '../components/ui/button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { GlassModal } from '../components/ui/GlassModal';
import { AcousticEmotionTrack } from '../components/analysis/AcousticEmotionTrack';
import { CallAnalysisModal } from '../components/analysis/CallAnalysisModal';
import { toast } from 'sonner';
import '../styles/dashboard.css';

interface ContactTimelineItem {
    type: 'sip_call' | 'omni_message' | 'action_draft' | 'agent_action';
    timestamp: string;
    data: any;
}

const ContactDetail: React.FC = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { demoMode: isDemo } = useDemoMode();
    const [contact, setContact] = useState<any>(null);
    const [timeline, setTimeline] = useState<ContactTimelineItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [contactStages, setContactStages] = useState<any[]>([]);
    const [generatingProfile, setGeneratingProfile] = useState(false);
    const [unmergeConfirm, setUnmergeConfirm] = useState<{ isOpen: boolean, sourceId: string | null }>({ isOpen: false, sourceId: null });
    // UI state for toggling the Audio X-Ray waveform per timeline item
    const [expandedAudioNodes, setExpandedAudioNodes] = useState<{ [key: number]: boolean }>({});
    // Emotion data cache for X-Ray
    const [emotionCache, setEmotionCache] = useState<Record<number, any>>({}); // { segments, summary }
    const [emotionLoading, setEmotionLoading] = useState<Record<number, boolean>>({});
    // SER Job Status Tracking (queued/processing)
    const [serStatus, setSerStatus] = useState<Record<number, { status: string, error?: string }>>({})
    // SER global enabled flag
    const [serEnabled, setSerEnabled] = useState<boolean | null>(null);;
    // Inline transcript toggle
    const [expandedTranscript, setExpandedTranscript] = useState<{ [key: number]: boolean }>({});
    const [transcriptCache, setTranscriptCache] = useState<Record<number, any[]>>({});
    const [transcriptLoading, setTranscriptLoading] = useState<Record<number, boolean>>({});
    // Structured summary cache for expanded items
    const [summaryCache, setSummaryCache] = useState<Record<number, any>>({});
    // CallAnalysisModal
    const [analysisCallId, setAnalysisCallId] = useState<string | null>(null);
    // Timeline filter
    const [timelineFilter, setTimelineFilter] = useState<'all' | 'sip_call' | 'omni_message' | 'action_draft'>('all');
    // Load more pagination (client-side slicing)
    const [displayLimit, setDisplayLimit] = useState(20);

    // Testing Center State
    const [injecting, setInjecting] = useState(false);
    const [purging, setPurging] = useState(false);
    const [showTestingCenter, setShowTestingCenter] = useState(true); // Open by default if in Demo Mode

    useEffect(() => {
        fetchContactData();
    }, [id, isDemo]);

    const fetchContactData = async () => {
        setLoading(true);
        try {
            // Use the new API we created
            const basePath = isDemo ? `/contacts/${id}?demo=true` : `/contacts/${id}`;
            const [profileRes, timelineRes, settings] = await Promise.all([
                api.get(basePath),
                api.get(`/contacts/${id}/timeline${isDemo ? '?demo=true' : ''}`).catch(() => ({ data: { data: [] } })),
                getPlatformSettings().catch(() => null)
            ]);

            if (settings?.contactStages) {
                setContactStages(settings.contactStages.sort((a: any, b: any) => a.order - b.order));
            }

            // Axios nests the response body in .data, and our backend wraps the payload in { data: ... }
            setContact(profileRes.data?.data || profileRes.data);
            setTimeline(timelineRes.data?.data || []);
        } catch (error) {
            console.error('Failed to fetch contact details:', error);
        } finally {
            setLoading(false);
        }
    };


    const handleInjectScenario = async (scenario: string) => {
        setInjecting(true);
        try {
            await api.put(`/contacts/${id}/demo-override`, { scenario });
            toast.success(t('contactDetail.magicInjected', 'Magic injected: {{scenario}}', { scenario: scenario.replace('_', ' ') }));
            await fetchContactData(); // Reload fresh data
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('contactDetail.injectionFailed', 'Injection failed'));
        } finally {
            setInjecting(false);
        }
    };

    const handleEraseMagic = async () => {
        setPurging(true);
        try {
            await api.post(`/contacts/${id}/demo-purge`);
            toast.success(t('contactDetail.magicErased', 'Magic erased, restored to baseline.'));
            await fetchContactData(); // Reload fresh data
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('contactDetail.purgeFailed', 'Purge failed'));
        } finally {
            setPurging(false);
        }
    };

    const handleUnmerge = async (sourceId: string) => {
        try {
            await api.post(`/contacts/${id}/unmerge/${sourceId}`);
            toast.success(t('contactDetail.unmergeSuccess', 'Profile successfully unmerged'));
            setUnmergeConfirm({ isOpen: false, sourceId: null });
            await fetchContactData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('contactDetail.unmergeFailed', 'Failed to unmerge profile'));
        }
    };

    const handleGenerateProfile = async () => {
        setGeneratingProfile(true);
        try {
            await api.post(`/contacts/${id}/generate-profile`);
            toast.success(t('contactDetail.profileGenerated', 'AI Profile generated successfully'));
            await fetchContactData();
        } catch (error: any) {
            console.error('AI Profile Generation Error:', error);
            if (error.response?.status === 400 && error.response.data?.error?.includes('No interaction records found')) {
                toast.warning(t('contactDetail.notEnoughData', 'Not enough communication data to generate a profile for this contact yet.'));
            } else {
                toast.error(error.response?.data?.error || error.message || t('contactDetail.profileGenFailed', 'Failed to generate profile. Please check log.'));
            }
        } finally {
            setGeneratingProfile(false);
        }
    };

    // Fetch SER enabled status once on mount
    useEffect(() => {
        api.get('/speech-emotion/status')
            .then(res => setSerEnabled(res.data?.data?.enabled ?? false))
            .catch(() => setSerEnabled(false));
    }, []);

    // Global Poller for SER Jobs
    useEffect(() => {
        // Collect all keys (timeline item index) that have pending or processing status
        const pendingIndices = Object.keys(serStatus)
            .map(Number)
            .filter(idx => serStatus[idx]?.status === 'pending' || serStatus[idx]?.status === 'processing');

        if (pendingIndices.length === 0) return;

        const timer = setInterval(() => {
            pendingIndices.forEach(idx => {
                const callId = timeline[idx]?.data?.callId;
                if (!callId) return;

                api.get(`/speech-emotion/status/${callId}`)
                    .then(res => {
                        const newStatus = res.data?.data?.status;
                        if (newStatus && newStatus !== serStatus[idx].status) {
                            setSerStatus(prev => ({ ...prev, [idx]: { status: newStatus, error: res.data?.data?.error } }));
                            // Automatically fetch results upon completion
                            if (newStatus === 'completed') {
                                Promise.allSettled([
                                    api.get(`/platform/calls/${callId}/insights`),
                                    api.get(`/speech-emotion/results/${callId}`)
                                ]).then(([insRes, serRes]) => {
                                    const baseInsights = insRes.status === 'fulfilled' ? (insRes.value.data?.insights || insRes.value.data || {}) : {};
                                    const serSegments = serRes.status === 'fulfilled' ? (serRes.value.data?.segments || []) : [];
                                    setEmotionCache(prev => ({
                                        ...prev,
                                        [idx]: {
                                            ...baseInsights,
                                            emotionSegments: serSegments.length > 0 ? serSegments : (baseInsights.emotionSegments || [])
                                        }
                                    }));
                                });
                            }
                        }
                    }).catch(() => { });
            });
        }, 3000);

        return () => clearInterval(timer);
    }, [serStatus, timeline]);

    if (loading) {
        return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('contactDetail.loading')}</div>;
    }

    if (!contact) {
        return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('contactDetail.notFound')}</div>;
    }

    return (
        <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', padding: 0 }}>
            <header className="page-header glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--border-color)', margin: 0, borderRadius: 0, flexShrink: 0 }}>
                <Button onClick={() => navigate('/contacts')} variant="secondary" style={{ padding: '8px', border: 'none', background: 'transparent' }}>
                    <ChevronLeft size={20} />
                </Button>
                <AvatarInitials name={contact.displayName || 'Unknown'} size={40} />
                <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {contact.displayName || 'Unknown'}
                        {contact.stage && (() => {
                            const config = contactStages.find(c => c.id === contact.stage);
                            const displayLabel = config ? (config.i18nKey ? t(config.i18nKey) : config.label) : contact.stage;

                            const resolveColor = (colorName: string): { bg: string; text: string } => {
                                const colorMap: Record<string, { bg: string; text: string }> = {
                                    slate: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
                                    indigo: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8' },
                                    blue: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
                                    emerald: { bg: 'rgba(16,185,129,0.12)', text: '#34d399' },
                                    green: { bg: 'rgba(34,197,94,0.12)', text: '#4ade80' },
                                    red: { bg: 'rgba(239,68,68,0.12)', text: '#f87171' },
                                };
                                return colorMap[colorName] || { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' };
                            };

                            const c = resolveColor(config?.color || 'slate');
                            return <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: c.bg, color: c.text }}>{displayLabel}</span>;
                        })()}
                        {contact.tags?.map((t: string) => <span key={t} className="badge bg-surface text-secondary" style={{ fontSize: '0.7rem' }}>{t}</span>)}
                    </h2>
                    <p className="text-secondary" style={{ margin: 0, fontSize: '0.85rem' }}>{contact.company || t('contactDetail.individualContact')}</p>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {/* Left Sidebar: Profile Details (Fixed) */}
                <div className="glass-panel" style={{ width: 300, borderRight: '1px solid var(--border-color)', borderRadius: 0, padding: 24, overflowY: 'auto', flexShrink: 0 }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>{t('contactDetail.contactProfile')}</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="text-secondary" style={{ fontSize: '0.8rem' }}>{t('contactDetail.phoneNumbers')}</label>
                            {contact.identifiers?.phone?.map((p: string) => (
                                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <Phone size={14} className="text-primary" /> {p}
                                </div>
                            )) || <div className="text-secondary">-</div>}
                        </div>

                        <div>
                            <label className="text-secondary" style={{ fontSize: '0.8rem' }}>{t('contactDetail.emailAddresses')}</label>
                            {contact.identifiers?.email?.map((e: string) => (
                                <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <Mail size={14} className="text-primary" /> {e}
                                </div>
                            )) || <div className="text-secondary">-</div>}
                        </div>

                        {/* Stage & Channel */}
                        <div>
                            <label className="text-secondary" style={{ fontSize: '0.8rem' }}>{t('contacts.col.stage')}</label>
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {(() => {
                                    const s = contact.stage || 'Visitor';
                                    const config = contactStages.find(c => c.id === s);
                                    const displayLabel = config ? (config.i18nKey ? t(config.i18nKey) : config.label) : s;

                                    const resolveColor = (colorName: string): { bg: string; text: string } => {
                                        const colorMap: Record<string, { bg: string; text: string }> = {
                                            slate: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
                                            indigo: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8' },
                                            blue: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
                                            emerald: { bg: 'rgba(16,185,129,0.12)', text: '#34d399' },
                                            green: { bg: 'rgba(34,197,94,0.12)', text: '#4ade80' },
                                            red: { bg: 'rgba(239,68,68,0.12)', text: '#f87171' },
                                        };
                                        return colorMap[colorName] || { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' };
                                    };

                                    const c = resolveColor(config?.color || 'slate');
                                    return <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: c.bg, color: c.text }}>{displayLabel}</span>;
                                })()}
                                {contact.lastContactChannel && (
                                    <span className="text-secondary" style={{ fontSize: '0.78rem' }}>via {contact.lastContactChannel}</span>
                                )}
                            </div>
                        </div>

                        {/* Merged Profiles Section */}
                        {contact.mergedFrom && contact.mergedFrom.length > 0 && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                    <Users size={14} className="text-primary" />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Combined Profiles ({contact.mergedFrom.length})</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {contact.mergedFrom.map((sourceId: string) => (
                                        <div key={sourceId} className="glass-panel" style={{ padding: '8px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(99,102,241,0.03)', border: '1px solid rgba(99,102,241,0.1)' }}>
                                            <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                                                ID: {sourceId.substring(0, 8)}...
                                            </div>
                                            <Button size="sm" variant="ghost" className="text-danger border-danger"
                                                style={{ padding: '2px 8px', fontSize: '0.65rem', border: '1px dashed var(--danger)', color: 'var(--danger)', background: 'transparent', display: 'flex', gap: 4, alignItems: 'center' }}
                                                onClick={() => setUnmergeConfirm({ isOpen: true, sourceId })}
                                                title={t('contactDetail.unmergeProfile', 'Unmerge this profile')}
                                            >
                                                <Link2Off size={10} /> {t('contactDetail.unmerge', 'Unmerge')}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* AI Semantic Memory Bank replaces traditional Internal Notes */}
                        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dotted var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Brain size={14} className="text-primary" />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('contactDetail.semanticMemoryBank')}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {contact.aiProfile ? (
                                    <>
                                        <div className="glass-panel" style={{ padding: '10px 12px', borderRadius: 8, background: 'linear-gradient(145deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.02) 100%)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <Fingerprint size={12} className="text-secondary" />
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('contactDetail.persona')}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{contact.aiProfile.persona || t('contactDetail.noPersona', 'No persona mapped')}</div>
                                        </div>

                                        <div className="glass-panel" style={{ padding: '10px 12px', borderRadius: 8, background: 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <Zap size={12} className="text-danger" />
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('contactDetail.coreFrustration')}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{contact.aiProfile.coreFrustration || 'Unknown'}</div>
                                        </div>

                                        <div className="glass-panel" style={{ padding: '10px 12px', borderRadius: 8, background: 'linear-gradient(145deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <Target size={12} className="text-success" />
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('contactDetail.currentIntent')}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{contact.aiProfile.currentIntent || 'Unknown'}</div>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                                        {t('contactDetail.noSemanticMemory', 'No Semantic Memory initialized for this contact.')}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border-color)' }}>
                            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>{t('contactDetail.aiInsights')}</h4>

                            {contact.aiProfile?.nextBestAction && (
                                <div className="bg-surface glass-card" style={{ padding: 16, borderRadius: 12, marginBottom: 16, border: '1px solid rgba(99,102,241,0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--primary)' }}>
                                        <Sparkles size={14} className="pulse-animation" />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('contactDetail.nextBestAction')}</span>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                                        {contact.aiProfile.nextBestAction}
                                    </p>
                                    <Button size="sm" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 6 }}>
                                        {t('contactDetail.executeNow')} <ArrowRight size={14} />
                                    </Button>
                                </div>
                            )}

                            {contact.aiProfile?.sentimentTrend && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('contactDetail.sentimentTrend')}</span>
                                        <span style={{ fontSize: '0.75rem', color: contact.aiProfile.sentimentTrend === 'Deteriorating' ? 'var(--danger)' : contact.aiProfile.sentimentTrend === 'Improving' ? 'var(--success)' : 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {contact.aiProfile.sentimentTrend === 'Deteriorating' ? <TrendingDown size={12} /> : <Activity size={12} />} {contact.aiProfile.sentimentTrend}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, height: 24, alignItems: 'flex-end', opacity: 0.8 }}>
                                        {contact.aiProfile.sentimentTrend === 'Deteriorating' ? (
                                            <>
                                                <div style={{ flex: 1, background: 'var(--success)', height: '80%', borderRadius: 2 }} title="Positive"></div>
                                                <div style={{ flex: 1, background: 'var(--success)', height: '60%', borderRadius: 2 }} title="Positive"></div>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '40%', borderRadius: 2 }} title="Neutral"></div>
                                                <div style={{ flex: 1, background: 'var(--danger)', height: '70%', borderRadius: 2 }} title="Negative"></div>
                                                <div style={{ flex: 1, background: 'var(--danger)', height: '90%', borderRadius: 2 }} title="Very Negative (Latest)"></div>
                                            </>
                                        ) : contact.aiProfile.sentimentTrend === 'Improving' ? (
                                            <>
                                                <div style={{ flex: 1, background: 'var(--danger)', height: '40%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '50%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '60%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--success)', height: '80%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--success)', height: '100%', borderRadius: 2 }}></div>
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '50%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '60%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '45%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '55%', borderRadius: 2 }}></div>
                                                <div style={{ flex: 1, background: 'var(--warning)', height: '50%', borderRadius: 2 }}></div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {contact.aiProfile?.keyTopics && contact.aiProfile.keyTopics.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>{t('contactDetail.keyTopicsExtract')}</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {contact.aiProfile.keyTopics.map((topic: string, i: number) => (
                                            <span key={i} className="badge bg-surface" style={{ fontSize: '0.75rem' }}>{topic}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {contact.aiProfile && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.6 }}>
                                        <Bot size={10} />
                                        <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('contactDetail.insightsPoweredBy', 'Insights powered by {{model}}', { model: contact.aiProfile.generatedBy || 'LLM' })}</span>
                                    </div>
                                    {contact.aiProfile.lastGeneratedAt && (
                                        <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                                            {t('contactDetail.updatedAt')} {new Date(contact.aiProfile.lastGeneratedAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            )}

                            <Button variant="secondary" size="sm"
                                style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 6, opacity: generatingProfile ? 0.7 : 1 }}
                                onClick={handleGenerateProfile}
                                disabled={generatingProfile}
                            >
                                {generatingProfile ? <Activity size={14} className="spin-animation" /> : <Activity size={14} />} {generatingProfile ? 'Analyzing Timeline...' : 'Re-generate Summary'}
                            </Button>
                        </div>
                    </div>
                </div >

                {/* Right Area: Timeline (Scrollable) */}
                < div style={{ flex: 1, padding: '24px 48px', overflowY: 'auto', background: 'var(--background)', position: 'relative' }}>
                    <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {t('contactDetail.interactionTimeline')}
                    </h3>
                    {/* Filter Tabs */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                        {(['all', 'sip_call', 'omni_message', 'action_draft'] as const).map(filter => {
                            const labelMap = { all: 'contactDetail.filterAll', sip_call: 'contactDetail.filterVoice', omni_message: 'contactDetail.filterChat', action_draft: 'contactDetail.filterCopilot' };
                            const isActive = timelineFilter === filter;
                            return (
                                <Button key={filter} size="sm"
                                    style={{
                                        padding: '4px 14px', fontSize: '0.78rem', borderRadius: 20,
                                        background: isActive ? 'var(--primary)' : 'var(--surface)',
                                        color: isActive ? '#fff' : 'var(--text-secondary)',
                                        border: isActive ? 'none' : '1px solid var(--border-color)',
                                    }}
                                    onClick={() => { setTimelineFilter(filter); setDisplayLimit(20); }}
                                >
                                    {t(labelMap[filter])}
                                </Button>
                            );
                        })}
                    </div>

                    {/* C9 Testing Tools (Visible only in demo mode) */}
                    {
                        isDemo && (
                            <div style={{ position: 'absolute', top: 24, right: 48, zIndex: 100 }}>
                                <div className="glass-panel" style={{ width: 320, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                                    <div
                                        style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.1), rgba(168,85,247,0.05))', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid rgba(168,85,247,0.2)' }}
                                        onClick={() => setShowTestingCenter(!showTestingCenter)}
                                    >
                                        <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#e879f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Sparkles size={14} /> {t('contactDetail.testingTools')}
                                        </h4>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{showTestingCenter ? t('contactDetail.hide') : t('contactDetail.show')}</span>
                                    </div>

                                    {showTestingCenter && (
                                        <div style={{ padding: 16 }}>
                                            <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {t('contactDetail.injectDesc')}
                                            </p>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                <Button size="sm"
                                                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 8, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                                                    onClick={() => handleInjectScenario('angry_logistics')}
                                                    disabled={injecting || purging || contact.tags?.includes('demo_injected')}
                                                >
                                                    {injecting ? <span className="pulse-animation">{t('contactDetail.injecting')}</span> : (
                                                        <><Zap size={14} className="text-danger" /> {t('contactDetail.scenarioAngryVip')}</>
                                                    )}
                                                </Button>

                                                <Button size="sm"
                                                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 8, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                                                    onClick={() => handleInjectScenario('upgrade_inquiry')}
                                                    disabled={injecting || purging || contact.tags?.includes('demo_injected')}
                                                >
                                                    <Target size={14} className="text-success" /> {t('contactDetail.scenarioUpgradeRisk')}
                                                </Button>

                                                <div style={{ borderTop: '1px solid var(--border-color)', margin: '8px 0' }}></div>

                                                <Button variant="destructive" size="sm"
                                                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 8 }}
                                                    onClick={handleEraseMagic}
                                                    disabled={purging || !contact.tags?.includes('demo_injected')}
                                                >
                                                    {purging ? <span className="pulse-animation">{t('contactDetail.purging')}</span> : t('contactDetail.eraseMagic')}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }

                    <div style={{ position: 'relative' }}>
                        {/* Timeline Connector Line */}
                        {timeline.length > 0 && (
                            <div style={{ position: 'absolute', left: 24, top: 0, bottom: 0, width: 2, background: 'var(--border-color)', zIndex: 0 }}></div>
                        )}

                        {(() => {
                            const filteredTimeline = timelineFilter === 'all' ? timeline : timeline.filter(i => i.type === timelineFilter);
                            const visibleTimeline = filteredTimeline.slice(0, displayLimit);
                            const hasMore = filteredTimeline.length > displayLimit;

                            if (filteredTimeline.length === 0) return (
                                <div style={{
                                    padding: 48,
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    background: 'rgba(0,0,0,0.02)',
                                    borderRadius: 12,
                                    border: '1px dashed var(--border-color)',
                                    marginTop: 16
                                }}>
                                    <Clock size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                                    <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{t('contactDetail.noInteractionHistory')}</div>
                                    <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                                        {t('contactDetail.noInteractionHint')}
                                    </div>
                                </div>
                            );

                            return (<>
                                {visibleTimeline.map((item, idx) => (
                                    <div key={idx} style={{ position: 'relative', display: 'flex', gap: 24, marginBottom: 32, zIndex: 1 }}>
                                        {/* Timeline Node */}
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%', background: 'var(--surface)',
                                            border: '2px solid var(--border-color)', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', flexShrink: 0,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                        }}>
                                            {item.type === 'sip_call' && <Phone size={20} className="text-primary" />}
                                            {item.type === 'omni_message' && <MessageSquare size={20} className="text-secondary" />}
                                            {item.type === 'action_draft' && <AlertTriangle size={20} className="text-warning" />}
                                            {item.type === 'agent_action' && <MousePointerClick size={20} className="text-primary" />}
                                        </div>

                                        {/* Timeline Content Card */}
                                        <div className="glass-panel hover-card" style={{ flex: 1, padding: 16, cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                                <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                                    {new Date(item.timestamp).toLocaleString()}
                                                </span>
                                                {item.type === 'action_draft' && <span className="badge bg-warning text-dark" style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Bot size={12} />{t('contactDetail.systemDraft')}</span>}
                                                {item.type === 'sip_call' && <span className="badge bg-primary clickable" style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={() => {
                                                    setExpandedTranscript(prev => ({ ...prev, [idx]: !prev[idx] }));
                                                    if (!expandedTranscript[idx] && !transcriptCache[idx] && !transcriptLoading[idx] && item.data.callId) {
                                                        setTranscriptLoading(prev => ({ ...prev, [idx]: true }));
                                                        api.get(`/platform/calls/${item.data.callId}/transcriptions`)
                                                            .then(res => {
                                                                const data = res.data?.transcriptions || res.data?.data || [];
                                                                setTranscriptCache(prev => ({ ...prev, [idx]: Array.isArray(data) ? data : [] }));
                                                            })
                                                            .catch(() => setTranscriptCache(prev => ({ ...prev, [idx]: [] })))
                                                            .finally(() => setTranscriptLoading(prev => ({ ...prev, [idx]: false })));
                                                    }
                                                }}><User size={12} />{t('contactDetail.voiceRecording')}</span>}
                                                {item.type === 'omni_message' && <span className="badge bg-surface" style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Bot size={12} />{t('contactDetail.chatLog')}</span>}
                                                {item.type === 'agent_action' && <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: 'var(--primary)', display: 'flex', gap: 4, alignItems: 'center' }}><MousePointerClick size={12} />{t('contactDetail.copilotTelemetry', 'Copilot Telemetry')}</span>}
                                            </div>

                                            {/* Content switches based on type */}
                                            {item.type === 'action_draft' && (
                                                <div>
                                                    <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Sparkles size={16} className="text-warning" />
                                                        {t('contactDetail.suggestedAction')} {item.data.intentName}
                                                    </h4>
                                                    <pre style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, fontSize: '0.8rem', margin: 0, overflowX: 'auto' }}>
                                                        {JSON.stringify(item.data.draft, null, 2)}
                                                    </pre>
                                                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                                        <Button size="sm">{t('contactDetail.approveExecute')}</Button>
                                                        <Button variant="secondary" size="sm">{t('contactDetail.dismiss')}</Button>
                                                    </div>
                                                </div>
                                            )}

                                            {item.type === 'omni_message' && (
                                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                    <AvatarInitials name={item.data.sender === 'bot' ? 'AI Bot' : contact.displayName} size={32} />
                                                    <div style={{ background: item.data.sender === 'bot' ? 'var(--surface)' : 'rgba(99,102,241,0.1)', padding: '8px 16px', borderRadius: 12, fontSize: '0.9rem', flex: 1 }}>
                                                        {item.data.text}
                                                    </div>
                                                </div>
                                            )}

                                            {item.type === 'agent_action' && (
                                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                    <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', flex: 1, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--primary)', marginRight: 6 }}>{t('contactDetail.eventTriggered', '[Event Triggered]')}</span>
                                                        <span style={{ fontFamily: 'monospace' }}>{item.data.event_type}</span>
                                                        <div style={{ marginTop: 8, padding: '8px', background: 'var(--background)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                            {JSON.stringify(item.data.event_data, null, 2)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {item.type === 'sip_call' && (
                                                <div>
                                                    {/* Call metadata row */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                                                        {/* Direction icon */}
                                                        {item.data.call_type?.includes('inbound') ? (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: 'var(--success)' }}>
                                                                <PhoneIncoming size={14} /> {t('contactDetail.inbound', '呼入')}
                                                            </span>
                                                        ) : item.data.call_type?.includes('outbound') ? (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: 'var(--primary)' }}>
                                                                <PhoneOutgoing size={14} /> {t('contactDetail.outbound', '呼出')}
                                                            </span>
                                                        ) : null}
                                                        <span style={{ fontSize: '0.85rem' }}>
                                                            {t('contactDetail.durationAgent', { duration: item.data.duration })}
                                                            <span className="text-secondary" style={{ margin: '0 6px' }}>•</span>
                                                            {t('contactDetail.agent')} {item.data.agent_name || '—'}
                                                        </span>
                                                        {/* Status badge */}
                                                        {item.data.status === 'completed' && Number(item.data.duration) > 0 ? (
                                                            <span className="badge bg-success" style={{ fontSize: '0.7rem' }}>{t('contactDetail.callAnswered', '已接')}</span>
                                                        ) : item.data.status === 'completed' && Number(item.data.duration) === 0 ? (
                                                            <span className="badge bg-warning" style={{ fontSize: '0.7rem' }}>{t('contactDetail.callMissed', '未接')}</span>
                                                        ) : null}
                                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                                            <Button variant="secondary" size="sm"
                                                                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', padding: '4px 10px' }}
                                                                onClick={() => {
                                                                    setExpandedAudioNodes(prev => ({ ...prev, [idx]: !prev[idx] }));
                                                                    if (!expandedAudioNodes[idx] && item.data.callId) {
                                                                        // Demo: 直接用 timeline 内嵌的 insights 数据
                                                                        if (isDemo && item.data?.insights?.emotionSegments?.length > 0) {
                                                                            setEmotionCache(prev => ({ ...prev, [idx]: item.data.insights }));
                                                                        } else if (!emotionCache[idx] && !emotionLoading[idx]) {
                                                                            // Fetch Node Insights & SER Results
                                                                            setEmotionLoading(prev => ({ ...prev, [idx]: true }));
                                                                            Promise.allSettled([
                                                                                api.get(`/platform/calls/${item.data.callId}/insights`),
                                                                                api.get(`/speech-emotion/results/${item.data.callId}`)
                                                                            ]).then(([insRes, serRes]) => {
                                                                                const baseInsights = insRes.status === 'fulfilled' ? (insRes.value.data?.insights || insRes.value.data || {}) : {};
                                                                                const serSegments = serRes.status === 'fulfilled' ? (serRes.value.data?.segments || []) : [];
                                                                                setEmotionCache(prev => ({
                                                                                    ...prev,
                                                                                    [idx]: {
                                                                                        ...baseInsights,
                                                                                        emotionSegments: serSegments.length > 0 ? serSegments : (baseInsights.emotionSegments || [])
                                                                                    }
                                                                                }));
                                                                            }).finally(() => setEmotionLoading(prev => ({ ...prev, [idx]: false })));
                                                                        }
                                                                        // 按需加载结构化 summary
                                                                        if (!summaryCache[idx] && !isDemo) {
                                                                            api.get(`/platform/calls/${item.data.callId}/summary`)
                                                                                .then(res => {
                                                                                    if (res.data?.data) {
                                                                                        let entities: Record<string, string> = {};
                                                                                        try { if (typeof res.data.data.entities === 'string') entities = JSON.parse(res.data.data.entities); else entities = res.data.data.entities || {}; } catch { /* keep empty */ }
                                                                                        setSummaryCache(prev => ({ ...prev, [idx]: { ...res.data.data, entities } }));
                                                                                    }
                                                                                })
                                                                                .catch(() => { });
                                                                        }
                                                                        // Fetch SER Status
                                                                        if (!isDemo) {
                                                                            api.get(`/speech-emotion/status/${item.data.callId}`)
                                                                                .then(res => res.data?.data && setSerStatus(prev => ({ ...prev, [idx]: { status: res.data.data.status, error: res.data.data.error } })))
                                                                                .catch(() => { });
                                                                        }
                                                                    }
                                                                }}
                                                            >
                                                                <Search size={14} className={expandedAudioNodes[idx] ? 'text-primary' : 'text-secondary'} />
                                                                {expandedAudioNodes[idx] ? t('contactDetail.closeXRay') : t('contactDetail.audioXRay')}
                                                            </Button>
                                                            <Button variant="secondary" size="sm"
                                                                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', padding: '4px 10px' }}
                                                                onClick={() => setAnalysisCallId(item.data.callId)}
                                                                title={t('contactDetail.viewFullAnalysis', '完整分析')}
                                                            >
                                                                <BarChart3 size={14} className="text-primary" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* AI Summary preview (collapsed state) */}
                                                    {!expandedAudioNodes[idx] && item.data.ai_summary && (
                                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                                            <Sparkles size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--primary)' }} />
                                                            <span>
                                                                {item.data.ai_summary.intent || ''}
                                                                {item.data.ai_summary.outcome ? ` → ${item.data.ai_summary.outcome}` : ''}
                                                            </span>
                                                            {item.data.ai_summary.sentiment && (
                                                                <span className={`badge ${item.data.ai_summary.sentiment === 'positive' ? 'bg-success' : item.data.ai_summary.sentiment === 'negative' ? 'bg-danger' : 'bg-surface'}`}
                                                                    style={{ fontSize: '0.65rem', flexShrink: 0 }}
                                                                >{item.data.ai_summary.sentiment}</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* X-Ray expanded: energy timeline + insights */}
                                                    {expandedAudioNodes[idx] && (() => {
                                                        const ins = emotionCache[idx];
                                                        const EMOJI: Record<string, string> = {
                                                            positive: '😊', neutral: '😐', negative: '😤',
                                                            happy: '😊', sad: '😢', angry: '😡', frustrated: '😤',
                                                            fear: '😨', disgust: '🤢', surprise: '😲',
                                                        };
                                                        const hasInsights = ins && (ins.callerSentiment || ins.agentScore != null || ins.callerEnergyTimeline?.length > 0);
                                                        const callerEnergy: number[] = ins?.callerEnergyTimeline || [];
                                                        const calleeEnergy: number[] = ins?.calleeEnergyTimeline || [];
                                                        const emotionSegs = ins?.emotionSegments || [];
                                                        const durationSec = ins?.energyTimelineDurationSec || (item.data.duration ? Number(item.data.duration) : 0);

                                                        // Inline bar chart renderer for energy timeline
                                                        const renderEnergyTrack = (energy: number[], label: string, color: string) => {
                                                            if (energy.length === 0) return null;
                                                            const maxVal = Math.max(...energy, 1);
                                                            return (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '28px', marginBottom: '4px' }}>
                                                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', width: '42px', textAlign: 'right', flexShrink: 0 }}>{label}</span>
                                                                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%', gap: 0, background: 'rgba(0,0,0,0.06)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                                                                        {energy.map((val, i) => (
                                                                            <div key={i} style={{
                                                                                flex: 1,
                                                                                height: `${Math.max((val / maxVal) * 100, 2)}%`,
                                                                                background: color,
                                                                                opacity: Math.max(0.3, val / maxVal),
                                                                                transition: 'height 0.2s',
                                                                            }} />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        };

                                                        return (
                                                            <div className="bg-surface glass-card" style={{ padding: '16px 20px', borderRadius: 12, marginBottom: 12, border: '1px solid rgba(99,102,241,0.2)', animation: 'slideDown 0.3s ease-out' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 12 }}>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--primary)' }}>
                                                                        {t('contactDetail.audioXRay')}
                                                                    </div>
                                                                    {hasInsights && (
                                                                        <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 6px', background: emotionSegs.length > 0 ? 'rgba(168, 85, 247, 0.15)' : 'rgba(99, 102, 241, 0.1)', color: emotionSegs.length > 0 ? '#a855f7' : 'var(--text-secondary)' }}>
                                                                            {emotionSegs.length > 0 ? t('contactDetail.serDeepAnalysis', '✨ Python SER Deep Analysis') : t('contactDetail.nodeAudioEnergy', '⚡ Node Audio Energy')}
                                                                        </span>
                                                                    )}
                                                                    {(!emotionSegs.length && (serStatus[idx]?.status === 'pending' || serStatus[idx]?.status === 'processing')) && (
                                                                        <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                            <Loader2 size={10} className="animate-spin" /> SER {serStatus[idx].status === 'pending' ? t('contactDetail.queued', 'Queued') : t('contactDetail.processing', 'Processing')}...
                                                                        </span>
                                                                    )}
                                                                    {(!emotionSegs.length && serStatus[idx]?.status === 'failed') && (
                                                                        <span className="badge" title={serStatus[idx].error} style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                            {t('contactDetail.serFailed', '⚠️ SER Failed')}
                                                                            {serEnabled && (
                                                                                <span style={{ cursor: 'pointer', textDecoration: 'underline', marginLeft: 4 }} onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    api.post(`/speech-emotion/analyze/${item.data.callId}`)
                                                                                        .then(() => {
                                                                                            toast.success(t('callAnalysisPage.serQueued', '已重新加入分析队列'));
                                                                                            setSerStatus(prev => ({ ...prev, [idx]: { status: 'pending' } }));
                                                                                        })
                                                                                        .catch(() => toast.error('SER trigger failed'));
                                                                                }}>{t('common.retry', '重试')}</span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                    {(!emotionSegs.length && serStatus[idx]?.status === 'completed') && (
                                                                        <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 6px', background: serEnabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100,100,100,0.08)', color: serEnabled ? '#22c55e' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                            {serEnabled ? t('contactDetail.serCompletedNoData', '✅ SER 完成 (无情绪数据)') : t('contactDetail.serDisabled', '🔒 SER 未开启')}
                                                                            {serEnabled && (
                                                                                <span style={{ cursor: 'pointer', textDecoration: 'underline', marginLeft: 4 }} onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    api.post(`/speech-emotion/analyze/${item.data.callId}`)
                                                                                        .then(() => {
                                                                                            toast.success(t('callAnalysisPage.serQueued', '已重新加入分析队列'));
                                                                                            setSerStatus(prev => ({ ...prev, [idx]: { status: 'pending' } }));
                                                                                        })
                                                                                        .catch(() => toast.error('SER trigger failed'));
                                                                                }}>{t('contactDetail.reAnalyze', '重新分析')}</span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                    {(!emotionSegs.length && !serStatus[idx]?.status) && (
                                                                        serEnabled === false ? (
                                                                            <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(100,100,100,0.08)', color: 'var(--text-tertiary)' }}>
                                                                                🔒 SER {t('insightsPanel.serNotEnabled', '未开启')}
                                                                            </span>
                                                                        ) : (
                                                                            <Button size="sm" variant="outline" onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                api.post(`/speech-emotion/analyze/${item.data.callId}`)
                                                                                    .then(() => {
                                                                                        toast.success(t('callAnalysisPage.serQueued', '已加入深度情绪分析队列 (需时数十秒)'));
                                                                                        setSerStatus(prev => ({ ...prev, [idx]: { status: 'pending' } }));
                                                                                    })
                                                                                    .catch(() => toast.error('SER trigger failed'));
                                                                            }} style={{ padding: '2px 8px', fontSize: '0.65rem', height: '22px' }}>
                                                                                <Sparkles size={12} style={{ marginRight: 4 }} /> {t('insightsPanel.triggerDeepAnalysis', '请求深度分析')}
                                                                            </Button>
                                                                        )
                                                                    )}
                                                                </div>
                                                                {/* Structured Summary Section */}
                                                                {summaryCache[idx] && (
                                                                    <div style={{ marginBottom: 12, padding: '10px 12px', background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(16,185,129,0.04) 100%)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)' }}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.78rem' }}>
                                                                            {summaryCache[idx].intent && (
                                                                                <div style={{ padding: '0.35rem', background: 'rgba(0,0,0,0.1)', borderRadius: '5px' }}>
                                                                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '1px' }}>{t('callDetailsPage.intent', 'Intent')}</div>
                                                                                    <div style={{ lineHeight: 1.3 }}>{summaryCache[idx].intent}</div>
                                                                                </div>
                                                                            )}
                                                                            {summaryCache[idx].outcome && (
                                                                                <div style={{ padding: '0.35rem', background: 'rgba(0,0,0,0.1)', borderRadius: '5px' }}>
                                                                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '1px' }}>{t('callDetailsPage.outcome', 'Outcome')}</div>
                                                                                    <div style={{ lineHeight: 1.3 }}>{summaryCache[idx].outcome}</div>
                                                                                </div>
                                                                            )}
                                                                            {summaryCache[idx].nextAction && summaryCache[idx].nextAction.toLowerCase() !== 'none' && (
                                                                                <div style={{ padding: '0.35rem', background: 'rgba(0,0,0,0.1)', borderRadius: '5px' }}>
                                                                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '1px' }}>{t('callDetailsPage.nextAction', 'Next Action')}</div>
                                                                                    <div style={{ lineHeight: 1.3 }}>{summaryCache[idx].nextAction}</div>
                                                                                </div>
                                                                            )}
                                                                            {summaryCache[idx].sentiment && (
                                                                                <div style={{ padding: '0.35rem', background: 'rgba(0,0,0,0.1)', borderRadius: '5px' }}>
                                                                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '1px' }}>{t('callDetailsPage.sentiment', 'Sentiment')}</div>
                                                                                    <div style={{ lineHeight: 1.3 }}>{summaryCache[idx].sentiment}</div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {summaryCache[idx].entities && Object.keys(summaryCache[idx].entities).length > 0 && (
                                                                            <div style={{ marginTop: '0.35rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.1rem 0.5rem', fontSize: '0.72rem', background: 'rgba(0,0,0,0.06)', padding: '0.35rem', borderRadius: '5px' }}>
                                                                                {Object.entries(summaryCache[idx].entities).map(([key, value]) => (
                                                                                    <React.Fragment key={key}>
                                                                                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.65rem' }}>{key.replace(/_/g, ' ')}</span>
                                                                                        <span style={{ fontWeight: 500 }}>{String(value)}</span>
                                                                                    </React.Fragment>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {emotionLoading[idx] ? (
                                                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
                                                                        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary)' }} />
                                                                    </div>
                                                                ) : !hasInsights ? (
                                                                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                                        <div style={{ marginBottom: '12px' }}>{t('contactDetail.noEmotionData', '暂无情绪分析数据')}</div>
                                                                        <Button size="sm" onClick={() => {
                                                                            setEmotionLoading(prev => ({ ...prev, [idx]: true }));
                                                                            // 1. Trigger fast Node insights
                                                                            api.post(`/platform/calls/${item.data.callId}/insights`)
                                                                                .then(res => setEmotionCache(prev => ({ ...prev, [idx]: res.data?.insights || res.data || {} })))
                                                                                .catch(() => toast.error('Failed to generate insights'))
                                                                                .finally(() => setEmotionLoading(prev => ({ ...prev, [idx]: false })));

                                                                            // 2. Queue deep Python SER analysis
                                                                            api.post(`/speech-emotion/analyze/${item.data.callId}`)
                                                                                .then(() => {
                                                                                    toast.success(t('callAnalysisPage.serQueued', '已加入深度情绪分析队列 (需时数十秒)'));
                                                                                    setSerStatus(prev => ({ ...prev, [idx]: { status: 'pending' } }));
                                                                                })
                                                                                .catch(() => console.warn('SER trigger failed'));
                                                                        }}>
                                                                            <Sparkles size={14} style={{ marginRight: 6 }} /> {t('insightsPanel.triggerAnalysis', '生成洞察分析')}
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <div>
                                                                        {/* Dual-channel energy bar chart */}
                                                                        {(callerEnergy.length > 0 || calleeEnergy.length > 0) && (
                                                                            <div style={{ marginBottom: 8 }}>
                                                                                {renderEnergyTrack(callerEnergy, 'Caller', '#6366f1')}
                                                                                {renderEnergyTrack(calleeEnergy, 'Callee', '#22c55e')}
                                                                                {durationSec > 0 && (
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'var(--text-muted)', paddingLeft: '50px' }}>
                                                                                        <span>0s</span>
                                                                                        <span>{Math.round(durationSec / 2)}s</span>
                                                                                        <span>{Math.round(durationSec)}s</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        {/* Acoustic emotion overlay (if SER data exists) */}
                                                                        {emotionSegs.length > 0 && durationSec > 0 && (
                                                                            <AcousticEmotionTrack segments={emotionSegs} durationSec={durationSec} />
                                                                        )}
                                                                        {/* Compact insights row */}
                                                                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: '0.78rem' }}>
                                                                            {ins.agentScore != null && (
                                                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                                                    {t('insightsPanel.agentScore', '坐席评分')}:{' '}
                                                                                    <strong style={{ color: ins.agentScore >= 80 ? 'var(--success)' : ins.agentScore >= 60 ? 'var(--warning)' : 'var(--danger)' }}>
                                                                                        {ins.agentScore}/100
                                                                                    </strong>
                                                                                </span>
                                                                            )}
                                                                            {ins.callerSentiment && (
                                                                                <span>{t('contactDetail.callerSentimentLabel', '主叫')} {EMOJI[ins.callerSentiment] || ''} {ins.callerSentiment}</span>
                                                                            )}
                                                                            {ins.calleeSentiment && (
                                                                                <span>{t('contactDetail.calleeSentimentLabel', '被叫')} {EMOJI[ins.calleeSentiment] || ''} {ins.calleeSentiment}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Inline transcript panel */}
                                                    {expandedTranscript[idx] && (
                                                        <div className="bg-surface glass-card" style={{ padding: '16px 20px', borderRadius: 12, marginBottom: 12, border: '1px solid rgba(99,102,241,0.15)', animation: 'slideDown 0.3s ease-out', maxHeight: 300, overflowY: 'auto' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--primary)', marginBottom: 12 }}>
                                                                {t('contactDetail.transcriptTitle', '转写记录')}
                                                            </div>
                                                            {transcriptLoading[idx] ? (
                                                                <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
                                                                    <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary)' }} />
                                                                </div>
                                                            ) : !transcriptCache[idx]?.length ? (
                                                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                                    {t('contactDetail.noTranscript', '暂无转写记录')}
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                    {transcriptCache[idx].map((seg: any, si: number) => {
                                                                        const isCaller = seg.speaker === 'caller' || seg.speaker === 'alice' || seg.speaker === item.data.caller;
                                                                        return (
                                                                            <div key={si} style={{ display: 'flex', flexDirection: isCaller ? 'row' : 'row-reverse', gap: 8 }}>
                                                                                <div style={{
                                                                                    maxWidth: '75%',
                                                                                    padding: '8px 12px',
                                                                                    borderRadius: isCaller ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
                                                                                    background: isCaller ? 'rgba(99,102,241,0.08)' : 'rgba(34,197,94,0.08)',
                                                                                    fontSize: '0.82rem',
                                                                                    lineHeight: 1.5,
                                                                                }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                                                                                        {seg.speaker || '—'}{' '}
                                                                                        {seg.timestamp && <span>{new Date(seg.timestamp).toLocaleTimeString()}</span>}
                                                                                    </div>
                                                                                    {seg.text}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* AI Summary (expanded — full version) */}
                                                    {expandedAudioNodes[idx] && item.data.ai_summary && (
                                                        <div className="bg-surface" style={{ padding: 16, borderRadius: 8 }}>
                                                            <h5 style={{ margin: '0 0 8px 0', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <Sparkles size={14} /> {t('contactDetail.aiSessionSummary')}
                                                            </h5>
                                                            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                                                                {item.data.ai_summary.raw_summary}
                                                            </p>
                                                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                                                {item.data.ai_summary.topics?.map((topic: string) => (
                                                                    <span key={topic} className="badge bg-surface" style={{ fontSize: '0.75rem' }}>#{topic}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {/* Load More */}
                                {hasMore && (
                                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                                        <Button variant="secondary" size="sm" onClick={() => setDisplayLimit(prev => prev + 20)}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
                                        >
                                            <ChevronDown size={14} /> {t('contactDetail.loadMore')}
                                        </Button>
                                    </div>
                                )}
                            </>);
                        })()}
                    </div>
                </div >
            </div >

            {/* Call Analysis Modal */}
            <GlassModal
                open={!!analysisCallId}
                onOpenChange={(open) => { if (!open) setAnalysisCallId(null); }}
                title={t('contactDetail.viewFullAnalysis', '完整分析')}
                className="max-w-[900px] w-full"
            >
                {analysisCallId && (
                    <CallAnalysisModal callId={analysisCallId} demo={isDemo} />
                )}
            </GlassModal>
            <ConfirmModal
                open={unmergeConfirm.isOpen}
                title="Unmerge Profile"
                description={`Are you sure you want to unmerge profile ID ${unmergeConfirm.sourceId} from this contact? This will recreate a separate contact record.`}
                onConfirm={() => unmergeConfirm.sourceId && handleUnmerge(unmergeConfirm.sourceId)}
                onClose={() => setUnmergeConfirm({ isOpen: false, sourceId: null })}
            />
        </div >
    );
};

export default ContactDetail;
