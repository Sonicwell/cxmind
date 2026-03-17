
import React, { useEffect, useState } from 'react';
import { Sparkles, Plus, ThumbsUp, ThumbsDown, Check, Loader2 } from 'lucide-react';
import { MotionButton } from '../ui/MotionButton';
import { getMockActionDiscoveries, type MockActionDiscovery } from '../../services/mock-data';
import { useDemoMode } from '../../hooks/useDemoMode';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface ActionDiscoveryPanelProps {
    onCreateCustom?: () => void;
}

const ActionDiscoveryPanel: React.FC<ActionDiscoveryPanelProps> = ({ onCreateCustom }) => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [recommendations, setRecommendations] = useState<MockActionDiscovery[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadDiscoveries = async () => {
            setLoading(true);
            try {
                if (demoMode) {
                    const res = await getMockActionDiscoveries();
                    setRecommendations(res.data.data);
                } else {
                    // Discovery is AI-generated; no backend endpoint yet.
                    // Show empty state in non-demo mode.
                    setRecommendations([]);
                }
            } catch (error) {
                console.error('Failed to load discoveries', error);
            } finally {
                setLoading(false);
            }
        };
        loadDiscoveries();
    }, [demoMode]);

    const handleApprove = (rec: MockActionDiscovery) => {
        setRecommendations(prev => prev.filter(r => r.id !== rec.id));
        toast.success(`"${rec.name}" approved and added to Configuration.`);
    };

    const handleDismiss = (rec: MockActionDiscovery) => {
        setRecommendations(prev => prev.filter(r => r.id !== rec.id));
        toast(`"${rec.name}" dismissed.`, { icon: '🗑️' });
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
    );

    return (
        <div>
            {/* Info Banner */}
            <div className="glass-card" style={{
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                borderLeft: '3px solid var(--primary)',
            }}>
                <Sparkles size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>{t('actions.discoveryTitle')}</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {t('actions.discoveryDesc')}
                    </p>
                </div>
            </div>

            {/* Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {recommendations.map((rec) => (
                    <div key={rec.id} className="glass-card floating-particles" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                                background: 'hsla(var(--primary-hue), var(--primary-sat), 65%, 0.12)',
                                color: 'var(--primary)',
                                padding: '0.2rem 0.55rem',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                            }}>
                                {Math.round(rec.confidence * 100)}% {t('actions.confidence')}
                            </span>
                            <span style={{
                                background: 'rgba(0,0,0,0.04)',
                                color: 'var(--text-muted)',
                                padding: '0.2rem 0.55rem',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.75rem',
                            }}>
                                {rec.occurrences} {t('actions.matches')}
                            </span>
                        </div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{rec.name}</h3>
                        <span style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            textTransform: 'capitalize',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-secondary)',
                            alignSelf: 'flex-start',
                        }}>
                            {rec.category}
                        </span>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.45 }}>
                            "{rec.reason}"
                        </p>
                        {rec.samplePhrases && rec.samplePhrases.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {rec.samplePhrases.slice(0, 3).map(p => (
                                    <span key={p} style={{
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.7rem',
                                        background: 'hsla(var(--primary-hue), 60%, 60%, 0.06)',
                                        color: 'var(--text-muted)',
                                        border: '1px solid var(--glass-border)',
                                        fontFamily: 'monospace',
                                    }}>
                                        "{p}"
                                    </span>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <MotionButton  style={{ flex: 1, gap: '0.4rem' }} onClick={() => handleApprove(rec)}>
                                <ThumbsUp size={14} /> {t('actions.approve')}
                            </MotionButton>
                            <MotionButton variant="secondary"  style={{ flex: 1, gap: '0.4rem' }} onClick={() => handleDismiss(rec)}>
                                <ThumbsDown size={14} /> {t('actions.dismiss')}
                            </MotionButton>
                        </div>
                    </div>
                ))}

                {recommendations.length === 0 && !loading && (
                    <div className="glass-card" style={{
                        padding: '2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '200px',
                        textAlign: 'center',
                        gridColumn: '1 / -1',
                    }}>
                        <Check size={32} style={{ color: 'var(--success)', marginBottom: '0.75rem' }} />
                        <h3 style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-secondary)' }}>
                            {demoMode ? t('actions.allCaughtUp') : t('actions.noDiscoveries')}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                            {demoMode
                                ? t('actions.noPendingSuggestions')
                                : t('actions.waitingForData')}
                        </p>
                    </div>
                )}

                {/* Create Custom Card */}
                <div
                    className="glass-card"
                    onClick={onCreateCustom}
                    style={{
                        padding: '2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '250px',
                        cursor: 'pointer',
                        borderStyle: 'dashed',
                        textAlign: 'center',
                    }}
                >
                    <div style={{
                        borderRadius: '50%',
                        background: 'hsla(var(--primary-hue), 60%, 60%, 0.08)',
                        padding: '1rem',
                        marginBottom: '1rem',
                    }}>
                        <Plus size={28} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <h3 style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-secondary)' }}>{t('actions.defineCustom')}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', maxWidth: '200px' }}>
                        {t('actions.defineCustomDesc')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ActionDiscoveryPanel;
