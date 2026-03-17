import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';

const PATTERN_COLORS: Record<string, string> = {
    'Listen-heavy (<30%)': '#6366f1',
    'Balanced (30-50%)': '#10b981',
    'Talk-dominant (50-70%)': '#f59e0b',
    'Monologue (>70%)': '#ef4444',
};

const OutcomeTalkWidget: React.FC = () => {
    const { t } = useTranslation();
    const { outcomeByTalkPattern } = useDashboardAnalytics();

    const data = useMemo(() =>
        outcomeByTalkPattern.map(d => {
            let translatedBucket = d.bucket;
            if (d.bucket === 'Listen-heavy (<30%)') translatedBucket = t('dashboard.talkPatternListen', 'Listen-heavy (<30%)');
            else if (d.bucket === 'Balanced (30-50%)') translatedBucket = t('dashboard.talkPatternBalanced', 'Balanced (30-50%)');
            else if (d.bucket === 'Talk-dominant (50-70%)') translatedBucket = t('dashboard.talkPatternTalk', 'Talk-dominant (50-70%)');
            else if (d.bucket === 'Monologue (>70%)') translatedBucket = t('dashboard.talkPatternMonologue', 'Monologue (>70%)');

            return {
                ...d,
                translatedBucket,
                rate_pct: Math.round(d.rate * 100),
            };
        }),
        [outcomeByTalkPattern, t]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title" style={{ margin: '0 0 8px' }}>
                <Mic size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.outcomeTalkTitle', 'Outcome × Talk Pattern')}
            </h3>
            {data.length > 0 ? (
                <ChartContainer>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis dataKey="translatedBucket" stroke="var(--text-muted)" fontSize={10} />
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
                                <Cell key={entry.bucket} fill={PATTERN_COLORS[entry.bucket] || '#8b5cf6'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{t('dashboard.noTalkData', 'No talk pattern data')}</div>
            )}
        </div>
    );
};

export default OutcomeTalkWidget;
