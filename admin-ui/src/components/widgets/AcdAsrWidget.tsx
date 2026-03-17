import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend,
} from 'recharts';
import { useDashboardCore } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';

const AcdAsrWidget: React.FC = () => {
    const { t } = useTranslation();
    const { chartData } = useDashboardCore();

    // ACD秒数 → MM:SS
    const fmtAcd = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.round(sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tooltipFormatter = (value: any, name: any) => {
        const v = Number(value) || 0;
        const n = String(name || '');
        if (n.startsWith('ACD')) return [fmtAcd(v), n];
        if (n.startsWith('ASR')) return [`${v.toFixed(1)}%`, n];
        return [v, n];
    };

    const chartContent = useMemo(() => (
        <ChartContainer>
            <LineChart data={chartData?.quality}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} />
                <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={11} tickFormatter={fmtAcd} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" domain={[0, 100]} fontSize={11} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} formatter={tooltipFormatter} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="acd" stroke="#ff7300" name="ACD (MM:SS)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="asr" stroke="#387908" name="ASR (%)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
        </ChartContainer>
    ), [chartData?.quality]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">{t('acd.title', 'ACD / ASR (3h)')}</h3>
            {chartData?.quality && chartData.quality.length > 0 ? chartContent : (
                <div className="dash-empty-msg" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('common.noData', 'No data')}</span>
                </div>
            )}
        </div>
    );
};

export default AcdAsrWidget;
