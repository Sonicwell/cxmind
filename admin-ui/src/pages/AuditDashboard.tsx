import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw, Download } from 'lucide-react';
import AuditStatsCards from '../components/audit/AuditStatsCards';
import AuditCategoryChart from '../components/audit/AuditCategoryChart';
import AuditTimelineChart from '../components/audit/AuditTimelineChart';
import TopOperatorsWidget from '../components/audit/TopOperatorsWidget';
import RecentAuditLogs from '../components/audit/RecentAuditLogs';
import auditService from '../services/auditService';
import type { AuditLog, AuditStats, TimelineData, LeaderboardData } from '../types/audit';
import { MotionButton } from '../components/ui/MotionButton';
import { useDemoMode } from '../hooks/useDemoMode';
import { getMockAuditDashboard } from '../services/mock-data';
import '../styles/audit-dashboard.css';
import { useTranslation } from 'react-i18next';

const AuditDashboard: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Stats
    const [totalEvents, setTotalEvents] = useState(0);
    const [todayEvents, setTodayEvents] = useState(0);
    const [activeUsers, setActiveUsers] = useState(0);
    const [failedLogins, setFailedLogins] = useState(0);

    // Charts data
    const [categoryStats, setCategoryStats] = useState<AuditStats[]>([]);
    const [timelineData, setTimelineData] = useState<TimelineData[]>([]);
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardData[]>([]);
    const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);

    const fetchDashboardData = async () => {
        try {
            setRefreshing(true);

            if (demoMode) {
                const mock = getMockAuditDashboard();
                setTotalEvents(mock.summary.total_events);
                setTodayEvents(mock.summary.today_activity);
                setActiveUsers(mock.summary.active_users);
                setFailedLogins(mock.summary.failed_logins);
                setCategoryStats(mock.stats);
                setTimelineData(mock.timeline);
                setLeaderboardData(mock.leaderboard);
                setRecentLogs(mock.recent_logs);
            } else {
                const [statsRes, timelineRes, leaderboardRes, logsRes] = await Promise.all([
                    auditService.getStats(),
                    auditService.getTimeline(),
                    auditService.getLeaderboard(10),
                    auditService.getLogs({ limit: 10 }),
                ]);

                const totalCount = statsRes.stats.reduce((sum, stat) => sum + stat.count, 0);
                const uniqueOperators = new Set(
                    statsRes.stats.flatMap(stat => Array(stat.unique_operators).fill(stat.category))
                ).size;
                const authStats = statsRes.stats.find(s => s.category === 'auth');
                const failedCount = authStats ? Math.floor(authStats.count * 0.1) : 0;
                const todayCount = timelineRes.reduce((sum, item) => sum + item.count, 0);

                setTotalEvents(totalCount);
                setTodayEvents(todayCount);
                setActiveUsers(uniqueOperators);
                setFailedLogins(failedCount);
                setCategoryStats(statsRes.stats);
                setTimelineData(timelineRes);
                setLeaderboardData(leaderboardRes);
                setRecentLogs(logsRes.logs);
            }
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const handleRefresh = () => {
        fetchDashboardData();
    };

    const handleExport = async () => {
        try {
            setExporting(true);
            const blob = await auditService.exportToCSV();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Failed to export logs:', error);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="audit-page">
            {/* Header */}
            <div className="audit-page-header">
                <div className="title-group">
                    <Shield size={28} style={{ color: 'var(--primary)' }} />
                    <div>
                        <h1>{t('audit.dashboardTitle')}</h1>
                        <p>{t('audit.dashboardSubtitle')}</p>
                    </div>
                </div>
                <div className="actions">
                    <MotionButton
                        variant="secondary"
                        onClick={handleExport}
                        disabled={exporting}
                        className="flex items-center gap-sm"
                    >
                        <Download size={16} />
                        {exporting ? t('audit.exporting') : t('audit.exportCsv')}
                    </MotionButton>
                    <MotionButton
                        variant="primary"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-sm"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        {t('actions.refresh')}
                    </MotionButton>
                </div>
            </div>

            {/* Stats Cards */}
            <AuditStatsCards
                totalEvents={totalEvents}
                todayEvents={todayEvents}
                activeUsers={activeUsers}
                failedLogins={failedLogins}
                loading={loading}
            />

            {/* Charts Row 1 */}
            <div className="audit-charts-grid">
                <AuditCategoryChart data={categoryStats} loading={loading} />
                <AuditTimelineChart data={timelineData} loading={loading} />
            </div>

            {/* Charts Row 2 */}
            <div className="audit-charts-grid">
                <TopOperatorsWidget data={leaderboardData} loading={loading} />
                <RecentAuditLogs
                    logs={recentLogs}
                    loading={loading}
                    onViewDetails={(log) => {
                        console.log('View details:', log);
                    }}
                />
            </div>
        </div>
    );
};

export default AuditDashboard;
