import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { TimelineData } from '../../types/audit';
import { useTranslation } from 'react-i18next';
import WidgetInfoTooltip from '../ui/WidgetInfoTooltip';

interface AuditTimelineChartProps {
    data: TimelineData[];
    loading?: boolean;
}

const AuditTimelineChart: React.FC<AuditTimelineChartProps> = ({ data, loading = false }) => {
    const { t } = useTranslation();
    if (loading) {
        return (
            <div className="glass-panel audit-chart-panel">
                <h3>{t('audit.activityTimeline')}</h3>
                <div className="chart-empty">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="glass-panel audit-chart-panel">
                <h3>{t('audit.activityTimeline')}</h3>
                <div className="chart-empty">{t('audit.noTimelineData')}</div>
            </div>
        );
    }

    const chartData = data.map((item) => ({
        hour: `${item.hour}:00`,
        events: item.count,
    }));

    return (
        <div className="glass-panel audit-chart-panel" style={{ position: 'relative' }}>
            <WidgetInfoTooltip info={{
                descriptionKey: 'widgetInfo.auditTimeline.desc',
                sourceKey: 'widgetInfo.auditTimeline.source',
                calculationKey: 'widgetInfo.auditTimeline.calc',
            }} />
            <h3>{t('audit.activityTimeline')}</h3>
            <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                        dataKey="hour"
                        stroke="var(--text-muted)"
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        stroke="var(--text-muted)"
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'rgba(15, 23, 42, 0.92)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            color: '#e2e8f0',
                            fontSize: '0.78rem',
                        }}
                        cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                    />
                    <Legend
                        wrapperStyle={{ color: 'var(--text-muted)' }}
                        formatter={() => <span style={{ color: 'var(--text-secondary)' }}>{t('audit.events')}</span>}
                    />
                    <Bar dataKey="events" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default AuditTimelineChart;
