import React from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';

const OUTCOME_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6b7280'];

const OutcomeDistributionWidget: React.FC = () => {
    const { t } = useTranslation();
    const { outcomeStats, outcomeLoading } = useDashboardAnalytics();

    const dist = outcomeStats?.distribution;
    const pieData = dist ? [
        { name: t('dashboard.outcomeClosed', 'Closed'), value: dist.success },
        { name: t('dashboard.outcomeLost', 'Lost'), value: dist.failure },
        { name: t('dashboard.outcomeFollowUp', 'Follow-up'), value: dist.follow_up },
        { name: t('dashboard.outcomeUnknown', 'Unknown'), value: dist.unknown },
    ].filter(d => d.value > 0) : [];

    const total = outcomeStats?.total_calls || 0;

    if (outcomeLoading) return <div className="cq-loading">{t('common.loading', 'Loading...')}</div>;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <PieIcon size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.outcomeDistTitle', 'Outcome Distribution')}
            </h3>
            {total > 0 ? (
                <div className="cq-mos-dist" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <ChartContainer>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                                {pieData.map((entry, idx) => (
                                    <Cell key={idx} fill={OUTCOME_COLORS[[
                                        t('dashboard.outcomeClosed', 'Closed'),
                                        t('dashboard.outcomeLost', 'Lost'),
                                        t('dashboard.outcomeFollowUp', 'Follow-up'),
                                        t('dashboard.outcomeUnknown', 'Unknown')
                                    ].indexOf(entry.name)] || OUTCOME_COLORS[3]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                        </PieChart>
                    </ChartContainer>
                    <div className="cq-mos-legend">
                        {pieData.map((item, idx) => (
                            <div key={idx} className="cq-mos-legend-item">
                                <span className="cq-mos-legend-dot" style={{
                                    background: OUTCOME_COLORS[[
                                        t('dashboard.outcomeClosed', 'Closed'),
                                        t('dashboard.outcomeLost', 'Lost'),
                                        t('dashboard.outcomeFollowUp', 'Follow-up'),
                                        t('dashboard.outcomeUnknown', 'Unknown')
                                    ].indexOf(item.name)] || OUTCOME_COLORS[3]
                                }} />
                                <span>{item.name}</span>
                                <span className="cq-mos-legend-value">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (<div className="cq-empty">{t('dashboard.noOutcomeData', 'No outcome data')}</div>)}
        </div>
    );
};

export default OutcomeDistributionWidget;
