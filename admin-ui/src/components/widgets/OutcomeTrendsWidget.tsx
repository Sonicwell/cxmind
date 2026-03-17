import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';

const COLORS = {
    success: '#10b981',
    failure: '#ef4444',
    follow_up: '#f59e0b',
};

const OutcomeTrendsWidget: React.FC = () => {
    const { t } = useTranslation();
    const { outcomeTrends } = useDashboardAnalytics();

    const data = useMemo(() =>
        outcomeTrends.map(d => ({
            ...d,
            date: d.date.slice(5), // MM-DD
        })),
        [outcomeTrends]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title" style={{ margin: '0 0 8px' }}>
                <TrendingUp size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('outcomeTrends.title', 'Outcome Trends (14d)')}
            </h3>
            {data.length > 0 ? (
                <ChartContainer>
                    <AreaChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
                        <YAxis stroke="var(--text-muted)" fontSize={12} />
                        <Tooltip
                            contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="success" stackId="1" stroke={COLORS.success} fill={COLORS.success} fillOpacity={0.6} name="Success" isAnimationActive={false} />
                        <Area type="monotone" dataKey="failure" stackId="1" stroke={COLORS.failure} fill={COLORS.failure} fillOpacity={0.6} name="Failure" isAnimationActive={false} />
                        <Area type="monotone" dataKey="follow_up" stackId="1" stroke={COLORS.follow_up} fill={COLORS.follow_up} fillOpacity={0.6} name="Follow-up" isAnimationActive={false} />
                    </AreaChart>
                </ChartContainer>
            ) : (
                <div className="cq-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('common.noData', 'No data')}</div>
            )}
        </div>
    );
};

export default OutcomeTrendsWidget;
