import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface QualityPoint {
    timestamp: string;
    mos: number;
    jitter: number;
    packet_loss: number;
    rtt: number;
}

interface QualityTimelineProps {
    callId: string;
}

const QualityTimeline: React.FC<QualityTimelineProps> = ({ callId }) => {
    const { t } = useTranslation();
    const [data, setData] = useState<QualityPoint[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/platform/calls/${callId}/quality-timeline`)
            .then(res => {
                const points = (res.data.data || []).map((p: QualityPoint, i: number) => ({
                    ...p,
                    label: `#${i + 1}`,
                }));
                setData(points);
            })
            .catch(err => console.error('Failed to fetch quality timeline', err))
            .finally(() => setLoading(false));
    }, [callId]);

    if (loading) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>{t('callDetailsPage.loadingQuality', 'Loading quality data...')}</div>;
    if (data.length === 0) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>{t('callDetailsPage.noRtcp', 'No RTCP data available for this call.')}</div>;

    return (
        <div style={{ width: '100%' }}>
            {/* MOS Chart */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    MOS (Mean Opinion Score)
                </h4>
                <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 8, fontSize: 12 }} />
                        <ReferenceLine y={3.5} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Good', fill: '#f59e0b', fontSize: 10 }} />
                        <Line type="monotone" dataKey="mos" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} name="MOS" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Jitter & Packet Loss Chart */}
            <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    Jitter (ms) & Packet Loss (%)
                </h4>
                <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <YAxis yAxisId="jitter" tick={{ fontSize: 11 }} stroke="#f59e0b" />
                        <YAxis yAxisId="loss" orientation="right" tick={{ fontSize: 11 }} stroke="#ef4444" />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line yAxisId="jitter" type="monotone" dataKey="jitter" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Jitter (ms)" />
                        <Line yAxisId="loss" type="monotone" dataKey="packet_loss" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Packet Loss (%)" />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default QualityTimeline;
