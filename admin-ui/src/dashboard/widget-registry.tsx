import React from 'react';
import {
    Phone, Hash, Clock, Building2, AlertTriangle, Activity,
    BarChart3, TrendingDown, Globe, PhoneCall, Gauge, TrendingUp,
    PieChart, Target, Timer, SmilePlus, Trophy, Mic, Coins,
    PhoneIncoming, PhoneOutgoing,
} from 'lucide-react';
import type { WidgetDef, WidgetProps, DashboardView, DashboardViewsState } from './types';

// Lazy wrappers for stat widgets (they use StatWidget with different props)
import StatWidget from '../components/widgets/StatWidget';
import { useDashboardCore, useDashboardQuality, useDashboardAnalytics } from './DashboardContext';
import { fmtDuration } from './helpers';

import { useTranslation } from 'react-i18next';

// ──── Stat Widget Wrappers ────

const ActiveCallsStatWidget: React.FC<WidgetProps> = () => {
    const { liveCount } = useDashboardCore();
    const { t } = useTranslation();
    return <StatWidget icon={Phone} iconBg="hsla(150,60%,45%,0.2)" iconColor="var(--success)" label={t('dashboard.activeCalls', 'Active Calls')} value={liveCount} sub={t('dashboard.realTime', 'Real-time')} />;
};

const TotalCallsStatWidget: React.FC<WidgetProps> = () => {
    const { totalCalls24h } = useDashboardCore();
    const { t } = useTranslation();
    return <StatWidget icon={Hash} iconBg="hsla(250,80%,65%,0.2)" iconColor="var(--primary)" label={t('dashboard.totalCalls', 'Total Calls')} value={totalCalls24h.toLocaleString()} sub={t('dashboard.last24h', 'Last 24h')} />;
};

const AvgDurationStatWidget: React.FC<WidgetProps> = () => {
    const { avgDuration } = useDashboardCore();
    const { t } = useTranslation();
    return <StatWidget icon={Clock} iconBg="hsla(35,90%,60%,0.2)" iconColor="var(--warning)" label={t('dashboard.avgTalkTime', 'Avg Talk Time')} value={avgDuration != null ? fmtDuration(avgDuration) : '—'} sub={t('dashboard.last3h', 'Last 3h')} />;
};

const ClientsUsersStatWidget: React.FC<WidgetProps> = () => {
    const { stats } = useDashboardCore();
    const { t } = useTranslation();
    return <StatWidget icon={Building2} iconBg="hsla(200,70%,55%,0.2)" iconColor="#3b82f6" label={t('dashboard.usersAgents', 'Users / Agents')} value={stats?.users?.total || 0} sub={`${stats?.agents?.total || 0} ${t('common.agents', 'agents')}`} />;
};

const AvgMosStatWidget: React.FC<WidgetProps> = () => {
    const { mosDist } = useDashboardQuality();
    const { t } = useTranslation();
    return <StatWidget icon={Gauge} iconBg="hsla(150,60%,45%,0.2)" iconColor="var(--success)" label={t('dashboard.avgMos', 'Average MOS')} value={(mosDist?.avg_mos || 0).toFixed(2)} sub={`${t('common.min', 'Min')} ${(mosDist?.min_mos || 0).toFixed(2)}`} />;
};

const TotalAnalyzedStatWidget: React.FC<WidgetProps> = () => {
    const { mosDist, codecData } = useDashboardQuality();
    const { t } = useTranslation();
    return <StatWidget icon={BarChart3} iconBg="hsla(220,70%,55%,0.2)" iconColor="#3b82f6" label={t('dashboard.totalAnalyzed', 'Total Analyzed')} value={Number(mosDist?.total || 0).toLocaleString()} sub={`${codecData.length} ${t('common.codecs', 'codecs')}`} />;
};

const PoorQualityStatWidget: React.FC<WidgetProps> = () => {
    const { mosDist } = useDashboardQuality();
    const { t } = useTranslation();
    const total = mosDist?.total || 0;
    const pct = total > 0 ? ((Number(mosDist?.poor || 0) / total) * 100).toFixed(1) : '0.0';
    return <StatWidget icon={AlertTriangle} iconBg="hsla(35,90%,60%,0.2)" iconColor="var(--warning)" label={t('dashboard.poorQuality', 'Poor Quality')} value={`${pct}%`} sub={`${Number(mosDist?.poor || 0)} ${t('dashboard.callsMosUnder2', 'calls MOS < 2.0')}`} />;
};

