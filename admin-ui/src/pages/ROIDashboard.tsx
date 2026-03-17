import { Select } from '../components/ui/Select';
import React, { useState, useEffect } from 'react';
import {
    DollarSign, Clock, Users, Shield, TrendingUp,
    BarChart3, Activity, Zap, ChevronDown,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import { useDemoMode } from '../hooks/useDemoMode';
import { getMockROISummary, getMockROITrend, getMockROIBreakdown } from '../services/mock-data';
import type { ROISummary, ROIMetric } from '../dashboard/types';
import WidgetInfoTooltip from '../components/ui/WidgetInfoTooltip';
import ChartPanel from '../components/ui/ChartPanel';
import MetricCard from '../components/ui/MetricCard';
import { CHART_TOOLTIP_STYLE } from '../utils/chart-constants';
import '../styles/shared-dashboard.css';

// ── Constants ──

const METRIC_ICONS: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
    call_duration_saved: Clock,
    asr_cost_saved: DollarSign,
    revenue_attributed: TrendingUp,
    compliance_risk_avoided: Shield,
    acw_time_saved: Clock,
    fte_equivalent: Users,
    customer_ltv_rescued: DollarSign,
};

const METRIC_COLORS: Record<string, string> = {
    call_duration_saved: '#3b82f6',
    asr_cost_saved: '#10b981',
    revenue_attributed: '#f59e0b',
    compliance_risk_avoided: '#ef4444',
    acw_time_saved: '#8b5cf6',
    fte_equivalent: '#6366f1',
    customer_ltv_rescued: '#ec4899',
};

const PERIOD_OPTIONS = [
    { label: '7d', value: 7 },
    { label: '14d', value: 14 },
    { label: '30d', value: 30 },
    { label: '90d', value: 90 },
];

