import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal } from '../ui/GlassModal';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, PieChart, Pie, Cell } from 'recharts';
import { auditService } from '../../services/auditService';
import type { TimelineData, AuditStats, AuditLog } from '../../types/audit';
import { Activity, PieChart as PieChartIcon, Clock, ShieldAlert } from 'lucide-react';

interface OperatorProfileProps {
    isOpen: boolean;
    onClose: () => void;
    operatorId: string;
    operatorName: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export const OperatorProfile: React.FC<OperatorProfileProps> = ({
    isOpen,
    onClose,
    operatorId,
    operatorName
}) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [timeline, setTimeline] = useState<TimelineData[]>([]);
    const [stats, setStats] = useState<AuditStats[]>([]);
    const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);

    useEffect(() => {
        if (!isOpen || !operatorId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const [timelineData, statsData, logsData] = await Promise.all([
                    auditService.getTimeline(operatorId),
                    auditService.getStats(undefined, undefined, operatorId),
                    auditService.getLogs({ operator_id: operatorId, limit: 10 })
                ]);
                setTimeline(timelineData);
                setStats(statsData.stats);
                setRecentLogs(logsData.logs);
            } catch (error) {
                console.error("Failed to fetch operator profile data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen, operatorId]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-sm rounded-lg shadow-lg">
                    <p className="text-[var(--text-secondary)] mb-1">{label}</p>
                    <p className="text-[var(--text-primary)] font-medium">
                        {payload[0].name}: {payload[0].value}
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <GlassModal
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            title={`${t('audit.operatorProfile', 'Operator Profile')}: ${operatorName}`}
            className="max-w-[800px] h-[85vh] flex flex-col"
        >
            <div className="flex-1 overflow-y-auto space-y-lg p-sm">
                {loading ? (
                    <div className="flex justify-center items-center h-48 text-[var(--text-muted)]">
                        <Activity className="animate-spin mr-2" />
                        {t('common.loading', 'Loading...')}
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                            {/* Activity Timeline */}
                            <div className="glass-panel p-md rounded-xl border border-[var(--glass-border)] bg-[var(--bg-secondary)]/30">
                                <h3 className="text-sm font-medium flex items-center gap-2 mb-md text-[var(--text-secondary)]">
                                    <Activity size={16} />
                                    {t('audit.activityTimeline', 'Activity Timeline (24h)')}
                                </h3>
                                <div className="h-48">
                                    {timeline.length > 0 && timeline.some(t => t.count > 0) ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={timeline}>
                                                <XAxis
                                                    dataKey="hour"
                                                    stroke="var(--text-muted)"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={(val) => `${val}:00`}
                                                />
                                                <YAxis
                                                    stroke="var(--text-muted)"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    allowDecimals={false}
                                                />
                                                <RechartsTooltip content={<CustomTooltip />} />
                                                <Line
                                                    type="monotone"
                                                    dataKey="count"
                                                    name={t('audit.actions', 'Actions')}
                                                    stroke="var(--primary)"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    activeDot={{ r: 4, fill: "var(--primary)" }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                                            {t('audit.noActivity', 'No recent activity')}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Category Distribution */}
                            <div className="glass-panel p-md rounded-xl border border-[var(--glass-border)] bg-[var(--bg-secondary)]/30">
                                <h3 className="text-sm font-medium flex items-center gap-2 mb-md text-[var(--text-secondary)]">
                                    <PieChartIcon size={16} />
                                    {t('audit.categoryDistribution', 'Category Distribution')}
                                </h3>
                                <div className="h-48 flex items-center">
                                    {stats.length > 0 ? (
                                        <>
                                            <div className="flex-1 h-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={stats}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={40}
                                                            outerRadius={70}
                                                            paddingAngle={2}
                                                            dataKey="count"
                                                        >
                                                            {stats.map((_, index) => (
                                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                            ))}
                                                        </Pie>
                                                        <RechartsTooltip content={<CustomTooltip />} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="w-1/3 space-y-2 overflow-y-auto max-h-full pl-2">
                                                {stats.map((entry, index) => (
                                                    <div key={entry.category} className="flex items-center text-xs">
                                                        <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                        <span className="truncate text-[var(--text-secondary)] mr-1" title={entry.category}>
                                                            {entry.category.replace('_', ' ')}
                                                        </span>
                                                        <span className="ml-auto font-medium text-[var(--text-primary)]">{entry.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full text-center text-[var(--text-muted)] text-sm">
                                            {t('audit.noData', 'No data available')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Recent High-Risk Logs */}
                        <div className="glass-panel p-md rounded-xl border border-[var(--glass-border)] bg-[var(--bg-secondary)]/30">
                            <h3 className="text-sm font-medium flex items-center gap-2 mb-md text-[var(--text-secondary)]">
                                <ShieldAlert size={16} className="text-orange-500" />
                                {t('audit.recentOperations', 'Recent Operations')}
                            </h3>
                            <div className="space-y-3">
                                {recentLogs.length > 0 ? (
                                    recentLogs.map((log, i) => (
                                        <div key={i} className="flex items-start gap-4 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)]/50 hover:bg-[var(--bg-overlay)] transition-colors">
                                            <div className="pt-1 text-[var(--text-muted)]">
                                                <Clock size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-sm text-[var(--text-primary)]">{log.action}</span>
                                                    <span className="text-xs px-2 py-0.5 rounded-full border border-current opacity-80" style={{ color: COLORS[stats.findIndex(s => s.category === log.category) % COLORS.length] || 'var(--text-secondary)' }}>
                                                        {log.category.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-[var(--text-secondary)] truncate">
                                                    Target: {log.target_name || log.target_id || '-'}
                                                </div>
                                                <div className="text-xs text-[var(--text-muted)] mt-1">
                                                    {new Date(log.timestamp).toLocaleString()} • IP: {log.ip_address}
                                                </div>
                                            </div>
                                            <div className={`text-xs px-2 py-1 rounded-md ${log.success === 1 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {log.success === 1 ? 'Success' : 'Failed'}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-[var(--text-muted)] text-sm">
                                        {t('audit.noLogsFound', 'No logs found')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </GlassModal>
    );
};
