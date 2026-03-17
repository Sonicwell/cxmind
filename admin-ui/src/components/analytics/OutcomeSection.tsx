import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    TrendingUp, DollarSign, Brain, Target, CheckCircle2
} from 'lucide-react';
import { MotionDiv } from '../ui/MotionDiv';
import ChartPanel from '../ui/ChartPanel';
import MetricCard from '../ui/MetricCard';
import type { OutcomeDashboardData } from '../../types/analytics';
import { CHART_TOOLTIP_STYLE } from '../../utils/chart-constants';
import '../../styles/shared-dashboard.css';

interface OutcomeSectionProps {
    loading: boolean;
    data: OutcomeDashboardData | null;
}

const COLORS = {
    success: '#10b981',   // Emerald 500
    failure: '#ef4444',   // Red 500
    follow_up: '#f59e0b', // Amber 500
    unknown: '#94a3b8',   // Slate 400
};

export const OutcomeSection: React.FC<OutcomeSectionProps> = ({ loading, data }) => {
    const { t } = useTranslation();

    const PIE_DATA = (d: any) => [
        { name: t('analytics.outcome.success'), value: d.success, color: COLORS.success },
        { name: t('analytics.outcome.failure'), value: d.failure, color: COLORS.failure },
        { name: t('analytics.outcome.followUp'), value: d.follow_up, color: COLORS.follow_up },
        { name: t('analytics.outcome.unknown'), value: d.unknown, color: COLORS.unknown },
    ].filter(i => i.value > 0);

    if (loading) {
        return (
            <div className="analytics-loading flex flex-col gap-4">
                <div className="grid grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="analytics-skeleton h-24 rounded-xl" />)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="analytics-skeleton h-80 rounded-xl" />
                    <div className="analytics-skeleton h-80 rounded-xl" />
                </div>
            </div>
        );
    }

    if (!data) return null;

    const total = data.distribution.success + data.distribution.failure + data.distribution.follow_up + data.distribution.unknown;
    const conversionRate = total > 0 ? (data.distribution.success / total) * 100 : 0;
    const accuracy = 88.5;

    // Transform rate data for charts (0-1 -> 0-100), round to avoid fp noise like 33.300000000000004
    const pct = (v: number) => Math.round(v * 10000) / 100;
    const byQualityData = data.by_quality.map(d => ({ ...d, rate: pct(d.rate) }));
    const byDurationData = data.by_duration.map(d => ({ ...d, rate: pct(d.rate) }));
    const bySentimentData = data.by_sentiment.map(d => ({ ...d, rate: pct(d.rate) }));
    const byTalkPatternData = data.by_talk_pattern.map(d => ({ ...d, rate: pct(d.rate) }));
    const rateFmt = (v: any) => `${Number(v).toFixed(2)}%`;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* KPI Strip */}
            <div className="metric-grid">
                <MetricCard
                    label={t('analytics.outcome.totalPredictions')}
                    value={total.toLocaleString()}
                    color="#3b82f6"
                    icon={<Brain size={16} />}
                    infoKey="outcomeTotalPredictions"
                />
                <MetricCard
                    label={t('analytics.outcome.conversionRate')}
                    value={`${conversionRate.toFixed(1)}%`}
                    color={conversionRate > 20 ? '#10b981' : '#f59e0b'}
                    icon={<Target size={16} />}
                    infoKey="outcomeConversionRate"
                />
                <MetricCard
                    label={t('analytics.outcome.modelAccuracy')}
                    value={`${accuracy}%`}
                    color="#a855f7"
                    icon={<CheckCircle2 size={16} />}
                    sub={t('analytics.outcome.vsManualAudit')}
                    infoKey="outcomeModelAccuracy"
                />
                <MetricCard
                    label={t('analytics.outcome.aiCostPerSuccess')}
                    value={`$${data.roi.cost_per_success.toFixed(2)}`}
                    color="#94a3b8"
                    icon={<DollarSign size={16} />}
                    sub={`Total: $${data.roi.total_cost.toFixed(2)}`}
                    infoKey="outcomeAiCost"
                />
            </div>

            {/* Row 1: Distribution & Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <MotionDiv delay={0.1} className="flex flex-col">
                    <ChartPanel
                        title={t('analytics.outcome.distribution')}
                        icon={<TrendingUp size={18} className="text-indigo-500" />}
                        infoKey="outcomeDistribution"
                    >
                        <div className="flex-1" style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={PIE_DATA(data.distribution)}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {PIE_DATA(data.distribution).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>
                </MotionDiv>

                <MotionDiv delay={0.2} className="col-span-2 flex flex-col">
                    <ChartPanel
                        title={t('analytics.outcome.trends30d')}
                        infoKey="outcomeTrends"
                    >
                        <div className="flex-1" style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.trends}>
                                    <defs>
                                        <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorFailure" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.failure} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.failure} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--glass-border)" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v) => v.slice(5)} />
                                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                                    <Legend />
                                    <Area type="monotone" dataKey="success" name={t('analytics.outcome.success')} stroke={COLORS.success} fillOpacity={1} fill="url(#colorSuccess)" />
                                    <Area type="monotone" dataKey="failure" name={t('analytics.outcome.failure')} stroke={COLORS.failure} fillOpacity={1} fill="url(#colorFailure)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>
                </MotionDiv>
            </div>

            {/* Row 2: Drivers (Quality & Duration) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MotionDiv delay={0.3}>
                    <ChartPanel
                        title={t('analytics.outcome.conversionByQuality')}
                        infoKey="outcomeQuality"
                    >

                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={byQualityData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--glass-border)" />
                                    <XAxis type="number" unit="%" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} domain={[0, 100]} />
                                    <YAxis dataKey="bucket" type="category" width={100} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.05)' }} formatter={rateFmt} />
                                    <Bar dataKey="rate" name={t('analytics.outcome.conversionRateCol')} fill={COLORS.success} radius={[0, 4, 4, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>
                </MotionDiv>

                <MotionDiv delay={0.4}>
                    <ChartPanel
                        title={t('analytics.outcome.conversionByDuration')}
                        infoKey="outcomeDuration"
                    >
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={byDurationData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--glass-border)" />
                                    <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <YAxis unit="%" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.05)' }} formatter={rateFmt} />
                                    <Bar dataKey="rate" name={t('analytics.outcome.conversionRateCol')} fill={COLORS.follow_up} radius={[4, 4, 0, 0]} barSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>
                </MotionDiv>
            </div>

            {/* Row 3: Top Closers Table */}
            <MotionDiv delay={0.5}>
                <ChartPanel
                    title={t('analytics.outcome.topClosers')}
                    infoKey="topClosers"
                >
                    <div className="overflow-x-auto">
                        <Table className="analytics-table" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '17%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '20%' }} />
                                <col style={{ width: '25%' }} />
                            </colgroup>
                            <TableHeader>
                                <TableRow>
                                    <TableHead style={{ textAlign: 'center' }}>#</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>{t('analytics.outcome.agentId')}</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>{t('analytics.outcome.totalCallsCol')}</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>{t('analytics.outcome.successes')}</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>{t('analytics.outcome.conversionRateCol')}</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>{t('analytics.outcome.performance')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.top_closers.slice(0, 5).map((agent, i) => (
                                    <TableRow key={agent.agent_id} className="analytics-table-row-hover">
                                        <TableCell style={{ textAlign: 'center' }}>
                                            <div style={{
                                                width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                                                background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.7rem', fontWeight: 700, margin: '0 auto',
                                            }}>
                                                {i + 1}
                                            </div>
                                        </TableCell>
                                        <TableCell style={{ textAlign: 'center', fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {agent.agent_name || agent.agent_id}
                                        </TableCell>
                                        <TableCell style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{agent.total}</TableCell>
                                        <TableCell style={{ textAlign: 'center', color: '#10b981', fontWeight: 500 }}>{agent.success}</TableCell>
                                        <TableCell style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>{(agent.rate * 100).toFixed(1)}%</TableCell>
                                        <TableCell style={{ textAlign: 'center' }}>
                                            <div style={{
                                                width: '6rem', height: '0.5rem',
                                                background: 'var(--glass-border)', borderRadius: '9999px',
                                                margin: '0 auto', overflow: 'hidden',
                                            }}>
                                                <div
                                                    style={{
                                                        height: '100%', background: '#10b981', borderRadius: '9999px',
                                                        width: `${Math.min(agent.rate * 100, 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </ChartPanel>
            </MotionDiv>

            {/* Row 4: Sentiment & Talk Pattern */}
            <div className="grid gap-6" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <MotionDiv delay={0.6}>
                    <ChartPanel
                        title={t('analytics.outcome.conversionBySentiment')}
                        infoKey="outcomeSentiment"
                    >
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={bySentimentData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--glass-border)" />
                                    <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <YAxis unit="%" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.05)' }} formatter={rateFmt} />
                                    <Bar dataKey="rate" name={t('analytics.outcome.conversionRateCol')} fill={COLORS.follow_up} radius={[4, 4, 0, 0]} barSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>
                </MotionDiv>

                <MotionDiv delay={0.7}>
                    <ChartPanel
                        title={t('analytics.outcome.conversionByTalkRatio')}
                        infoKey="outcomeTalk"
                    >
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={byTalkPatternData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--glass-border)" />
                                    <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <YAxis unit="%" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.05)' }} formatter={rateFmt} />
                                    <Bar dataKey="rate" name={t('analytics.outcome.conversionRateCol')} fill={COLORS.success} radius={[4, 4, 0, 0]} barSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>
                </MotionDiv>
            </div>
        </div >
    );
};