function fmtValue(m: ROIMetric): string {
    if (m.unit === 'USD') {
        const digits = m.value < 1000 ? 2 : 0;
        return `$${m.value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
    }
    if (m.unit === 'hours') return `${m.value}h`;
    if (m.unit === 'FTE') return m.value.toFixed(2);
    return String(m.value);
}

// ── Component ──

const ROIDashboard: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [days, setDays] = useState(30);
    const [summary, setSummary] = useState<ROISummary | null>(null);
    const [trend, setTrend] = useState<any[]>([]);
    const [breakdown, setBreakdown] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                if (demoMode) {
                    // Frontend mock data — matches system demo pattern
                    const [sumData, trendData, breakData] = await Promise.all([
                        getMockROISummary(days),
                        getMockROITrend(days),
                        getMockROIBreakdown(days),
                    ]);
                    setSummary(sumData as ROISummary);
                    setTrend(trendData);
                    setBreakdown(breakData);
                } else {
                    const [sumRes, trendRes, breakRes] = await Promise.all([
                        api.get(`/analytics/roi/summary?days=${days}`),
                        api.get(`/analytics/roi/trend?days=${days}`),
                        api.get(`/analytics/roi/breakdown?days=${days}`),
                    ]);
                    setSummary(sumRes.data?.data || null);
                    setTrend(trendRes.data?.data || []);
                    setBreakdown(breakRes.data?.data || []);
                }
            } catch (e) {
                console.error('ROI fetch failed', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [days, demoMode]);

    // Group breakdown by date for stacked bar chart
    const breakdownByDate = React.useMemo(() => {
        const map = new Map<string, any>();
        for (const row of breakdown) {
            if (!map.has(row.date)) map.set(row.date, { date: row.date });
            map.get(row.date)![row.metric_type] = row.value;
        }
        return Array.from(map.values());
    }, [breakdown]);

    return (
        <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BarChart3 size={26} style={{ color: '#10b981' }} />
                        {t('roiPage.title')}
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                        {t('roiPage.subtitle')}
                    </p>
                </div>
                <div style={{ position: 'relative' }}>
                    <Select
                        value={days}
                        onChange={e => setDays(Number(e.target.value))}
                        style={{
                            appearance: 'none', background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
                            color: 'var(--text-primary)', padding: '8px 32px 8px 12px',
                            fontSize: '0.85rem', cursor: 'pointer',
                        }}
                    >
                        {PERIOD_OPTIONS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </Select>
                    <ChevronDown size={14} style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        pointerEvents: 'none', color: 'var(--text-muted)',
                    }} />
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
                    {t('roiPage.loading')}
                </div>
            ) : !summary ? (
                <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
                    {t('roiPage.noData')}
                </div>
            ) : (
                <>
                    {/* Total Value Hero */}
                    <div style={{
                        textAlign: 'center', padding: '32px 24px', marginBottom: 24,
                        borderRadius: 'var(--radius-lg)',
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.08))',
                        border: '1px solid rgba(16,185,129,0.15)',
                        position: 'relative',
                    }}>
                        <WidgetInfoTooltip info={{
                            descriptionKey: 'widgetInfo.roiTotalValue.desc',
                            sourceKey: 'widgetInfo.roiTotalValue.source',
                            calculationKey: 'widgetInfo.roiTotalValue.calc',
                        }} />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2 }}>
                            {t('roiPage.totalValue', { days })}
                        </div>
                        <div style={{
                            fontSize: '3rem', fontWeight: 800, margin: '8px 0',
                            background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            ${summary.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {t('roiPage.activeMetrics', { count: summary.metrics.filter(m => m.value > 0).length })}
                        </div>
                    </div>

                    {/* Metric Cards Grid */}
                    <div className="metric-grid">
                        {summary.metrics.map(m => {
                            const Icon = METRIC_ICONS[m.key] || DollarSign;
                            const color = METRIC_COLORS[m.key] || '#6b7280';
                            const isPlaceholder = m.value === 0 && ['acw_time_saved', 'customer_ltv_rescued'].includes(m.key);
                            return (
                                <MetricCard
                                    key={m.key}
                                    label={t(`roiPage.metrics.${m.key}`, m.label)}
                                    value={fmtValue(m)}
                                    icon={<Icon size={16} />}
                                    color={color}
                                    change={m.improvement_pct > 0 ? m.improvement_pct : undefined}
                                    infoKey={`roiMetric_${m.key}`}
                                    placeholder={isPlaceholder}
                                    placeholderText={isPlaceholder ? t('roiPage.comingSoon') : undefined}
                                />
                            );
                        })}
                    </div>

                    {/* Charts Row */}
                    <div className="charts-grid-2col">
                        {/* Trend Chart */}
                        <ChartPanel
                            title={t('roiPage.trendTitle')}
                            icon={<Activity size={15} style={{ color: '#3b82f6' }} />}
                            infoKey="roiTrend"
                        >
                            <div style={{ height: 240 }}>
                                {trend.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trend}>
                                            <defs>
                                                <linearGradient id="roiGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => v.slice(5)} />
                                            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => `$${v}`} />
                                            <Tooltip
                                                contentStyle={CHART_TOOLTIP_STYLE}
                                                formatter={(v: any) => [`$${Number(v).toFixed(2)}`, t('roiPage.roiValue')]}
                                            />
                                            <Area type="monotone" dataKey="total_value" stroke="#10b981" fill="url(#roiGrad)" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        {t('roiPage.noData')}
                                    </div>
                                )}
                            </div>
                        </ChartPanel>

                        {/* Breakdown Stacked Bar */}
                        <ChartPanel
                            title={t('roiPage.breakdownTitle')}
                            icon={<Zap size={15} style={{ color: '#f59e0b' }} />}
                            infoKey="roiBreakdown"
                        >
                            <div style={{ height: 240 }}>
                                {breakdownByDate.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={breakdownByDate}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => v.slice(5)} />
                                            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => `$${v}`} />
                                            <Tooltip
                                                contentStyle={CHART_TOOLTIP_STYLE}
                                                formatter={(v: any) => `$${Number(v).toFixed(2)}`}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                                            <Bar dataKey="call_duration_saved" name={t('roiPage.duration')} fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="asr_cost_saved" name={t('roiPage.asrCost')} fill="#10b981" stackId="a" />
                                            <Bar dataKey="revenue_attributed" name={t('roiPage.revenue')} fill="#f59e0b" stackId="a" />
                                            <Bar dataKey="compliance_risk_avoided" name={t('roiPage.compliance')} fill="#ef4444" stackId="a" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        {t('roiPage.noData')}
                                    </div>
                                )}
                            </div>
                        </ChartPanel>
                    </div>
                </>
            )}
        </div>
    );
};

export default ROIDashboard;
