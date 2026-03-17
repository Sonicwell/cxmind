import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, Wifi, PhoneMissed, Globe, ServerCrash, PhoneOff } from 'lucide-react';
import { useWebSocket } from '../../context/WebSocketContext';
import { useDemoMode } from '../../hooks/useDemoMode';
import api from '../../services/api'; // Import api to fetch initial history
import type { WidgetProps } from '../../dashboard/types';
import './alert-feed-widget.css';

interface AlertItem {
    id: string;
    type: string;
    message: string;
    time: string;
    severity: 'warning' | 'critical';
}

/**
 * Dashboard-native Platform Alerts widget.
 * Purely driven by backend WebSocket push alerts and initial DB history load.
 */
const AlertFeedWidget: React.FC<WidgetProps> = () => {
    const { t } = useTranslation();
    const { subscribe } = useWebSocket();
    const { demoMode } = useDemoMode();
    const [wsAlerts, setWsAlerts] = useState<AlertItem[]>([]);

    // 1. Initial Load from Backend History
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const demoParam = demoMode ? '&demo=true' : '';
                const res = await api.get(`/platform/quality/alerts/history?limit=20${demoParam}`);
                if (res.data?.data) {
                    const history = res.data.data.map((a: any) => {
                        const isOneWay = a.message?.includes('One-Way');
                        return {
                            id: a.id,
                            type: isOneWay ? 'one_way_audio' : a.type,
                            message: a.message,
                            time: a.time || new Date(a.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                            severity: a.severity || 'warning',
                        };
                    });
                    setWsAlerts(history);
                }
            } catch (err) {
                console.error("Failed to fetch initial alert history", err);
            }
        };
        fetchHistory();
    }, [demoMode]);

    // 2. Subscribe to backend real-time quality alerts
    useEffect(() => {
        if (!subscribe) return;

        const unsub = subscribe('quality:alert', (msg: any) => {
            if (msg?.data?.action === 'new' && msg?.data?.alert) {
                const { alert } = msg.data;
                const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // Special icon mapping for One-Way Audio
                const isOneWay = alert.message?.includes('One-Way');

                setWsAlerts(prev => {
                    const updated = [{
                        id: alert.id,
                        type: isOneWay ? 'one_way_audio' : alert.type || 'backend_alert',
                        message: alert.message,
                        time: now,
                        severity: alert.severity || 'warning',
                    }, ...prev];
                    return updated.slice(0, 50); // Keep last 50
                });
            } else if (msg?.data?.action === 'resolved' && msg?.data?.alert) {
                setWsAlerts(prev => prev.filter(a => a.id !== msg.data.alert.id));
            }
        });
        return () => unsub();
    }, []);

    const iconMap: Record<string, React.ReactNode> = useMemo(() => ({
        quality_drop: <Clock size={12} />,
        high_error_rate: <Wifi size={12} />,
        call_spike: <PhoneMissed size={12} />,
        region_issue: <Globe size={12} />,
        loss_high: <Wifi size={12} />,
        mos_low: <AlertTriangle size={12} />,
        rtt_high: <Clock size={12} />,
        jitter_high: <Globe size={12} />,
        backend_alert: <ServerCrash size={12} />,
        one_way_audio: <PhoneOff size={12} color="#ef4444" />,
    }), []);

    const criticalCount = wsAlerts.filter(a => a.severity === 'critical').length;

    return (
        <div className="dw-alerts" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <AlertTriangle size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                {t('alerts.title', 'Platform Alerts')}
                {criticalCount > 0 && (
                    <span className="dw-alerts-badge">{criticalCount}</span>
                )}
            </h3>

            <div className="dw-alerts-list">
                {wsAlerts.length === 0 && (
                    <div className="dw-alerts-empty">
                        <span style={{ fontSize: '1.5rem' }}>✅</span>
                        <span>{t('alerts.allNormal', 'All systems normal')}</span>
                    </div>
                )}
                {wsAlerts.map(alert => (
                    <div key={alert.id} className={`dw-alerts-row dw-alerts-${alert.severity} animate-fade-in`}>
                        <span className="dw-alerts-icon">{iconMap[alert.type] || <AlertTriangle size={12} />}</span>
                        <span className="dw-alerts-msg">{alert.message}</span>
                        <span className="dw-alerts-time">{alert.time}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AlertFeedWidget;
