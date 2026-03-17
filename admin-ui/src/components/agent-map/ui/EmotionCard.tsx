import React, { useMemo } from 'react';
import { Brain, Smile, Meh, Frown, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardRealtime } from '../../../dashboard/DashboardContext';

/**
 * EMOTION_CONFIG — visual properties for each emotion label.
 * label 字段改为 i18n key，在渲染时通过 t() 翻译
 */
const EMOTION_CONFIG: Record<string, { icon: React.ReactNode; color: string; labelKey: string }> = {
    happy: { icon: <Smile size={14} />, color: '#22c55e', labelKey: 'happy' },
    neutral: { icon: <Meh size={14} />, color: '#94a3b8', labelKey: 'neutral' },
    sad: { icon: <Frown size={14} />, color: '#3b82f6', labelKey: 'sad' },
    angry: { icon: <AlertTriangle size={14} />, color: '#ef4444', labelKey: 'angry' },
    fearful: { icon: <Frown size={14} />, color: '#a855f7', labelKey: 'fearful' },
    disgusted: { icon: <Frown size={14} />, color: '#10b981', labelKey: 'disgusted' },
    surprised: { icon: <Smile size={14} />, color: '#ec4899', labelKey: 'surprised' },
};

const DEFAULT_CONFIG = { icon: <Meh size={14} />, color: '#94a3b8', labelKey: 'unknown' };

// Emotion label fallback — 用于 t() 的默认值
const EMOTION_DEFAULTS: Record<string, string> = {
    happy: 'Happy', neutral: 'Neutral', sad: 'Sad', angry: 'Angry',
    fearful: 'Fearful', disgusted: 'Disgusted', surprised: 'Surprised', unknown: 'Unknown',
};

/**
 * EmotionCard — Agent Map 侧边栏 SER 实时情绪卡片
 *
 * 数据来源: DashboardContext.emotionMap (call:emotion WS 事件)
 */
const EmotionCard: React.FC<{ isSimulating?: boolean }> = ({ isSimulating: _isSimulating }) => {
    const { t } = useTranslation();
    const { emotionMap } = useDashboardRealtime();

    const metrics = useMemo(() => {
        const entries = Array.from(emotionMap.values());
        if (entries.length === 0) {
            return { dominant: 'neutral', avgValence: 0.5, count: 0, distribution: {} as Record<string, number> };
        }

        // Count emotion distribution
        const dist: Record<string, number> = {};
        let totalValence = 0;

        for (const e of entries) {
            dist[e.emotion] = (dist[e.emotion] || 0) + 1;
            totalValence += e.valence;
        }

        // Find dominant emotion
        const dominant = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
        const avgValence = totalValence / entries.length;

        return { dominant, avgValence, count: entries.length, distribution: dist };
    }, [emotionMap]);

    const dominantConfig = EMOTION_CONFIG[metrics.dominant] || DEFAULT_CONFIG;

    // Valence color: red (0) → yellow (0.5) → green (1.0)
    const valenceColor = metrics.avgValence > 0.6 ? '#22c55e'
        : metrics.avgValence > 0.4 ? '#f59e0b'
            : '#ef4444';

    return (
        <div className="slot-card" style={{ padding: 0 }}>
            <div className="slot-card-header">
                <Brain size={14} />
                <span>{t('agentMap.cards.emotionSer', 'EMOTION SER')}</span>
                {metrics.count > 0 && (
                    <span className="slot-card-badge" style={{
                        background: dominantConfig.color + '33',
                        color: dominantConfig.color,
                    }}>
                        {metrics.count}
                    </span>
                )}
            </div>
            <div style={{ padding: '8px 12px' }}>
                {metrics.count === 0 ? (
                    <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '12px 0' }}>
                        {t('agentMap.cards.noSerData', 'No active SER data')}
                    </div>
                ) : (
                    <>
                        {/* Dominant emotion */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '6px 8px', borderRadius: 6,
                            background: dominantConfig.color + '15',
                            marginBottom: 8,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: dominantConfig.color }}>{dominantConfig.icon}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                                    {t(`agentMap.cards.emotions.${dominantConfig.labelKey}`, EMOTION_DEFAULTS[dominantConfig.labelKey])}
                                </span>
                            </div>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{t('agentMap.cards.dominant', 'Dominant')}</span>
                        </div>

                        {/* Valence bar */}
                        <div style={{ marginBottom: 8 }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontSize: 10, color: '#64748b', marginBottom: 4,
                            }}>
                                <span>{t('agentMap.cards.avgValence', 'Avg Valence')}</span>
                                <span style={{ color: valenceColor, fontWeight: 600 }}>
                                    {(metrics.avgValence * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div style={{
                                height: 6, borderRadius: 3,
                                background: 'rgba(255,255,255,0.06)',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${metrics.avgValence * 100}%`,
                                    background: `linear-gradient(90deg, #ef4444, #f59e0b, #22c55e)`,
                                    borderRadius: 3,
                                    transition: 'width 0.5s ease',
                                }} />
                            </div>
                        </div>

                        {/* Emotion distribution */}
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 4,
                        }}>
                            {Object.entries(metrics.distribution)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 4)
                                .map(([emotion, count]) => {
                                    const cfg = EMOTION_CONFIG[emotion] || DEFAULT_CONFIG;
                                    return (
                                        <span key={emotion} style={{
                                            fontSize: 10, padding: '2px 6px',
                                            borderRadius: 4,
                                            background: cfg.color + '20',
                                            color: cfg.color,
                                            display: 'flex', alignItems: 'center', gap: 3,
                                        }}>
                                            {cfg.icon} {count}
                                        </span>
                                    );
                                })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default EmotionCard;
