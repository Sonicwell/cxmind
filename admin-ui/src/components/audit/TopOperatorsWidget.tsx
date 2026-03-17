import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { LeaderboardData } from '../../types/audit';
import { useTranslation } from 'react-i18next';
import WidgetInfoTooltip from '../ui/WidgetInfoTooltip';

interface TopOperatorsWidgetProps {
    data: LeaderboardData[];
    loading?: boolean;
}

const TopOperatorsWidget: React.FC<TopOperatorsWidgetProps> = ({ data, loading = false }) => {
    const { t } = useTranslation();
    if (loading) {
        return (
            <div className="glass-panel audit-chart-panel">
                <h3><TrendingUp size={18} style={{ color: 'var(--primary)' }} /> {t('audit.topActiveUsers')}</h3>
                <div className="chart-empty">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="glass-panel audit-chart-panel">
                <h3><TrendingUp size={18} style={{ color: 'var(--primary)' }} /> {t('audit.topActiveUsers')}</h3>
                <div className="chart-empty">{t('audit.noUserActivity')}</div>
            </div>
        );
    }

    const chartData = data.map((item) => ({
        name: item.operator_name,
        actions: item.total_actions,
        categories: item.categories_count,
    }));

    return (
        <div className="glass-panel audit-chart-panel" style={{ position: 'relative' }}>
            <WidgetInfoTooltip info={{
                descriptionKey: 'widgetInfo.auditTopOperators.desc',
                sourceKey: 'widgetInfo.auditTopOperators.source',
                calculationKey: 'widgetInfo.auditTopOperators.calc',
            }} />
            <h3><TrendingUp size={18} style={{ color: 'var(--primary)' }} /> {t('audit.topActiveUsers')}</h3>
            <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis
                        type="number"
                        stroke="var(--text-muted)"
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        type="category"
                        dataKey="name"
                        stroke="var(--text-muted)"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        width={110}
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
                    <Bar dataKey="actions" fill="#818cf8" radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default TopOperatorsWidget;
