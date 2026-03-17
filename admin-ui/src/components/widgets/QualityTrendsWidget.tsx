import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend,
} from 'recharts';
import { useDashboardCore, useDashboardQuality } from '../../dashboard/DashboardContext';
import { TIME_OPTIONS } from '../../dashboard/helpers';
import ChartContainer from './ChartContainer';
import { Button } from '../ui/button';

const QualityTrendsWidget: React.FC = () => {
    const { t } = useTranslation();
    const { hours, setHours } = useDashboardCore();
    const { trends } = useDashboardQuality();

    const chartContent = useMemo(() => (
        <ChartContainer>
            <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} />
                <YAxis yAxisId="mos" stroke="var(--text-muted)" domain={[0, 5]} label={{ value: 'MOS', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="pct" orientation="right" stroke="var(--text-muted)" label={{ value: 'Loss %', angle: 90, position: 'insideRight' }} />
                <YAxis yAxisId="ms" hide />
                <Tooltip
                    contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                    formatter={((value: any, name: any) => {
                        if (name === 'MOS') return [value.toFixed(2), name];
                        if (name === 'Loss %') return [(value * 100).toFixed(2) + '%', name];
                        if (name === 'Jitter (ms)') return [value.toFixed(1) + 'ms', name];
                        if (name === 'RTT (ms)') return [value.toFixed(1) + 'ms', name];
                        return [value, name];
                    }) as any}
                />
                <Legend />
                <Line yAxisId="mos" type="monotone" dataKey="avg_mos" stroke="#8b5cf6" name="MOS" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="pct" type="monotone" dataKey="avg_loss" stroke="#ef4444" name="Loss %" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line yAxisId="ms" type="monotone" dataKey="avg_jitter" stroke="#f59e0b" name="Jitter (ms)" strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line yAxisId="ms" type="monotone" dataKey="avg_rtt" stroke="#10b981" name="RTT (ms)" strokeWidth={1} dot={false} strokeDasharray="4 2" isAnimationActive={false} />
            </LineChart>
        </ChartContainer>
    ), [trends]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 className="widget-title" style={{ margin: 0 }}>
                    <TrendingDown size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                    {t('qualityTrends.title', 'Quality Trends')}
                </h3>
                <div className="cq-time-filter" style={{ transform: 'scale(0.85)', transformOrigin: 'right center' }}>
                    {TIME_OPTIONS.map(opt => (
                        <Button key={opt.value} className={hours === opt.value ? 'active' : ''} onClick={() => setHours(opt.value)}>
                            {opt.label}
                        </Button>
                    ))}
                </div>
            </div>
            {trends.length > 0 ? chartContent : (<div className="cq-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('common.noData', 'No data')}</div>)}
        </div>
    );
};

export default QualityTrendsWidget;
