import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import ChartContainer from './ChartContainer';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
const LABELS = ['< 30s', '30s–2m', '2–5m', '5m+'];

const DurationDistWidget: React.FC = () => {
    const { t } = useTranslation();
    const [data, setData] = useState<{ label: string; count: number; color: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/platform/duration-distribution')
            .then(res => {
                const d = res.data;
                setData([
                    { label: LABELS[0], count: d.under_30s || 0, color: COLORS[0] },
                    { label: LABELS[1], count: d.s30_to_2m || 0, color: COLORS[1] },
                    { label: LABELS[2], count: d.m2_to_5m || 0, color: COLORS[2] },
                    { label: LABELS[3], count: d.over_5m || 0, color: COLORS[3] },
                ]);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="cq-loading">{t('common.loading', 'Loading...')}</div>;

    const total = data.reduce((s, d) => s + d.count, 0);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <Timer size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.talkTimeDistTitle', 'Talk Time Distribution')} ({t('common.today', 'Today')})
            </h3>
            {total > 0 ? (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <ChartContainer>
                        <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                            <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                                formatter={(value: any) => [value, t('dashboard.toolbar.calls', 'Calls')]}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                {data.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
                        {data.map((d, i) => (
                            <div key={i} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: d.color }}>{d.count}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.label}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                    {total > 0 ? `${((d.count / total) * 100).toFixed(0)}%` : '0%'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="cq-empty">{t('dashboard.noCallData', 'No call data')}</div>
            )}
        </div>
    );
};

export default DurationDistWidget;
