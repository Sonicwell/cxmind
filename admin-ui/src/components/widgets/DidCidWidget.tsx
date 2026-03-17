import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import ChartContainer from './ChartContainer';

// 蓝色系 DID / 橙色系 CID
const DID_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#2563eb', '#1d4ed8', '#4f46e5', '#7c3aed', '#60a5fa', '#93c5fd'];
const CID_COLORS = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#d97706', '#ea580c', '#dc2626', '#db2777', '#fbbf24', '#fb923c'];

interface NumberEntry { number: string; cnt: string }

const DidCidWidget: React.FC = () => {
    const { t } = useTranslation();
    const [did, setDid] = useState<NumberEntry[]>([]);
    const [cid, setCid] = useState<NumberEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/platform/did-cid-stats')
            .then(res => {
                setDid(res.data.did || []);
                setCid(res.data.cid || []);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="cq-loading">{t('common.loading', 'Loading...')}</div>;

    const didData = did.map(d => ({ name: d.number, value: Number(d.cnt) }));
    const cidData = cid.map(d => ({ name: d.number, value: Number(d.cnt) }));

    const renderPie = (data: { name: string; value: number }[], colors: string[], title: string, icon: React.ReactNode) => (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, justifyContent: 'center' }}>
                {icon}
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{title}</span>
            </div>
            {data.length > 0 ? (
                <>
                    <div style={{ height: 150, flexShrink: 0 }}>
                        <ChartContainer>
                            <PieChart>
                                <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={2} dataKey="value">
                                    {data.map((_, idx) => <Cell key={idx} fill={colors[idx % colors.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                                    formatter={(value: any) => [value, t('dashboard.toolbar.calls', 'Calls')]} />
                            </PieChart>
                        </ChartContainer>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px' }}>
                        {data.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[idx % colors.length], flexShrink: 0 }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{item.name}</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="cq-empty" style={{ fontSize: '0.8rem', padding: '2rem 0' }}>{t('common.noData', 'No data')}</div>
            )}
        </div>
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">📊 {t('dashboard.didCidTitle', 'DID / CID Distribution')} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>({t('common.today', 'Today')})</span></h3>
            <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
                {renderPie(didData, DID_COLORS, t('dashboard.didInbound', 'DID (Inbound)'), <PhoneIncoming size={14} color="#3b82f6" />)}
                <div style={{ width: 1, background: 'var(--glass-border)' }} />
                {renderPie(cidData, CID_COLORS, t('dashboard.cidOutbound', 'CID (Outbound)'), <PhoneOutgoing size={14} color="#f59e0b" />)}
            </div>
        </div>
    );
};

export default DidCidWidget;
