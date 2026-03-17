
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    TrendingUp, Phone, PhoneOff, Clock, Timer, ShieldCheck, Users,
    BarChart3, Activity, Network
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, Legend,
} from 'recharts';
import { MotionDiv } from '../ui/MotionDiv';
import ChartPanel from '../ui/ChartPanel';
import MetricCard from '../ui/MetricCard';
import type { AgentRow, HeatmapEntry, HourlyTrend, SLAOverview, VolumeEntry } from '../../types/analytics';
import { CHART_TOOLTIP_STYLE, EMOTION_COLORS } from '../../utils/chart-constants';
import '../../styles/shared-dashboard.css';

export const SLAOverviewSection: React.FC<{
    loading: boolean;
    overview: SLAOverview | null;
    hourly: HourlyTrend[];
    agents: AgentRow[];
    volume: VolumeEntry[];
    heatmap: HeatmapEntry[];
    handleDrillDown: (type: string, value: string) => void;
}> = ({
    loading,
    overview,
    hourly,
    agents,
    volume,
    heatmap,
    handleDrillDown,
}) => {
        const { t } = useTranslation();

        if (loading) {
            return (
                <div className="analytics-loading flex flex-col gap-4">
                    <div className="analytics-skeleton h-32 w-full rounded-xl" />
                    <div className="grid grid-cols-2 gap-4">
                        <div className="analytics-skeleton h-64 w-full rounded-xl" />
                        <div className="analytics-skeleton h-64 w-full rounded-xl" />
                    </div>
                </div>
            );
        }

        if (!overview) return null;

        const gauges = [
            { name: t('analytics.sla.answerRate'), value: overview.answer_rate, fill: '#8b5cf6', max: 100 },
            { name: t('analytics.sla.abandonRate'), value: overview.abandon_rate, fill: '#ef4444', max: 100 },
            { name: t('analytics.sla.serviceLevel'), value: overview.service_level, fill: '#10b981', max: 100 },
        ];

        return (
            <div className="animate-fade-in space-y-6">
                {/* ── KPI Strip ── */}
                <div className="metric-grid">
                    <MetricCard
                        label={t('analytics.sla.totalCalls')}
                        value={overview.total_calls.toLocaleString()}
                        color="#3b82f6"
                        icon={<Phone size={16} />}
                        change={overview.change?.total_calls}
                        infoKey="slaTotalCalls"
                    />
                    <MetricCard
                        label={t('analytics.sla.answerRate')}
                        value={`${overview.answer_rate}%`}
                        color={overview.answer_rate > 90 ? '#10b981' : '#ef4444'}
                        icon={<TrendingUp size={16} />}
                        change={overview.change?.answer_rate}
                        infoKey="slaAnswerRate"
                    />
                    <MetricCard
                        label={t('analytics.sla.abandonRate')}
                        value={`${overview.abandon_rate}%`}
                        color={overview.abandon_rate < 5 ? '#10b981' : '#ef4444'}
                        icon={<PhoneOff size={16} />}
                        change={overview.change?.abandon_rate}
                        infoKey="slaAbandonRate"
                    />
                    <MetricCard
                        label={t('analytics.sla.avgWait')}
                        value={`${overview.avg_wait_time}s`}
                        color="#f59e0b"
                        icon={<Timer size={16} />}
                        change={overview.change?.avg_wait_time}
                        infoKey="slaAvgWait"
                    />
                    <MetricCard
                        label={t('analytics.sla.avgHandle')}
                        value={`${Math.floor(overview.avg_handle_time / 60)}m ${Math.round(overview.avg_handle_time % 60)}s`}
                        color="#06b6d4"
                        icon={<Clock size={16} />}
                        change={overview.change?.avg_handle_time}
                        infoKey="slaAvgHandle"
                    />
                    <MetricCard
                        label={t('analytics.sla.serviceLevel')}
                        value={`${overview.service_level}%`}
                        color="#a855f7"
                        icon={<ShieldCheck size={16} />}
                        sub={t('analytics.sla.under20s')}
                        change={overview.change?.service_level}
                        infoKey="slaServiceLevel"
                    />
                    <MetricCard
                        label="NER"
                        value={`${(overview as any).ner || 0}%`}
                        color={(overview as any).ner > 90 ? '#10b981' : '#f59e0b'}
                        icon={<Network size={16} />}
                        sub="Network Effectiveness"
                        change={(overview as any).change?.ner}
                        infoKey="slaNER"
                    />
                </div>

                {/* ── Row 1: Gauges & Hourly ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Radial Gauges */}
                    <ChartPanel
                        title={t('analytics.sla.performanceGauges')}
                        icon={<Activity size={18} />}
                        infoKey="slaGauges"
                        className="col-span-1 flex flex-col"
                    >
                        <div className="w-full" style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="100%" barSize={15} data={gauges}>
                                    <RadialBar
                                        label={{ position: 'insideStart', fill: '#fff' }}
                                        background
                                        dataKey="value"
                                    />
                                    <Legend iconSize={10} layout="vertical" verticalAlign="middle" wrapperStyle={{ right: 0 }} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                                </RadialBarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>

                    {/* Hourly Trend */}
                    <ChartPanel
                        title={t('analytics.sla.hourlyPattern')}
                        icon={<Clock size={18} />}
                        infoKey="slaHourly"
                        className="col-span-2 flex flex-col"
                    >
                        <div className="w-full" style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hourly} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--glass-border)" />
                                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                                        contentStyle={CHART_TOOLTIP_STYLE}
                                    />
                                    <Bar dataKey="answered" name={t('analytics.sla.answered')} stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                                    <Bar dataKey="abandoned" name={t('analytics.sla.abandoned')} stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>
                </div>

                {/* ── Row 2: Volume & Heatmap ── */}
                <div className="charts-grid-2col">
                    {/* Total Volume Trend */}
                    <ChartPanel
                        title={t('analytics.sla.callVolumeTrend')}
                        icon={<BarChart3 size={18} />}
                        infoKey="slaVolume"
                        className="flex flex-col"
                    >
                        <div className="w-full" style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={volume} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--glass-border)" />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" />
                                    <Area type="monotone" dataKey="abandoned" stroke="#ef4444" strokeWidth={2} fill="none" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartPanel>

                    {/* Heatmap */}
                    <ChartPanel
                        title={t('analytics.sla.qualitySentimentHeatmap')}
                        icon={<Activity size={18} />}
                        infoKey="slaHeatmap"
                        className="flex flex-col"
                    >
                        <div className="flex-1 h-[300px] flex items-center justify-center">
                            {heatmap.length > 0 ? (() => {
                                const sentiments = [...new Set(heatmap.map(h => h.sentiment))];
                                const buckets = [...new Set(heatmap.map(h => h.score_bucket))];
                                const max = Math.max(...heatmap.map(c => c.count));
                                const heatmapMap = new Map(heatmap.map(h => [`${h.sentiment}|${h.score_bucket}`, h]));

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                                        {/* X-axis labels (score buckets) */}
                                        <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${buckets.length}, 1fr)`, gap: 3 }}>
                                            <div />
                                            {buckets.map(b => (
                                                <div key={b} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{b}</div>
                                            ))}
                                        </div>
                                        {/* Rows: Y-axis label + cells */}
                                        {sentiments.map(sentiment => (
                                            <div key={sentiment} style={{ display: 'grid', gridTemplateColumns: `80px repeat(${buckets.length}, 1fr)`, gap: 3 }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>{sentiment}</div>
                                                {buckets.map(bucket => {
                                                    const cell = heatmapMap.get(`${sentiment}|${bucket}`);
                                                    const count = cell?.count || 0;
                                                    const opacity = max > 0 ? 0.2 + (count / max) * 0.8 : 0.2;
                                                    const baseColor = EMOTION_COLORS[sentiment.toLowerCase().includes('positive') ? 'happy'
                                                        : sentiment.toLowerCase().includes('negative') ? 'angry' : 'neutral'] || '#94a3b8';
                                                    return (
                                                        <MotionDiv key={bucket}
                                                            className="analytics-heatmap-cell"
                                                            style={{ backgroundColor: baseColor, opacity }}
                                                            title={`${sentiment} / ${bucket}: ${count}`}
                                                            onClick={() => handleDrillDown('sentiment', sentiment)}
                                                        >
                                                            <span className="text-xs font-bold drop-shadow-md">{count}</span>
                                                        </MotionDiv>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })() : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('analytics.sla.noHeatmapData')}</div>}
                        </div>
                    </ChartPanel>
                </div>

                {/* ── Row 3: Agent Leaderboard ── */}
                <ChartPanel
                    title={t('analytics.sla.agentLeaderboard')}
                    icon={<Users size={18} />}
                    infoKey="slaLeaderboard"
                    className="flex flex-col"
                >
                    {agents.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table className="analytics-table">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('analytics.sla.agent')}</TableHead>
                                        <TableHead>{t('analytics.sla.calls')}</TableHead>
                                        <TableHead>{t('analytics.sla.aht')}</TableHead>
                                        <TableHead>{t('analytics.sla.qiScore')}</TableHead>
                                        <TableHead>{t('analytics.sla.conversion')}</TableHead>
                                        <TableHead>{t('analytics.sla.trend7d')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {agents.map((agent, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                                <span
                                                    data-agent-id={agent.agent_id}
                                                    style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(99,102,241,0.3)' }}
                                                    onClick={() => handleDrillDown('status', agent.agent_id)}
                                                >
                                                    {agent.agent_name || agent.agent_id}
                                                </span>
                                            </TableCell>
                                            <TableCell>{agent.total_calls}</TableCell>
                                            <TableCell>{Math.floor(agent.avg_handle_time / 60)}m {Math.round(agent.avg_handle_time % 60)}s</TableCell>
                                            <TableCell>
                                                <span className={`analytics-score-badge ${agent.avg_qi_score >= 80 ? 'analytics-score-excellent' :
                                                    agent.avg_qi_score >= 60 ? 'analytics-score-good' : 'analytics-score-poor'
                                                    }`}>
                                                    {agent.avg_qi_score}
                                                </span>
                                            </TableCell>
                                            <TableCell>{agent.conversion_rate}%</TableCell>
                                            <TableCell>
                                                <div className="analytics-sparkline">
                                                    {(agent.trend && agent.trend.length > 0) ? agent.trend.map((h, k) => (
                                                        <div key={k} className="analytics-sparkline-bar bg-indigo-400" style={{ height: `${h}%` }} />
                                                    )) : (
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>—</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : <div className="analytics-loading">{t('analytics.sla.noAgentData')}</div>}
                </ChartPanel>
            </div>
        );
    };
