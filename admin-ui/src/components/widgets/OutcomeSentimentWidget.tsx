import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SmilePlus } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';

const SENTIMENT_COLORS: Record<string, string> = {
    positive: '#10b981',
    neutral: '#6366f1',
    negative: '#ef4444',
};

const SENTIMENT_LABELS: Record<string, string> = {
    positive: '😊 Positive',
    neutral: '😐 Neutral',
    negative: '😞 Negative',
};

const OutcomeSentimentWidget: React.FC = () => {
    const { t } = useTranslation();
    const { outcomeBySentiment } = useDashboardAnalytics();

    const data = useMemo(() =>
        outcomeBySentiment.map(d => {
            let label = SENTIMENT_LABELS[d.bucket] || d.bucket;
            if (d.bucket === 'positive') label = t('dashboard.sentimentPositive', '😊 Positive');
            else if (d.bucket === 'neutral') label = t('dashboard.sentimentNeutral', '😐 Neutral');
            else if (d.bucket === 'negative') label = t('dashboard.sentimentNegative', '😞 Negative');

            return {
                ...d,
                label,
                rate_pct: Math.round(d.rate * 100),
            };
        }),
        [outcomeBySentiment, t]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title" style={{ margin: '0 0 8px' }}>
                <SmilePlus size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.outcomeSentimentTitle', 'Outcome × Sentiment')}
            </h3>
            {data.length > 0 ? (
                <ChartContainer>
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis type="number" stroke="var(--text-muted)" fontSize={12} unit="%" domain={[0, 100]} />
                        <YAxis type="category" dataKey="label" stroke="var(--text-muted)" fontSize={12} width={100} />
                        <Tooltip
                            contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                            formatter={((value: any, name: any) => {
                                if (name === 'Conversion %' || name === t('dashboard.conversionPct', 'Conversion %')) return [`${value}%`, t('dashboard.conversionPct', 'Conversion %')];
                                return [value, name];
                            }) as any}
                        />
                        <Legend />
                        <Bar dataKey="rate_pct" name={t('dashboard.conversionPct', 'Conversion %')} isAnimationActive={false} radius={[0, 4, 4, 0]}>
                            {data.map((entry) => (
                                <Cell key={entry.label} fill={SENTIMENT_COLORS[entry.bucket] || '#8b5cf6'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{t('dashboard.noSentimentData', 'No sentiment data')}</div>
            )}
        </div>
    );
};

export default OutcomeSentimentWidget;