const RegionsCountStatWidget: React.FC<WidgetProps> = () => {
    const { geoMedia } = useDashboardQuality();
    const { t } = useTranslation();
    return <StatWidget icon={Globe} iconBg="hsla(0,75%,55%,0.2)" iconColor="var(--danger)" label={t('dashboard.regions', 'Regions')} value={geoMedia.length} sub={t('dashboard.countriesWithData', 'countries with data')} />;
};

const ConversionRateStatWidget: React.FC<WidgetProps> = () => {
    const { outcomeStats } = useDashboardAnalytics();
    const { t } = useTranslation();
    const rate = outcomeStats?.conversion_rate != null ? `${(outcomeStats.conversion_rate * 100).toFixed(1)}%` : '—';
    return <StatWidget icon={TrendingUp} iconBg="hsla(150,70%,45%,0.15)" iconColor="#10b981" label={t('dashboard.conversionRate', 'Conversion Rate')} value={rate} sub={`${outcomeStats?.total_calls || 0} ${t('dashboard.totalCalls', 'total calls')}`} />;
};

const AIAccuracyStatWidget: React.FC<WidgetProps> = () => {
    const { outcomeStats } = useDashboardAnalytics();
    const { t } = useTranslation();
    const acc = outcomeStats?.accuracy;
    const rate = acc?.accuracy_rate != null ? `${(acc.accuracy_rate * 100).toFixed(1)}%` : '—';
    return <StatWidget icon={Target} iconBg="hsla(260,70%,60%,0.15)" iconColor="#8b5cf6" label={t('dashboard.aiAccuracy', 'AI Accuracy')} value={rate} sub={`${acc?.manual_overrides || 0} ${t('dashboard.manualReviews', 'manual reviews')}`} />;
};

// ──── Import chart/table/map widgets ────

const SipErrorsWidget = React.lazy(() => import('../components/widgets/SipErrorsWidget'));
const AcdAsrWidget = React.lazy(() => import('../components/widgets/AcdAsrWidget'));
const TrafficOriginsWidget = React.lazy(() => import('../components/widgets/TrafficOriginsWidget'));
const MosDistributionWidget = React.lazy(() => import('../components/widgets/MosDistributionWidget'));
const CodecPerformanceWidget = React.lazy(() => import('../components/widgets/CodecPerformanceWidget'));
const QualityTrendsWidget = React.lazy(() => import('../components/widgets/QualityTrendsWidget'));
const RegionalQualityWidget = React.lazy(() => import('../components/widgets/RegionalQualityWidget'));
const WorstCallsWidget = React.lazy(() => import('../components/widgets/WorstCallsWidget'));
const LiveCallsWidget = React.lazy(() => import('../components/widgets/LiveCallsWidget'));
const OperationsWidget = React.lazy(() => import('../components/widgets/OperationsWidget'));
const AlertFeedWidget = React.lazy(() => import('../components/widgets/AlertFeedWidget'));
const OutcomeDistributionWidget = React.lazy(() => import('../components/widgets/OutcomeDistributionWidget'));
const OutcomeTrendsWidget = React.lazy(() => import('../components/widgets/OutcomeTrendsWidget'));
const OutcomeQualityWidget = React.lazy(() => import('../components/widgets/OutcomeQualityWidget'));
const OutcomeDurationWidget = React.lazy(() => import('../components/widgets/OutcomeDurationWidget'));
const OutcomeSentimentWidget = React.lazy(() => import('../components/widgets/OutcomeSentimentWidget'));
const TopClosersWidget = React.lazy(() => import('../components/widgets/TopClosersWidget'));
const OutcomeTalkWidget = React.lazy(() => import('../components/widgets/OutcomeTalkWidget'));
const AICostROIWidget = React.lazy(() => import('../components/widgets/AICostROIWidget'));
const ROISummaryWidget = React.lazy(() => import('../components/widgets/ROISummaryWidget'));
const BentoGridWidget = React.lazy(() => import('../components/widgets/BentoGrid'));
const LeaderboardWallWidget = React.lazy(() => import('../components/widgets/LeaderboardWall'));
const InboundWidgetLazy = React.lazy(() => import('../components/widgets/DirectionalWidget').then(m => ({ default: m.InboundWidget })));
const OutboundWidgetLazy = React.lazy(() => import('../components/widgets/DirectionalWidget').then(m => ({ default: m.OutboundWidget })));
const DidCidWidget = React.lazy(() => import('../components/widgets/DidCidWidget'));
const HourlyVolumeWidget = React.lazy(() => import('../components/widgets/HourlyVolumeWidget'));
const DurationDistWidget = React.lazy(() => import('../components/widgets/DurationDistWidget'));

