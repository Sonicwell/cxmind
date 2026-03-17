import { DatePicker } from '../components/ui/DatePicker';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import {
    TrendingUp, Download, BarChart3, FileText, Brain, Cpu, Calendar, Check,
    FileSpreadsheet, FileDown, Users, RefreshCw,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import '../styles/analytics.css';
import '../styles/shared-dashboard.css';
import { useDemoMode } from '../hooks/useDemoMode';
import { getMockSLAAnalytics, getMockSummaryAnalytics, getMockBehaviorAnalytics, getMockOutcomeDashboard } from '../services/mock-data';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { MotionButton } from '../components/ui/MotionButton';
import { ScheduledReportsModal } from '../components/analytics/ScheduledReportsModal';
import { SLAOverviewSection } from '../components/analytics/SLAOverviewSection';
import { OutcomeSection } from '../components/analytics/OutcomeSection';
import { BehaviorSection } from '../components/analytics/BehaviorSection';
import type { OutcomeDashboardData, BehaviorDashboardData } from '../types/analytics';
import { LazySection } from '../components/analytics/LazySection';
import { TopicCloudWidget } from '../components/analytics/TopicCloudWidget';
import { useNavigate } from 'react-router-dom';
import ChartPanel from '../components/ui/ChartPanel';
import MetricCard from '../components/ui/MetricCard';
import { MotionDiv } from '../components/ui/MotionDiv';
import type {
    SLAOverview, HourlyTrend, AgentRow, VolumeEntry, HeatmapEntry,
    IntentEntry, SentimentTrendEntry, SummaryOverview
} from '../types/analytics';


import { CHART_TOOLTIP_STYLE as TOOLTIP_STYLE, PIE_COLORS } from '../utils/chart-constants';
import { Button } from '../components/ui/button';

// ── Date range helpers ──
type DatePreset = 'today' | '7d' | '14d' | '30d' | '90d' | 'custom';
interface DateRange { preset: DatePreset; from?: string; to?: string }

const PRESETS: { labelKey: string; preset: DatePreset; days: number }[] = [
    { labelKey: 'analytics.today', preset: 'today', days: 1 },
    { labelKey: '7d', preset: '7d', days: 7 },
    { labelKey: '14d', preset: '14d', days: 14 },
    { labelKey: '30d', preset: '30d', days: 30 },
    { labelKey: '90d', preset: '90d', days: 90 },
];

const presetToDays = (p: DatePreset): number => {
    const map: Record<string, number> = { today: 1, '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
    return map[p] || 7;
};

const loadDateRange = (): DateRange => {
    try {
        const saved = localStorage.getItem('analytics_date_range');
        if (saved) return JSON.parse(saved);
    } catch { /* ignore corrupt */ }
    return { preset: '7d' };
};

const saveDateRange = (dr: DateRange) => {
    localStorage.setItem('analytics_date_range', JSON.stringify(dr));
};

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// Helper: add rows from an array of objects to an ExcelJS worksheet
function addJsonSheet(wb: ExcelJS.Workbook, name: string, data: Record<string, any>[]) {
    if (data.length === 0) return;
    const ws = wb.addWorksheet(name);
    ws.columns = Object.keys(data[0]).map(key => ({ header: key, key, width: 18 }));
    data.forEach(row => ws.addRow(row));
}

// ── Component ──
const Analytics: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const navigate = useNavigate();
    const [showSchedule, setShowSchedule] = useState(false);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<DateRange>(loadDateRange);
    const [showCustom, setShowCustom] = useState(false);
    const [customFrom, setCustomFrom] = useState(dateRange.from || fmtDate(new Date(Date.now() - 7 * 86400000)));
    const [customTo, setCustomTo] = useState(dateRange.to || fmtDate(new Date()));
    const customRef = useRef<HTMLDivElement>(null);
    const [overview, setOverview] = useState<SLAOverview | null>(null);
    const [hourly, setHourly] = useState<HourlyTrend[]>([]);
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [volume, setVolume] = useState<VolumeEntry[]>([]);
    const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
    const [intentDist, setIntentDist] = useState<IntentEntry[]>([]);
    const [sentimentTrend, setSentimentTrend] = useState<SentimentTrendEntry[]>([]);
    const [summaryOv, setSummaryOv] = useState<SummaryOverview | null>(null);
    const [outcomeData, setOutcomeData] = useState<OutcomeDashboardData | null>(null);

    // Behavior Section State
    const [behaviorData, setBehaviorData] = useState<BehaviorDashboardData | null>(null);
    const [loadingBehavior, setLoadingBehavior] = useState(false);

    // Auto-refresh state
    const [autoRefreshSec, setAutoRefreshSec] = useState<number>(0); // 0 = off
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [elapsed, setElapsed] = useState(0);

    const handleDrillDown = (type: string, value: string) => {
        const query = new URLSearchParams();
        if (type === 'emotion') query.set('emotion', value);
        if (type === 'sentiment') query.set('sentiment', value);
        if (type === 'intent') query.set('intent', value);
        if (type === 'status') query.set('status', value);

        navigate(`/calls?${query.toString()}`);
    };

    // Effective days for display & mock
    const effectiveDays = dateRange.preset === 'custom'
        ? Math.max(1, Math.ceil((new Date(dateRange.to || '').getTime() - new Date(dateRange.from || '').getTime()) / 86400000))
        : presetToDays(dateRange.preset);

    // Build query string for API calls
    const buildQuery = () => {
        if (dateRange.preset === 'custom' && dateRange.from && dateRange.to) {
            return `?from=${dateRange.from}&to=${dateRange.to}`;
        }
        return `?days=${presetToDays(dateRange.preset)}`;
    };

    // Label for sub text
    const rangeLabel = dateRange.preset === 'custom'
        ? `${dateRange.from} — ${dateRange.to}`
        : `Last ${effectiveDays === 1 ? 'day' : effectiveDays + 'd'}`;

    const handlePreset = (preset: DatePreset) => {
        const dr: DateRange = { preset };
        setDateRange(dr);
        saveDateRange(dr);
        setShowCustom(false);
    };

    const handleCustomApply = () => {
        if (!customFrom || !customTo || customFrom > customTo) return;
        const dr: DateRange = { preset: 'custom', from: customFrom, to: customTo };
        setDateRange(dr);
        saveDateRange(dr);
        setShowCustom(false);
    };

    // Close custom popover on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (customRef.current && !customRef.current.contains(e.target as Node)) setShowCustom(false);
        };
        if (showCustom) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showCustom]);



    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (demoMode) {
                const data = await getMockSLAAnalytics(effectiveDays);
                setOverview(data.overview);
                setHourly(data.hourlyTrend);
                setAgents(data.agentLeaderboard);
                setVolume(data.callVolume);
                setHeatmap(data.qualitySentiment);

                const sData = await getMockSummaryAnalytics(effectiveDays);
                setIntentDist(sData.intentDistribution);
                setSentimentTrend(sData.sentimentTrend);
                setSummaryOv(sData.summaryOverview);

                const outcomeMock = await getMockOutcomeDashboard(effectiveDays);
                setOutcomeData(outcomeMock.data);
            } else {
                const q = buildQuery();
                const [ov, hr, ag, vol, hm, intDist, sentTrend, sumOv, outcomeD] = await Promise.all([
                    api.get(`/analytics/sla/overview${q}`),
                    api.get(`/analytics/sla/hourly-trend`),
                    api.get(`/analytics/sla/agent-leaderboard${q}`),
                    api.get(`/analytics/sla/call-volume${q}`),
                    api.get(`/analytics/sla/quality-sentiment${q}`),
                    api.get(`/analytics/summary/intent-distribution${q}`).catch(() => ({ data: { data: [] } })),
                    api.get(`/analytics/summary/sentiment-trend${q}`).catch(() => ({ data: { data: [] } })),
                    api.get(`/analytics/summary/overview${q}`).catch(() => ({ data: { data: null } })),
                    api.get(`/platform/calls/analytics/outcome/dashboard${q}`).catch(() => ({ data: { data: null } })),
                ]);
                setOverview(ov.data.data);
                setHourly(hr.data.data);
                setAgents(ag.data.data);
                setVolume(vol.data.data);
                setHeatmap(hm.data.data);
                setIntentDist(intDist.data.data || []);
                setSentimentTrend(sentTrend.data.data || []);
                setSummaryOv(sumOv.data.data || null);
                setOutcomeData(outcomeD.data.data || null);
            }
        } catch (err) {
            console.error('Analytics fetch failed:', err);
        } finally {
            setLoading(false);
            setLastUpdated(new Date());
            setElapsed(0);
        }
    }, [demoMode, dateRange]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-refresh timer
    useEffect(() => {
        if (autoRefreshSec <= 0) return;
        const id = setInterval(() => { fetchData(); }, autoRefreshSec * 1000);
        return () => clearInterval(id);
    }, [autoRefreshSec, fetchData]);

    // "Updated X ago" counter — 页面不可见时暂停
    useEffect(() => {
        if (!lastUpdated) return;
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') {
                setElapsed(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
            }
        }, 1000);
        return () => clearInterval(id);
    }, [lastUpdated]);

    const fmtElapsed = (s: number) => {
        if (s < 60) return t('analytics.updatedAgo', { time: `${s}s` });
        return t('analytics.updatedAgo', { time: `${Math.floor(s / 60)}m` });
    };

    // Lazy Fetch for Behavior
    const fetchBehavior = useCallback(async () => {
        if (behaviorData || loadingBehavior) return;
        setLoadingBehavior(true);
        try {
            if (demoMode) {
                const res = await getMockBehaviorAnalytics(effectiveDays);
                setBehaviorData(res.data as BehaviorDashboardData);
            } else {
                const q = buildQuery();
                const [beh, emDist, emTrend] = await Promise.all([
                    api.get(`/speech-emotion/analytics/behavior-metrics${q}`),
                    api.get(`/speech-emotion/analytics/distribution${q}`),
                    api.get(`/speech-emotion/analytics/trend${q}`)
                ]);
                // CH UInt64 返回字符串, Recharts Pie 需要 number
                const rawDist: any[] = emDist.data.data || [];
                const parsedDist = rawDist.map((r: any) => ({ ...r, count: Number(r.count) }));

                // trend API 返回 long format {date, emotion, count}, AreaChart 需要 wide format {date, happy: N, ...}
                const rawTrend: any[] = emTrend.data.data || [];
                const trendMap = new Map<string, Record<string, number>>();
                for (const row of rawTrend) {
                    if (!trendMap.has(row.date)) trendMap.set(row.date, { date: row.date } as any);
                    trendMap.get(row.date)![row.emotion] = Number(row.count);
                }
                const pivotedTrend = Array.from(trendMap.values()) as any[];

                setBehaviorData({
                    distribution: beh.data.distribution,
                    trend: beh.data.trend,
                    emotion_dist: parsedDist,
                    emotion_trend: pivotedTrend
                });
            }
        } catch (err) {
            console.error('Behavior fetch failed:', err);
        } finally {
            setLoadingBehavior(false);
        }
    }, [demoMode, effectiveDays, behaviorData, loadingBehavior, dateRange]); // depend on dateRange via effectiveDays/buildQuery
    // 日期范围变了重置behavior数据
    useEffect(() => { setBehaviorData(null); }, [dateRange, demoMode]);


    const [exporting, setExporting] = useState(false);

    // ── CSV Export (backend) ──
    const handleExportCSV = async (dataset: string = 'overview') => {
        try {
            setExporting(true);
            const q = buildQuery();
            const sep = q.includes('?') ? '&' : '?';
            const url = demoMode
                ? `/analytics/sla/export${q}${sep}dataset=${dataset}&demo=true`
                : `/analytics/sla/export${q}${sep}dataset=${dataset}`;
            const res = await api.get(url, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'text/csv' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `analytics_${dataset}_${rangeLabel.replace(/\s/g, '_')}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) { console.error('CSV export failed:', err); }
        finally { setExporting(false); }
    };

    // ── PDF Export (frontend: html2canvas + jspdf) ──
    const handleExportPDF = async () => {
        try {
            setExporting(true);
            const pageEl = document.querySelector('.analytics-page') as HTMLElement;
            if (!pageEl) return;

            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pW = pdf.internal.pageSize.getWidth();
            const pH = pdf.internal.pageSize.getHeight();

            // ── Cover Page ──
            pdf.setFillColor(15, 23, 42);
            pdf.rect(0, 0, pW, pH, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(28);
            pdf.text('Analytics & SLA Report', pW / 2, pH * 0.35, { align: 'center' });
            pdf.setFontSize(14);
            pdf.setTextColor(148, 163, 184);
            pdf.text(`Period: ${rangeLabel}`, pW / 2, pH * 0.45, { align: 'center' });
            pdf.text(`Generated: ${new Date().toLocaleString()}`, pW / 2, pH * 0.52, { align: 'center' });
            pdf.setFontSize(11);
            pdf.setTextColor(99, 102, 241);
            pdf.text('CXMind', pW / 2, pH * 0.65, { align: 'center' });

            // ── Dashboard Screenshot ──
            const canvas = await html2canvas(pageEl, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#f8fafc',
                logging: false,
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const imgW = pW - 20;
            const imgH = (canvas.height / canvas.width) * imgW;

            // Split into pages if needed
            let yOffset = 0;
            const pageContentH = pH - 20;
            while (yOffset < imgH) {
                pdf.addPage('a4', 'landscape');
                pdf.addImage(imgData, 'JPEG', 10, 10 - yOffset, imgW, imgH);
                yOffset += pageContentH;
            }

            pdf.save(`analytics_report_${rangeLabel.replace(/\s/g, '_')}.pdf`);
        } catch (err) { console.error('PDF export failed:', err); }
        finally { setExporting(false); }
    };

    // ── Excel Export (frontend: ExcelJS multi-sheet) ──
    const handleExportExcel = async () => {
        try {
            setExporting(true);
            const wb = new ExcelJS.Workbook();

            // Sheet 1: Overview KPIs
            if (overview) {
                const o = overview;
                addJsonSheet(wb, 'Overview', [{
                    'Total Calls': o.total_calls, 'Answered': o.answered, 'Abandoned': o.abandoned,
                    'Answer Rate (%)': o.answer_rate, 'Abandon Rate (%)': o.abandon_rate,
                    'Avg Wait (s)': o.avg_wait_time, 'Avg Handle (s)': o.avg_handle_time,
                    'Service Level (%)': o.service_level, 'Period': rangeLabel,
                }]);
            }

            // Sheet 2: Call Volume
            if (volume.length > 0) {
                addJsonSheet(wb, 'Call Volume',
                    volume.map(v => ({ Date: v.date, Total: v.total, Answered: v.answered, Abandoned: v.abandoned }))
                );
            }

            // Sheet 3: Agent Leaderboard
            if (agents.length > 0) {
                addJsonSheet(wb, 'Agent Leaderboard',
                    agents.map(a => ({
                        'Agent ID': a.agent_id, 'Name': a.agent_name || a.agent_id,
                        'Calls': a.total_calls, 'Avg Handle Time (s)': a.avg_handle_time,
                        'QI Score': a.avg_qi_score, 'Conversion (%)': a.conversion_rate,
                    }))
                );
            }

            // Sheet 4: Quality × Sentiment Heatmap
            if (heatmap.length > 0) {
                addJsonSheet(wb, 'Quality Heatmap',
                    heatmap.map(h => ({ Sentiment: h.sentiment, 'Score Bucket': h.score_bucket, Count: h.count }))
                );
            }

            // Sheet 5: Sentiment Trend
            if (sentimentTrend.length > 0) {
                addJsonSheet(wb, 'Sentiment Trend',
                    sentimentTrend.map(s => ({ Date: s.date, Positive: s.positive, Neutral: s.neutral, Negative: s.negative }))
                );
            }

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `analytics_${rangeLabel.replace(/\s/g, '_')}.xlsx`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) { console.error('Excel export failed:', err); }
        finally { setExporting(false); }
    };




    return (
        <div className="analytics-page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h1><TrendingUp size={24} /> {t('analytics.title')}</h1>
                    {lastUpdated && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtElapsed(elapsed)}
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <MotionButton
                        variant="secondary"
                        className="flex items-center gap-sm"
                        onClick={() => setShowSchedule(true)}
                    >
                        <Calendar size={16} /> {t('analytics.scheduleReport')}
                    </MotionButton>
                    <DropdownMenu
                        trigger={
                            <MotionButton
                                variant={autoRefreshSec > 0 ? 'primary' : 'secondary'}
                                className="flex items-center gap-sm"
                                style={autoRefreshSec > 0 ? { animation: 'pulse 2s infinite' } : {}}
                            >
                                <RefreshCw size={16} style={autoRefreshSec > 0 ? { animation: 'spin 2s linear infinite' } : {}} />
                                {autoRefreshSec > 0 ? `${autoRefreshSec}s` : t('analytics.auto')}
                            </MotionButton>
                        }
                        items={[
                            { label: t('analytics.autoRefreshOff'), onClick: () => setAutoRefreshSec(0) },
                            { label: t('analytics.autoRefreshEvery30s'), onClick: () => setAutoRefreshSec(30) },
                            { label: t('analytics.autoRefreshEvery60s'), onClick: () => setAutoRefreshSec(60) },
                            { label: t('analytics.autoRefreshEvery5m'), onClick: () => setAutoRefreshSec(300) },
                        ]}
                        align="end"
                    />
                    <DropdownMenu
                        trigger={
                            <MotionButton variant="primary" className="flex items-center gap-sm" disabled={exporting}>
                                <Download size={16} /> {exporting ? t('analytics.exporting') : t('analytics.export')}
                            </MotionButton>
                        }
                        items={[
                            { label: t('analytics.pdfReport'), icon: <FileDown size={15} />, onClick: handleExportPDF },
                            { label: t('analytics.excelXlsx'), icon: <FileSpreadsheet size={15} />, onClick: handleExportExcel },
                            { label: t('analytics.csvOverview'), icon: <FileText size={15} />, onClick: () => handleExportCSV('overview') },
                            { label: t('analytics.csvAgents'), icon: <Users size={15} />, onClick: () => handleExportCSV('agents') },
                            { label: t('analytics.csvVolume'), icon: <BarChart3 size={15} />, onClick: () => handleExportCSV('volume') },
                        ]}
                        align="end"
                    />
                </div>
            </div>

            <ScheduledReportsModal
                open={showSchedule}
                onOpenChange={setShowSchedule}
            />

            {/* Period Selector */}
            <div className="analytics-period">
                {PRESETS.map(p => (
                    <Button key={p.preset}
                        className={dateRange.preset === p.preset ? 'active' : ''}
                        onClick={() => handlePreset(p.preset)}>
                        {p.labelKey.startsWith('analytics.') ? t(p.labelKey) : p.labelKey}
                    </Button>
                ))}
                <div style={{ position: 'relative' }} ref={customRef}>
                    <Button
                        className={dateRange.preset === 'custom' ? 'active' : ''}
                        onClick={() => setShowCustom(!showCustom)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={13} />
                        {dateRange.preset === 'custom' ? `${dateRange.from} — ${dateRange.to}` : t('analytics.custom')}
                    </Button>
                    {showCustom && (
                        <div className="analytics-custom-popover">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <label style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('analytics.from')}</label>
                                <DatePicker value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                    className="analytics-date-input" max={customTo} />
                                <label style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('analytics.to')}</label>
                                <DatePicker value={customTo} onChange={e => setCustomTo(e.target.value)}
                                    className="analytics-date-input" min={customFrom} max={fmtDate(new Date())} />
                                <Button className="analytics-custom-apply" onClick={handleCustomApply}
                                    disabled={!customFrom || !customTo || customFrom > customTo}>
                                    <Check size={14} /> {t('analytics.apply')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Section 1: SLA Overview (Standard Loading) ── */}
            <SLAOverviewSection
                loading={loading}
                overview={overview}
                hourly={hourly}
                agents={agents}
                volume={volume}
                heatmap={heatmap}
                handleDrillDown={handleDrillDown}
            />

            {/* ── Section 1.5: Outcome Intelligence ── */}
            <LazySection title={t('analytics.outcomeIntelligence')} icon={<Brain size={20} />} className="mt-8">
                <OutcomeSection loading={loading} data={outcomeData} />
            </LazySection>

            {/* ── Section 2: Summary Insights (Lazy Loaded) ── */}
            <LazySection minHeight={400} className="mt-8" title={t('analytics.summaryInsights')} icon={<Brain size={20} />}>
                <div className="space-y-6 animate-fade-in">
                    {/* Summary KPI Strip */}
                    {summaryOv && (
                        <div className="metric-grid">
                            <MetricCard label={t('analytics.totalSummaries')} value={summaryOv.total_summaries.toLocaleString()}
                                color="#a855f7" icon={<FileText size={16} />} sub={rangeLabel} infoKey="summaryTotal" />
                            <MetricCard label={t('analytics.avgTokens')} value={summaryOv.avg_tokens.toLocaleString()}
                                color="#06b6d4" icon={<Cpu size={16} />} sub={t('analytics.perSummary')} infoKey="summaryTokens" />
                            <MetricCard label={t('analytics.topModel')} value={summaryOv.top_model}
                                color="#f59e0b" icon={<Brain size={16} />}
                                sub={`${summaryOv.models[0]?.count || 0} ${t('analytics.calls')}`} infoKey="summaryModel" />
                        </div>
                    )}

                    {/* Charts row: Intent Distribution + Sentiment Trend */}
                    <div className="charts-grid-2col">
                        {/* Intent Distribution Pie */}
                        <MotionDiv delay={0.1}>
                            <ChartPanel
                                title={t('analytics.intentDistribution')}
                                icon={<BarChart3 size={18} />}
                                infoKey="summaryIntent"
                            >
                                {intentDist.length > 0 ? (
                                    <div style={{ height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={intentDist} dataKey="count" nameKey="intent"
                                                    cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                                                    paddingAngle={2} strokeWidth={0}
                                                    label={({ name, percent }: any) => {
                                                        const short = name && name.length > 12 ? name.slice(0, 12) + '…' : name;
                                                        return `${short} ${((percent || 0) * 100).toFixed(0)}%`;
                                                    }}
                                                    onClick={(data) => {
                                                        const val = data.intent || (data.payload && data.payload.intent) || data.name;
                                                        if (val) handleDrillDown('intent', val);
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {intentDist.map((_, idx) => (
                                                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : <div className="analytics-loading">{t('analytics.noIntentData')}</div>}
                            </ChartPanel>
                        </MotionDiv>

                        {/* Sentiment Trend Area */}
                        <MotionDiv delay={0.2}>
                            <ChartPanel
                                title={`${t('analytics.sentimentTrend')} (${rangeLabel})`}
                                icon={<TrendingUp size={18} />}
                                infoKey="summarySentiment"
                            >
                                {sentimentTrend.length > 0 ? (
                                    <div style={{ height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={sentimentTrend}>
                                                <defs>
                                                    <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="neuGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--glass-border)" />
                                                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                <Area type="monotone" dataKey="positive" stroke="#10b981" fill="url(#posGrad)" strokeWidth={2} stackId="1" name={t('analytics.positive')} />
                                                <Area type="monotone" dataKey="neutral" stroke="#6366f1" fill="url(#neuGrad)" strokeWidth={2} stackId="1" name={t('analytics.neutral')} />
                                                <Area type="monotone" dataKey="negative" stroke="#ef4444" fill="url(#negGrad)" strokeWidth={2} stackId="1" name={t('analytics.negative')} />
                                                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : <div className="analytics-loading">{t('analytics.noSentimentData')}</div>}
                            </ChartPanel>
                        </MotionDiv>
                    </div>

                    {/* Topic Cloud Full Width Row */}
                    <div style={{ marginTop: '1.5rem' }}>
                        <TopicCloudWidget days={effectiveDays} />
                    </div>
                </div>

                {/* ═══════ Behavior & Sentiment Section ═══════ */}
                <LazySection
                    className="mt-8"
                    onVisible={fetchBehavior}
                    minHeight={450}
                >
                    <BehaviorSection loading={loadingBehavior} data={behaviorData} />
                </LazySection>
            </LazySection>
        </div>
    );
};




export default Analytics;
