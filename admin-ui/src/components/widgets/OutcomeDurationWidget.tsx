import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';

const OutcomeDurationWidget: React.FC = () => {
    const { t } = useTranslation();
    const { outcomeByDuration } = useDashboardAnalytics();

    const data = useMemo(() =>
        outcomeByDuration.map(d => ({
            ...d,
            rate_pct: Math.round(d.rate * 100),
        })),
        [outcomeByDuration]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title" style={{ margin: '0 0 8px' }}>
                <Clock size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.outcomeDurationTitle', 'Outcome × Duration')}
            </h3>
            {data.length > 0 ? (
                <ChartContainer>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis dataKey="bucket" stroke="var(--text-muted)" fontSize={11} />
                        <YAxis yAxisId="pct" stroke="var(--text-muted)" fontSize={12} unit="%" domain={[0, 100]} />
                        <YAxis yAxisId="count" orientation="right" stroke="var(--text-muted)" fontSize={12} />
                        <Tooltip
                            contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                            formatter={((value: any, name: any) => {
                                if (name === 'Conversion %' || name === t('dashboard.conversionPct', 'Conversion %')) return [`${value}%`, t('dashboard.conversionPct', 'Conversion %')];
                                if (name === 'Total Calls' || name === t('dashboard.totalCalls', 'Total Calls')) return [value, t('dashboard.totalCalls', 'Total Calls')];
                                return [value, name];
                            }) as any}
                        />
                        <Legend />
                        <Bar yAxisId="count" dataKey="total" name={t('dashboard.totalCalls', 'Total Calls')} fill="#6366f1" opacity={0.3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="pct" dataKey="rate_pct" name={t('dashboard.conversionPct', 'Conversion %')} fill="#10b981" isAnimationActive={false} radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ChartContainer>
            ) : (
                <div className="cq-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('dashboard.noDurationData', 'No duration data')}</div>
            )}
        </div>
    );
};

export default OutcomeDurationWidget;
