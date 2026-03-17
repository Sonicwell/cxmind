import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
    LineChart, Line
} from 'recharts';
import { Activity, BarChart3, TrendingUp, Mic, HeartPulse } from 'lucide-react';
import type { BehaviorDashboardData } from '../../types/analytics';
import { CHART_TOOLTIP_STYLE, PIE_COLORS, EMOTION_COLORS } from '../../utils/chart-constants';
import ChartPanel from '../ui/ChartPanel';
import SectionHeader from '../ui/SectionHeader';
import '../../styles/shared-dashboard.css';

interface BehaviorSectionProps {
    loading: boolean;
    data: BehaviorDashboardData | null;
}

export const BehaviorSection: React.FC<BehaviorSectionProps> = ({ loading, data }) => {
    const { t } = useTranslation();

    if (loading) {
        return (
            <div className="analytics-loading" style={{ height: 400 }}>
                {t('analytics.behavior.loading')}
            </div>
        );
    }

    if (!data) return null;

    // Prepare Talk Ratio Data for Pie
    const talkData = [
        { name: t('analytics.behavior.agentTalk'), value: data.distribution.agent_talk, color: '#3b82f6' },
        { name: t('analytics.behavior.customerTalk'), value: data.distribution.cust_talk, color: '#10b981' },
        { name: t('analytics.behavior.silence'), value: data.distribution.silence, color: '#94a3b8' },
    ].filter(d => d.value > 0);

    return (
        <div style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(6,182,212,0.04))',
            borderRadius: 'var(--radius-md)', border: '1px solid rgba(16,185,129,0.15)',
            marginBottom: '1.5rem',
        }}>
            <SectionHeader
                title={t('analytics.behavior.title')}
                icon={<Activity size={18} style={{ color: '#10b981' }} />}
            />

            {/* Row 1: Talk Patterns & Stress */}
            <div className="charts-grid-2col" style={{ marginBottom: '1.5rem' }}>
                {/* Talk Ratio Pie */}
                <ChartPanel
                    title={t('analytics.behavior.talkRatioAnalysis')}
                    icon={<Mic size={16} />}
                    infoKey="talkRatio"
                >
                    {talkData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie data={talkData} dataKey="value" nameKey="name"
                                    cx="50%" cy="50%" outerRadius={100} innerRadius={60}
                                    paddingAngle={2} strokeWidth={0}
                                    label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {talkData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="analytics-loading">{t('analytics.behavior.noTalkData')}</div>}
                </ChartPanel>

                <ChartPanel
                    title={t('analytics.behavior.stressScoreTrend')}
                    icon={<HeartPulse size={16} />}
                    infoKey="stressScore"
                >
                    {data.trend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={data.trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} domain={[0, 'auto']} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                                <Line type="monotone" dataKey="avg_stress" name={t('analytics.behavior.avgStress')} stroke="#ef4444" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="avg_talk_ratio" name={t('analytics.behavior.talkRatio')} stroke="#3b82f6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : <div className="analytics-loading">{t('analytics.behavior.noTrendData')}</div>}
                </ChartPanel>
            </div>

            {/* Row 2: Acoustic Sentiment (Existing) */}
            <div className="charts-grid-2col">
                {/* Emotion Distribution */}
                <ChartPanel
                    title={t('analytics.behavior.acousticEmotionDistribution')}
                    icon={<BarChart3 size={16} />}
                    infoKey="emotionDistribution"
                >
                    {data.emotion_dist.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie data={data.emotion_dist} dataKey="count" nameKey="emotion"
                                    cx="50%" cy="50%" outerRadius={100} innerRadius={60}
                                    paddingAngle={2} strokeWidth={0}
                                    label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {data.emotion_dist.map((entry, idx) => (
                                        <Cell key={idx} fill={EMOTION_COLORS[entry.emotion] || PIE_COLORS[idx % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="analytics-loading">{t('analytics.behavior.noAcousticData')}</div>}
                </ChartPanel>

                <ChartPanel
                    title={t('analytics.behavior.acousticEmotionTrend')}
                    icon={<TrendingUp size={16} />}
                    infoKey="emotionTrend"
                >
                    {data.emotion_trend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={data.emotion_trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                                {['happy', 'neutral', 'sad', 'angry', 'frustrated'].map(emotion => (
                                    <Area
                                        key={emotion}
                                        type="monotone"
                                        dataKey={emotion}
                                        stackId="1"
                                        stroke={EMOTION_COLORS[emotion] || '#cbd5e1'}
                                        fill={EMOTION_COLORS[emotion] || '#cbd5e1'}
                                        fillOpacity={0.6}
                                        strokeWidth={1}
                                        name={emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                                    />
                                ))}
                                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <div className="analytics-loading">{t('analytics.behavior.noTrendData')}</div>}
                </ChartPanel>
            </div>
        </div>
    );
};
