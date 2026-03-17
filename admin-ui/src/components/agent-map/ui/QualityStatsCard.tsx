import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../services/api';
import { useWebSocket } from '../../../context/WebSocketContext';

interface QualityAlert {
    id: string;
    type: 'mos_low' | 'loss_high' | 'rtt_high' | 'jitter_high';
    severity: 'warning' | 'critical';
    message: string;
    call_id?: string;
    value: number;
    threshold: number;
    timestamp: string;
    resolved: boolean;
}

interface QualityOverview {
    avg_mos: number;
    total: number;
    excellent: number;
    good: number;
    fair: number;
    poor: number;
}

const getMosColor = (mos: number): string => {
    if (mos >= 4.0) return '#22c55e';
    if (mos >= 3.0) return '#eab308';
    if (mos >= 2.0) return '#f97316';
    return '#ef4444';
};

// MOS 等级字母 A-F 是行业标准，不做翻译
const getMosGrade = (mos: number): string => {
    if (mos >= 4.3) return 'A';
    if (mos >= 4.0) return 'B';
    if (mos >= 3.0) return 'C';
    if (mos >= 2.0) return 'D';
    return 'F';
};

const QualityStatsCard: React.FC = () => {
    const { t } = useTranslation();
    const [overview, setOverview] = useState<QualityOverview | null>(null);
    const [alerts, setAlerts] = useState<QualityAlert[]>([]);
    const { subscribe, connected } = useWebSocket();

    // Fetch quality overview
    useEffect(() => {
        const fetchOverview = async () => {
            try {
                const res = await api.get('/platform/quality/overview', { params: { hours: 1 } });
                const data = res.data?.data?.mos_distribution;
                if (data) {
                    setOverview({
                        avg_mos: parseFloat(data.avg_mos) || 0,
                        total: parseInt(data.total) || 0,
                        excellent: parseInt(data.excellent) || 0,
                        good: parseInt(data.good) || 0,
                        fair: parseInt(data.fair) || 0,
                        poor: parseInt(data.poor) || 0,
                    });
                }
            } catch {
                // Silently fail; card shows "No data"
            }
        };
        fetchOverview();
        const interval = setInterval(fetchOverview, 30_000);
        return () => clearInterval(interval);
    }, []);

    // Fetch active alerts
    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const res = await api.get('/platform/quality/alerts/active');
                setAlerts(res.data?.data || []);
            } catch {
                // Silently fail
            }
        };
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 15_000);
        return () => clearInterval(interval);
    }, []);

    // Listen for real-time quality alerts via WebSocket
    useEffect(() => {
        if (!connected) return;
        const unsub = subscribe('quality:alert', (msg: any) => {
            const data = msg.data || msg;
            if (data.action === 'new') {
                setAlerts(prev => [data.alert, ...prev]);
            } else if (data.action === 'resolved') {
                setAlerts(prev => prev.filter(a => a.id !== data.alert.id));
            } else if (data.action === 'updated') {
                setAlerts(prev => prev.map(a => a.id === data.alert.id ? data.alert : a));
            }
        });
        return unsub;
    }, [subscribe, connected]);

    const avgMos = overview?.avg_mos || 0;
    const total = overview?.total || 0;
    const poorCount = overview?.poor || 0;
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = alerts.filter(a => a.severity === 'warning').length;

    return (
        <div className="slot-card quality-stats-card">
            <div className="slot-card-header">
                <span>📊 {t('agentMap.cards.quality', 'Quality')}</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>1H</span>
            </div>

            <div className="slot-card-body" style={{ gap: '6px' }}>
                {/* MOS Score Badge */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', borderRadius: '6px',
                    background: `${getMosColor(avgMos)}15`,
                    border: `1px solid ${getMosColor(avgMos)}30`,
                }}>
                    <div>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '1px' }}>{t('agentMap.cards.avgMos', 'Avg MOS')}</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: getMosColor(avgMos), lineHeight: 1 }}>
                            {avgMos > 0 ? avgMos.toFixed(2) : '—'}
                        </div>
                    </div>
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: `${getMosColor(avgMos)}20`,
                        border: `2px solid ${getMosColor(avgMos)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.85rem', fontWeight: 700, color: getMosColor(avgMos),
                    }}>
                        {avgMos > 0 ? getMosGrade(avgMos) : '?'}
                    </div>
                </div>

                {/* Quick Stats Row */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{
                        flex: 1, padding: '4px 6px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.04)', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{t('agentMap.cards.callsCount', 'Calls')}</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>{total}</div>
                    </div>
                    <div style={{
                        flex: 1, padding: '4px 6px', borderRadius: '4px',
                        background: poorCount > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{t('agentMap.cards.poor', 'Poor')}</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: poorCount > 0 ? '#ef4444' : '#e2e8f0' }}>
                            {poorCount}
                        </div>
                    </div>
                </div>

                {/* Active Alerts Summary */}
                {(criticalAlerts > 0 || warningAlerts > 0) && (
                    <div style={{
                        padding: '4px 8px', borderRadius: '4px',
                        background: criticalAlerts > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
                        border: `1px solid ${criticalAlerts > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)'}`,
                        fontSize: '0.7rem', color: '#e2e8f0',
                    }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span>{criticalAlerts > 0 ? '🔴' : '🟡'} {t('agentMap.cards.activeAlerts', 'Active Alerts')}</span>
                            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
                                {criticalAlerts > 0 && <span style={{ color: '#ef4444' }}>{criticalAlerts} {t('agentMap.cards.critical', 'critical')}</span>}
                                {criticalAlerts > 0 && warningAlerts > 0 && ' · '}
                                {warningAlerts > 0 && <span style={{ color: '#eab308' }}>{warningAlerts} {t('agentMap.cards.warning', 'warning')}</span>}
                            </span>
                        </div>
                    </div>
                )}

                {/* No alerts — green badge */}
                {alerts.length === 0 && total > 0 && (
                    <div style={{
                        padding: '4px 8px', borderRadius: '4px',
                        background: 'rgba(34,197,94,0.08)',
                        border: '1px solid rgba(34,197,94,0.2)',
                        fontSize: '0.7rem', color: '#22c55e', textAlign: 'center',
                    }}>
                        ✓ {t('agentMap.cards.allGood', 'All calls within quality thresholds')}
                    </div>
                )}

                {/* Latest alert preview */}
                {alerts.length > 0 && (
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.3, padding: '2px 4px' }}>
                        <span style={{ fontWeight: 600 }}>{t('agentMap.cards.latest', 'Latest')}:</span>{' '}
                        {alerts[0].message.length > 60 ? alerts[0].message.substring(0, 60) + '…' : alerts[0].message}
                    </div>
                )}
            </div>
        </div>
    );
};

export default QualityStatsCard;
