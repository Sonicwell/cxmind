import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';

const BUCKET_COLORS: Record<string, string> = {
    'Poor (<2)': '#ef4444',
    'Fair (2-3)': '#f59e0b',
    'Good (3-4)': '#3b82f6',
    'Excellent (4+)': '#10b981',
};

const OutcomeQualityWidget: React.FC = () => {
    const { t } = useTranslation();
    const { outcomeByQuality } = useDashboardAnalytics();

    const data = useMemo(() =>
        outcomeByQuality.map(d => {
            let translatedBucket = d.bucket;
            if (d.bucket === 'Poor (<2)') translatedBucket = t('dashboard.qualityPoor', 'Poor (<2)');
            else if (d.bucket === 'Fair (2-3)') translatedBucket = t('dashboard.qualityFair', 'Fair (2-3)');
            else if (d.bucket === 'Good (3-4)') translatedBucket = t('dashboard.qualityGood', 'Good (3-4)');
            else if (d.bucket === 'Excellent (4+)') translatedBucket = t('dashboard.qualityExcellent', 'Excellent (4+)');

            return {
                ...d,
                translatedBucket,
                rate_pct: Math.round(d.rate * 100),
            };
        }),
        [outcomeByQuality, t]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title" style={{ margin: '0 0 8px' }}>
                <Activity size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.outcomeQualityTitle', 'Outcome × Quality')}
            </h3>
            {data.length > 0 ? (
                <ChartContainer>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis dataKey="translatedBucket" stroke="var(--text-muted)" fontSize={11} />
                        <YAxis stroke="var(--text-muted)" fontSize={12} unit="%" domain={[0, 100]} />
                        <Tooltip
                            contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                            formatter={((value: any, name: any) => {
                                if (name === 'Conversion %' || name === t('dashboard.conversionPct', 'Conversion %')) return [`${value}%`, t('dashboard.conversionPct', 'Conversion %')];
                                return [value, name];
                            }) as any}
                        />
                        <Legend />
                        <Bar dataKey="rate_pct" name={t('dashboard.conversionPct', 'Conversion %')} isAnimationActive={false} radius={[4, 4, 0, 0]}>
                            {data.map((entry) => (
                                <Cell key={entry.bucket} fill={BUCKET_COLORS[entry.bucket] || '#8b5cf6'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            ) : (
                <div className="cq-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('dashboard.noQualityData', 'No quality data')}</div>
            )}
        </div>
    );
};

export default OutcomeQualityWidget;