// ──── Suspense wrapper ────

function withSuspense(Component: React.LazyExoticComponent<React.FC<any>>): React.FC<WidgetProps> {
    return function SuspenseWrapper(props: WidgetProps) {
        return (
            <React.Suspense fallback={<div className="cq-loading">⋯</div>}>
                <Component {...props} />
            </React.Suspense>
        );
    };
}

// ──── Registry ────

export const WIDGET_REGISTRY: WidgetDef[] = [
    // Stat cards
    { id: 'active-calls', name: 'Active Calls', nameKey: 'widgets.activeCalls', info: { descriptionKey: 'widgetInfo.activeCalls.desc', sourceKey: 'widgetInfo.activeCalls.source', calculationKey: 'widgetInfo.activeCalls.calc' }, icon: Phone, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'calls', dataGroup: 'core', component: ActiveCallsStatWidget },
    { id: 'total-calls', name: 'Total Calls (24h)', nameKey: 'widgets.totalCalls', info: { descriptionKey: 'widgetInfo.totalCalls.desc', sourceKey: 'widgetInfo.totalCalls.source', calculationKey: 'widgetInfo.totalCalls.calc' }, icon: Hash, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'calls', dataGroup: 'core', component: TotalCallsStatWidget },
    { id: 'avg-duration', name: 'Avg Duration', nameKey: 'widgets.avgDuration', info: { descriptionKey: 'widgetInfo.avgDuration.desc', sourceKey: 'widgetInfo.avgDuration.source', calculationKey: 'widgetInfo.avgDuration.calc' }, icon: Clock, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'calls', dataGroup: 'core', component: AvgDurationStatWidget },
    { id: 'clients-users', name: 'Users / Agents', nameKey: 'widgets.usersAgents', info: { descriptionKey: 'widgetInfo.usersAgents.desc', sourceKey: 'widgetInfo.usersAgents.source', calculationKey: 'widgetInfo.usersAgents.calc' }, icon: Building2, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'users', dataGroup: 'core', component: ClientsUsersStatWidget },
    { id: 'avg-mos', name: 'Average MOS', nameKey: 'widgets.avgMos', info: { descriptionKey: 'widgetInfo.avgMos.desc', sourceKey: 'widgetInfo.avgMos.source', calculationKey: 'widgetInfo.avgMos.calc' }, icon: Gauge, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'monitoring', dataGroup: 'quality', component: AvgMosStatWidget },
    { id: 'total-analyzed', name: 'Total Analyzed', nameKey: 'widgets.totalAnalyzed', info: { descriptionKey: 'widgetInfo.totalAnalyzed.desc', sourceKey: 'widgetInfo.totalAnalyzed.source', calculationKey: 'widgetInfo.totalAnalyzed.calc' }, icon: BarChart3, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'qi', dataGroup: 'quality', component: TotalAnalyzedStatWidget },
    { id: 'poor-quality', name: 'Poor Quality %', nameKey: 'widgets.poorQuality', info: { descriptionKey: 'widgetInfo.poorQuality.desc', sourceKey: 'widgetInfo.poorQuality.source', calculationKey: 'widgetInfo.poorQuality.calc' }, icon: AlertTriangle, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'monitoring', dataGroup: 'quality', component: PoorQualityStatWidget },
    { id: 'regions-count', name: 'Regions Count', nameKey: 'widgets.regionsCount', info: { descriptionKey: 'widgetInfo.regionsCount.desc', sourceKey: 'widgetInfo.regionsCount.source', calculationKey: 'widgetInfo.regionsCount.calc' }, icon: Globe, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'monitoring', dataGroup: 'quality', component: RegionsCountStatWidget },

    // Charts
    { id: 'sip-errors', name: 'SIP Errors & Timeouts', nameKey: 'widgets.sipErrors', info: { descriptionKey: 'widgetInfo.sipErrors.desc', sourceKey: 'widgetInfo.sipErrors.source', calculationKey: 'widgetInfo.sipErrors.calc' }, icon: AlertTriangle, category: 'chart', defaultW: 6, defaultH: 4, minW: 4, minH: 3, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(SipErrorsWidget) },
    { id: 'acd-asr', name: 'ACD / ASR', nameKey: 'widgets.acdAsr', info: { descriptionKey: 'widgetInfo.acdAsr.desc', sourceKey: 'widgetInfo.acdAsr.source', calculationKey: 'widgetInfo.acdAsr.calc' }, icon: Activity, category: 'chart', defaultW: 6, defaultH: 4, minW: 4, minH: 3, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(AcdAsrWidget) },
    { id: 'mos-distribution', name: 'MOS Distribution', nameKey: 'widgets.mosDist', info: { descriptionKey: 'widgetInfo.mosDist.desc', sourceKey: 'widgetInfo.mosDist.source', calculationKey: 'widgetInfo.mosDist.calc' }, icon: BarChart3, category: 'chart', defaultW: 3, defaultH: 5, minW: 3, minH: 4, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(MosDistributionWidget) },
    { id: 'quality-trends', name: 'Quality Trends', nameKey: 'widgets.qualityTrends', info: { descriptionKey: 'widgetInfo.qualityTrends.desc', sourceKey: 'widgetInfo.qualityTrends.source', calculationKey: 'widgetInfo.qualityTrends.calc' }, icon: TrendingDown, category: 'chart', defaultW: 12, defaultH: 5, minW: 6, minH: 3, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(QualityTrendsWidget) },

    // Tables
    { id: 'codec-performance', name: 'Codec Performance', nameKey: 'widgets.codecPerf', info: { descriptionKey: 'widgetInfo.codecPerf.desc', sourceKey: 'widgetInfo.codecPerf.source', calculationKey: 'widgetInfo.codecPerf.calc' }, icon: BarChart3, category: 'table', defaultW: 6, defaultH: 5, minW: 4, minH: 3, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(CodecPerformanceWidget) },
    { id: 'worst-calls', name: 'Worst Calls', nameKey: 'widgets.worstCalls', info: { descriptionKey: 'widgetInfo.worstCalls.desc', sourceKey: 'widgetInfo.worstCalls.source', calculationKey: 'widgetInfo.worstCalls.calc' }, icon: TrendingDown, category: 'table', defaultW: 6, defaultH: 5, minW: 4, minH: 3, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(WorstCallsWidget) },
    { id: 'live-calls', name: 'Live Calls', nameKey: 'widgets.liveCalls', info: { descriptionKey: 'widgetInfo.liveCalls.desc', sourceKey: 'widgetInfo.liveCalls.source', calculationKey: 'widgetInfo.liveCalls.calc' }, icon: PhoneCall, category: 'table', defaultW: 12, defaultH: 6, minW: 6, minH: 4, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(LiveCallsWidget) },

    // Maps
    { id: 'traffic-origins', name: 'Traffic Origins', nameKey: 'widgets.trafficOrigins', info: { descriptionKey: 'widgetInfo.trafficOrigins.desc', sourceKey: 'widgetInfo.trafficOrigins.source', calculationKey: 'widgetInfo.trafficOrigins.calc' }, icon: Globe, category: 'map', defaultW: 12, defaultH: 5, minW: 6, minH: 4, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(TrafficOriginsWidget) },
    { id: 'regional-quality', name: 'Regional Quality', nameKey: 'widgets.regionalQuality', info: { descriptionKey: 'widgetInfo.regionalQuality.desc', sourceKey: 'widgetInfo.regionalQuality.source', calculationKey: 'widgetInfo.regionalQuality.calc' }, icon: Globe, category: 'chart', defaultW: 6, defaultH: 5, minW: 4, minH: 3, module: 'monitoring', dataGroup: 'quality', requiredPermission: 'quality:read', component: withSuspense(RegionalQualityWidget) },

    // Cards (Agent Map style)
    { id: 'operations', name: 'Operations Overview', nameKey: 'widgets.operations', info: { descriptionKey: 'widgetInfo.operations.desc', sourceKey: 'widgetInfo.operations.source', calculationKey: 'widgetInfo.operations.calc' }, icon: TrendingUp, category: 'card', defaultW: 4, defaultH: 5, minW: 3, minH: 4, module: 'dashboard', dataGroup: 'core', requiredPermission: 'reports:read', component: withSuspense(OperationsWidget) },
    { id: 'platform-alerts', name: 'Platform Alerts', nameKey: 'widgets.platformAlerts', info: { descriptionKey: 'widgetInfo.platformAlerts.desc', sourceKey: 'widgetInfo.platformAlerts.source', calculationKey: 'widgetInfo.platformAlerts.calc' }, icon: AlertTriangle, category: 'card', defaultW: 4, defaultH: 5, minW: 3, minH: 3, module: 'monitoring', dataGroup: 'core', requiredPermission: 'quality:read', component: withSuspense(AlertFeedWidget) },

    // Outcome Intelligence (C1)
    { id: 'conversion-rate', name: 'Conversion Rate', nameKey: 'widgets.conversionRate', info: { descriptionKey: 'widgetInfo.conversionRate.desc', sourceKey: 'widgetInfo.conversionRate.source', calculationKey: 'widgetInfo.conversionRate.calc' }, icon: TrendingUp, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: ConversionRateStatWidget },
    { id: 'ai-accuracy', name: 'AI Prediction Accuracy', nameKey: 'widgets.aiAccuracy', info: { descriptionKey: 'widgetInfo.aiAccuracy.desc', sourceKey: 'widgetInfo.aiAccuracy.source', calculationKey: 'widgetInfo.aiAccuracy.calc' }, icon: Target, category: 'stat', defaultW: 3, defaultH: 2, minW: 2, minH: 2, module: 'qi', dataGroup: 'analytics', requiredPermission: 'reports:read', component: AIAccuracyStatWidget },
    { id: 'outcome-distribution', name: 'Outcome Distribution', nameKey: 'widgets.outcomeDistribution', info: { descriptionKey: 'widgetInfo.outcomeDistribution.desc', sourceKey: 'widgetInfo.outcomeDistribution.source', calculationKey: 'widgetInfo.outcomeDistribution.calc' }, icon: PieChart, category: 'chart', defaultW: 3, defaultH: 5, minW: 3, minH: 4, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(OutcomeDistributionWidget) },
    { id: 'outcome-trends', name: 'Outcome Trends', nameKey: 'widgets.outcomeTrends', info: { descriptionKey: 'widgetInfo.outcomeTrends.desc', sourceKey: 'widgetInfo.outcomeTrends.source', calculationKey: 'widgetInfo.outcomeTrends.calc' }, icon: TrendingUp, category: 'chart', defaultW: 6, defaultH: 5, minW: 4, minH: 4, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(OutcomeTrendsWidget) },
    { id: 'outcome-quality', name: 'Outcome x Quality', nameKey: 'widgets.outcomeQuality', info: { descriptionKey: 'widgetInfo.outcomeQuality.desc', sourceKey: 'widgetInfo.outcomeQuality.source', calculationKey: 'widgetInfo.outcomeQuality.calc' }, icon: Activity, category: 'chart', defaultW: 6, defaultH: 5, minW: 4, minH: 4, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(OutcomeQualityWidget) },
    { id: 'outcome-duration', name: 'Outcome x Duration', nameKey: 'widgets.outcomeDuration', info: { descriptionKey: 'widgetInfo.outcomeDuration.desc', sourceKey: 'widgetInfo.outcomeDuration.source', calculationKey: 'widgetInfo.outcomeDuration.calc' }, icon: Timer, category: 'chart', defaultW: 6, defaultH: 5, minW: 4, minH: 4, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(OutcomeDurationWidget) },
    { id: 'outcome-sentiment', name: 'Outcome x Sentiment', nameKey: 'widgets.outcomeSentiment', info: { descriptionKey: 'widgetInfo.outcomeSentiment.desc', sourceKey: 'widgetInfo.outcomeSentiment.source', calculationKey: 'widgetInfo.outcomeSentiment.calc' }, icon: SmilePlus, category: 'chart', defaultW: 6, defaultH: 4, minW: 4, minH: 3, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(OutcomeSentimentWidget) },
    { id: 'top-closers', name: 'Top Closers', nameKey: 'widgets.topClosers', info: { descriptionKey: 'widgetInfo.topClosers.desc', sourceKey: 'widgetInfo.topClosers.source', calculationKey: 'widgetInfo.topClosers.calc' }, icon: Trophy, category: 'card', defaultW: 4, defaultH: 5, minW: 3, minH: 3, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(TopClosersWidget) },
    { id: 'outcome-talk', name: 'Outcome x Talk Pattern', nameKey: 'widgets.outcomeTalk', info: { descriptionKey: 'widgetInfo.outcomeTalk.desc', sourceKey: 'widgetInfo.outcomeTalk.source', calculationKey: 'widgetInfo.outcomeTalk.calc' }, icon: Mic, category: 'chart', defaultW: 6, defaultH: 4, minW: 4, minH: 3, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(OutcomeTalkWidget) },
    { id: 'ai-cost-roi', name: 'AI Prediction ROI', nameKey: 'widgets.aiCostRoi', info: { descriptionKey: 'widgetInfo.aiCostRoi.desc', sourceKey: 'widgetInfo.aiCostRoi.source', calculationKey: 'widgetInfo.aiCostRoi.calc' }, icon: Coins, category: 'card', defaultW: 3, defaultH: 5, minW: 3, minH: 3, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(AICostROIWidget) },
    { id: 'roi-summary', name: 'ROI Summary', nameKey: 'widgets.roiSummary', info: { descriptionKey: 'widgetInfo.roiSummary.desc', sourceKey: 'widgetInfo.roiSummary.source', calculationKey: 'widgetInfo.roiSummary.calc' }, icon: TrendingUp, category: 'card', defaultW: 3, defaultH: 5, minW: 3, minH: 3, module: 'analytics', dataGroup: 'analytics', requiredPermission: 'reports:read', component: withSuspense(ROISummaryWidget) },

    // Bento Grid
    { id: 'bento-overview', name: 'Bento Overview', nameKey: 'widgets.bentoOverview', info: { descriptionKey: 'widgetInfo.bentoOverview.desc', sourceKey: 'widgetInfo.bentoOverview.source', calculationKey: 'widgetInfo.bentoOverview.calc' }, icon: BarChart3, category: 'card', defaultW: 12, defaultH: 8, minW: 6, minH: 4, module: 'analytics', dataGroup: 'core', requiredPermission: 'reports:read', component: withSuspense(BentoGridWidget) },

    // WOW Features
    { id: 'leaderboard-wall', name: 'Agent Leaderboard', nameKey: 'widgets.leaderboardWall', info: { descriptionKey: 'widgetInfo.leaderboardWall.desc', sourceKey: 'widgetInfo.leaderboardWall.source', calculationKey: 'widgetInfo.leaderboardWall.calc' }, icon: Trophy, category: 'card', defaultW: 4, defaultH: 6, minW: 3, minH: 4, module: 'dashboard', dataGroup: 'core', component: withSuspense(LeaderboardWallWidget) },

    // Directional Widgets (Inbound / Outbound)
    { id: 'inbound-overview', name: 'Inbound Overview', nameKey: 'widgets.inboundOverview', info: { descriptionKey: 'widgetInfo.inboundOverview.desc', sourceKey: 'widgetInfo.inboundOverview.source', calculationKey: 'widgetInfo.inboundOverview.calc' }, icon: PhoneIncoming, category: 'card', defaultW: 6, defaultH: 3, minW: 3, minH: 3, module: 'calls', dataGroup: 'core', component: withSuspense(InboundWidgetLazy) },
    { id: 'outbound-overview', name: 'Outbound Overview', nameKey: 'widgets.outboundOverview', info: { descriptionKey: 'widgetInfo.outboundOverview.desc', sourceKey: 'widgetInfo.outboundOverview.source', calculationKey: 'widgetInfo.outboundOverview.calc' }, icon: PhoneOutgoing, category: 'card', defaultW: 6, defaultH: 3, minW: 3, minH: 3, module: 'calls', dataGroup: 'core', component: withSuspense(OutboundWidgetLazy) },

    // DID/CID & Volume
    { id: 'did-cid-dist', name: 'DID / CID Distribution', nameKey: 'widgets.didCidDist', info: { descriptionKey: 'widgetInfo.didCid.desc', sourceKey: 'widgetInfo.didCid.source', calculationKey: 'widgetInfo.didCid.calc' }, icon: Phone, category: 'chart', defaultW: 6, defaultH: 5, minW: 4, minH: 4, module: 'calls', dataGroup: 'core', component: withSuspense(DidCidWidget) },
    { id: 'hourly-volume', name: 'Hourly Call Volume', nameKey: 'widgets.hourlyVolume', info: { descriptionKey: 'widgetInfo.hourlyVolume.desc', sourceKey: 'widgetInfo.hourlyVolume.source', calculationKey: 'widgetInfo.hourlyVolume.calc' }, icon: Clock, category: 'chart', defaultW: 6, defaultH: 4, minW: 4, minH: 3, module: 'calls', dataGroup: 'core', component: withSuspense(HourlyVolumeWidget) },
    { id: 'duration-dist', name: 'Duration Distribution', nameKey: 'widgets.durationDist', info: { descriptionKey: 'widgetInfo.durationDist.desc', sourceKey: 'widgetInfo.durationDist.source', calculationKey: 'widgetInfo.durationDist.calc' }, icon: Timer, category: 'chart', defaultW: 6, defaultH: 4, minW: 3, minH: 3, module: 'calls', dataGroup: 'core', component: withSuspense(DurationDistWidget) },
];

