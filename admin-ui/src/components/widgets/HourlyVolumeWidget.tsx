import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import ChartContainer from './ChartContainer';

interface HourData { hour: number; cnt: string }

const HourlyVolumeWidget: React.FC = () => {
    const { t } = useTranslation();
    const [data, setData] = useState<{ hour: number; calls: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/platform/hourly-volume')
            .then(res => {
                const raw: HourData[] = res.data.data || [];
                const hourMap = new Map(raw.map(d => [Number(d.hour), Number(d.cnt)]));
                // fill 0-23
                const filled = Array.from({ length: 24 }, (_, h) => ({
                    hour: h,
                    calls: hourMap.get(h) || 0,
                }));
                setData(filled);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="cq-loading">{t('common.loading', 'Loading...')}</div>;

    const currentHour = new Date().getHours();

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <Clock size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.hourlyVolumeTitle', 'Hourly Call Volume')} ({t('common.today', 'Today')})
            </h3>
            <div style={{ flex: 1, minHeight: 0 }}>
                <ChartContainer>
                    <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                            tickFormatter={(h: number) => `${h}:00`}
                            interval={2} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                        <Tooltip
                            contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                            formatter={(value: any) => [value, t('dashboard.toolbar.calls', 'Calls')]}
                            labelFormatter={(h: any) => `${h}:00 - ${Number(h) + 1}:00`}
                        />
                        <Bar dataKey="calls" radius={[3, 3, 0, 0]}
                            fill="var(--primary)"
                            // 当前小时高亮
                            shape={(props: any) => {
                                const { x, y, width, height, index } = props;
                                const isCurrentHour = data[index]?.hour === currentHour;
                                return (
                                    <rect x={x} y={y} width={width} height={height}
                                        rx={3} ry={3}
                                        fill={isCurrentHour ? '#10b981' : 'var(--primary)'}
                                        opacity={isCurrentHour ? 1 : 0.7}
                                    />
                                );
                            }}
                        />
                    </BarChart>
                </ChartContainer>
            </div>
        </div>
    );
};

export default HourlyVolumeWidget;
