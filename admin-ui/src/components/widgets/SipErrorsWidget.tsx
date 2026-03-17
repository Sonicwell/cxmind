import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend,
} from 'recharts';
import { useDashboardCore } from '../../dashboard/DashboardContext';
import ChartContainer from './ChartContainer';
import { useTranslation } from 'react-i18next';

const SipErrorsWidget: React.FC = () => {
    const { t } = useTranslation();
    const { chartData } = useDashboardCore();

    const chartContent = useMemo(() => (
        <ChartContainer>
            <AreaChart data={chartData?.sipErrors}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                <Legend />
                <Area type="monotone" dataKey="4xx" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} name="4xx Client" isAnimationActive={false} />
                <Area type="monotone" dataKey="5xx" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} name="5xx Server" isAnimationActive={false} />
                <Area type="monotone" dataKey="RTP_Timeout" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} name="RTP Timeout" isAnimationActive={false} />
                <Area type="monotone" dataKey="SIP_Timeout" stackId="1" stroke="#ec4899" fill="#ec4899" fillOpacity={0.4} name="SIP Timeout" isAnimationActive={false} />
            </AreaChart>
        </ChartContainer>
    ), [chartData?.sipErrors]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <AlertTriangle size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                {t('sipErrors.title', 'SIP Errors & Timeouts (3h)')}
            </h3>
            {chartData?.sipErrors && chartData.sipErrors.length > 0 ? chartContent : (
                <div className="dash-empty-msg" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'var(--success)' }}>✓</span>&nbsp;{t('sipErrors.noErrors', 'No SIP errors in last 3h')}
                </div>
            )}
            {chartData?.topErrorIps && chartData.topErrorIps.length > 0 && (
                <div style={{ padding: '0.4rem 0.6rem', borderTop: '1px solid var(--glass-border)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span style={{ fontWeight: 600, marginRight: 6 }}>Top Error IPs:</span>
                    {chartData.topErrorIps.map((item, i) => (
                        <span key={item.ip} style={{ marginRight: 10, color: i === 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                            {item.ip} ({item.cnt})
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SipErrorsWidget;