export const WIDGET_MAP = new Map(WIDGET_REGISTRY.map(w => [w.id, w]));

// ──── Preset Views ────

const OVERVIEW_WIDGET_IDS = [
    'active-calls', 'total-calls', 'avg-duration', 'clients-users',
    'inbound-overview', 'outbound-overview',
    'did-cid-dist', 'hourly-volume', 'duration-dist',
    'operations', 'platform-alerts',
];

const QUALITY_WIDGET_IDS = [
    'avg-mos', 'total-analyzed', 'poor-quality', 'regions-count',
    'sip-errors', 'acd-asr',
    'mos-distribution', 'codec-performance',
    'quality-trends',
    'regional-quality', 'worst-calls',
    'traffic-origins',
    'live-calls',
];

const SALES_WIDGET_IDS = [
    'conversion-rate', 'ai-accuracy',
    'outcome-distribution', 'outcome-trends',
    'outcome-quality', 'outcome-duration',
    'outcome-sentiment', 'top-closers',
    'outcome-talk', 'ai-cost-roi',
    'roi-summary', 'bento-overview',
    'leaderboard-wall',
];

const ALL_WIDGET_IDS = WIDGET_REGISTRY.map(w => w.id);

/** 内置preset定义, layout运行时生成 */
export const PRESET_VIEWS_DEF: { id: string; name: string; nameKey: string; icon: string; widgetIds: string[] }[] = [
    { id: 'overview', name: 'Overview', nameKey: 'dashboard.views.overview', icon: 'LayoutDashboard', widgetIds: OVERVIEW_WIDGET_IDS },
    { id: 'network-qos', name: 'Network QoS', nameKey: 'dashboard.views.networkQos', icon: 'Wifi', widgetIds: QUALITY_WIDGET_IDS },
    { id: 'sales', name: 'Sales Intelligence', nameKey: 'dashboard.views.sales', icon: 'TrendingUp', widgetIds: SALES_WIDGET_IDS },
    { id: 'all', name: 'All Widgets', nameKey: 'dashboard.views.all', icon: 'Grid3x3', widgetIds: ALL_WIDGET_IDS },
];

/** 构建所有preset view */
function buildPresetViews(): DashboardView[] {
    return PRESET_VIEWS_DEF.map(def => ({
        id: def.id,
        name: def.name,
        icon: def.icon,
        builtIn: true,
        widgetIds: [...def.widgetIds],
        layouts: generateDefaultLayout(def.widgetIds),
    }));
}

/** Fallback UUID generator for non-secure contexts where crypto.randomUUID is unavailable */
function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/** 空白自定义view */
export function createEmptyView(name: string): DashboardView {
    return {
        id: generateUUID(),
        name,
        builtIn: false,
        widgetIds: [],
        layouts: { lg: [], md: [], sm: [] },
    };
}

/** 默认views state, Overview激活 */
export function getDefaultViewsState(): DashboardViewsState {
    return {
        activeViewId: 'overview',
        views: buildPresetViews(),
    };
}

/** 历史兼容 */
export const DEFAULT_WIDGET_IDS = ALL_WIDGET_IDS;

/**
 * Find the best (x, y) position for a widget of size (w × h)
 * among existing layout items in a grid with `cols` columns.
 *
 * Algorithm: scan row-by-row, left-to-right, and return the first
 * gap where the widget fits without overlapping any existing item.
 */
export function findBestPosition(
    existingItems: { x: number; y: number; w: number; h: number }[],
    widgetW: number,
    widgetH: number,
    cols: number = 12,
): { x: number; y: number } {
    if (existingItems.length === 0) return { x: 0, y: 0 };

    // Determine the height of the occupied area
    let maxY = 0;
    for (const item of existingItems) {
        maxY = Math.max(maxY, item.y + item.h);
    }

    // Build a boolean grid: occupied[row][col]
    const rows = maxY + widgetH + 1;
    const occupied: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (const item of existingItems) {
        for (let r = item.y; r < Math.min(item.y + item.h, rows); r++) {
            for (let c = item.x; c < Math.min(item.x + item.w, cols); c++) {
                occupied[r][c] = true;
            }
        }
    }

    // Scan for the first gap that fits widgetW × widgetH
    for (let r = 0; r <= rows - widgetH; r++) {
        for (let c = 0; c <= cols - widgetW; c++) {
            let fits = true;
            outer:
            for (let dr = 0; dr < widgetH; dr++) {
                for (let dc = 0; dc < widgetW; dc++) {
                    if (occupied[r + dr][c + dc]) { fits = false; break outer; }
                }
            }
            if (fits) return { x: c, y: r };
        }
    }

    // Fallback: place below everything
    return { x: 0, y: maxY };
}

/**
 * Re-arrange all widgets using bin-packing, preserving widget order.
 * Resets each widget to at least its default dimensions so
 * manually-shrunk widgets are restored to a usable size.
 */
export function autoArrangeLayout(
    widgetIds: string[],
    currentLayouts: Record<string, any[]>,
    cols: Record<string, number> = { lg: 12, md: 12, sm: 6 },
): Record<string, any[]> {
    const result: Record<string, any[]> = {};

    for (const [bp, items] of Object.entries(currentLayouts)) {
        const bpCols = cols[bp] ?? 12;
        const arranged: any[] = [];

        // Use widgetIds order so the result is deterministic
        for (const id of widgetIds) {
            const existing = (items as any[]).find((item: any) => item.i === id);
            if (!existing) continue;
            const def = WIDGET_MAP.get(id);
            // Restore to at least default dimensions
            const w = Math.min(def ? Math.max(existing.w, def.defaultW) : existing.w, bpCols);
            const h = def ? Math.max(existing.h, def.defaultH) : existing.h;
            const pos = findBestPosition(arranged, w, h, bpCols);
            arranged.push({ ...existing, x: pos.x, y: pos.y, w, h, minW: def?.minW, minH: def?.minH });
        }

        result[bp] = arranged;
    }

    return result;
}

export function generateDefaultLayout(widgetIds: string[]): Record<string, any[]> {
    const lgItems: any[] = [];
    const smItems: any[] = [];

    for (const id of widgetIds) {
        const def = WIDGET_MAP.get(id);
        if (!def) continue;

        // lg / md — 12 columns
        const lgPos = findBestPosition(lgItems, def.defaultW, def.defaultH, 12);
        lgItems.push({ i: id, x: lgPos.x, y: lgPos.y, w: def.defaultW, h: def.defaultH, minW: def.minW, minH: def.minH });

        // sm — 6 columns, clamp width
        const smW = Math.min(def.defaultW, 6);
        const smPos = findBestPosition(smItems, smW, def.defaultH, 6);
        smItems.push({ i: id, x: smPos.x, y: smPos.y, w: smW, h: def.defaultH, minW: def.minW, minH: def.minH });
    }

    return { lg: lgItems, md: [...lgItems], sm: smItems };
}
