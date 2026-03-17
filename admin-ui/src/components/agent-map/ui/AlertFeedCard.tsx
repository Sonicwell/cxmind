import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Clock, UserX, PhoneMissed, Brain, Flame, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardRealtime } from '../../../dashboard/DashboardContext';

interface AlertFeedCardProps {
    agents: Record<string, any>;
    isSimulating: boolean;
}

interface AlertItem {
    id: string;
    type: 'long_wait' | 'abandon' | 'agent_offline' | 'high_abandon_rate' | 'emotion' | 'burnout' | 'toxic';
    message: string;
    time: string;
    severity: 'warning' | 'critical';
}

// Mock 模板仅在 simulation 模式使用，message 保持英文
const ALERT_TEMPLATES: Omit<AlertItem, 'id' | 'time'>[] = [
    { type: 'long_wait', message: 'Queue wait > 120s in Zone A', severity: 'warning' },
    { type: 'abandon', message: 'Call abandoned after 90s wait', severity: 'warning' },
    { type: 'agent_offline', message: 'Agent went offline unexpectedly', severity: 'critical' },
    { type: 'high_abandon_rate', message: 'Abandon rate exceeded 5%', severity: 'critical' },
    { type: 'long_wait', message: 'VIP caller waiting > 60s', severity: 'critical' },
    { type: 'abandon', message: 'Callback request from dropped call', severity: 'warning' },
];

const AlertFeedCard: React.FC<AlertFeedCardProps> = ({ isSimulating }) => {
    const { t } = useTranslation();
    const [mockAlerts, setMockAlerts] = useState<AlertItem[]>([]);
    const { emotionAlerts, burnoutAlerts, toxicAlerts } = useDashboardRealtime();

    // Generate mock alerts periodically in simulation mode
    useEffect(() => {
        if (!isSimulating) { setMockAlerts([]); return; }

        // Seed initial alerts
        const initial = ALERT_TEMPLATES.slice(0, 3).map((t, i) => ({
            ...t,
            id: `alert-${i}`,
            time: new Date(Date.now() - (i * 30000)).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }));
        setMockAlerts(initial);

        const interval = setInterval(() => {
            const template = ALERT_TEMPLATES[Math.floor(Math.random() * ALERT_TEMPLATES.length)];
            const newAlert: AlertItem = {
                ...template,
                id: `alert-${Date.now()}`,
                time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            };
            setMockAlerts(prev => [newAlert, ...prev].slice(0, 8)); // keep last 8
        }, 8000);

        return () => clearInterval(interval);
    }, [isSimulating]);

    // Convert real emotion alerts to AlertItem format and merge with mock
    const alerts = useMemo(() => {
        const realEmotionAlerts: AlertItem[] = emotionAlerts.map(ea => ({
            id: `emo-${ea.call_id}-${ea.ts}`,
            type: 'emotion' as const,
            message: ea.message,
            time: new Date(ea.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            severity: ea.severity,
        }));
        const realBurnoutAlerts: AlertItem[] = burnoutAlerts.map(ba => ({
            id: `burn-${ba.agent_id}-${ba.ts}`,
            type: 'burnout' as const,
            message: ba.message,
            time: new Date(ba.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            severity: ba.severity,
        }));
        // Real alerts first (toxic > burnout > emotion), then mock
        const realToxicAlerts: AlertItem[] = toxicAlerts.map(ta => ({
            id: `toxic-${ta.conversationId}-${ta.detectedAt}`,
            type: 'toxic' as const,
            message: `Toxic content detected (score: ${(ta.toxicScore * 100).toFixed(0)}%) — "${ta.text.slice(0, 40)}${ta.text.length > 40 ? '…' : ''}"`,
            time: new Date(ta.detectedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            severity: ta.severity,
        }));
        return [...realToxicAlerts, ...realBurnoutAlerts, ...realEmotionAlerts, ...mockAlerts].slice(0, 10);
    }, [emotionAlerts, burnoutAlerts, toxicAlerts, mockAlerts]);

    const iconMap = useMemo(() => ({
        long_wait: <Clock size={12} />,
        abandon: <PhoneMissed size={12} />,
        agent_offline: <UserX size={12} />,
        high_abandon_rate: <AlertTriangle size={12} />,
        emotion: <Brain size={12} />,
        burnout: <Flame size={12} />,
        toxic: <ShieldAlert size={12} />,
    }), []);

    return (
        <div className="slot-card alert-feed-card">
            <div className="slot-card-header">
                <AlertTriangle size={14} />
                <span>{t('agentMap.cards.alerts', 'ALERTS')}</span>
                {alerts.filter(a => a.severity === 'critical').length > 0 && (
                    <span className="slot-card-badge critical">
                        {alerts.filter(a => a.severity === 'critical').length}
                    </span>
                )}
            </div>
            <div className="alert-feed-list">
                {alerts.length === 0 && (
                    <div className="alert-feed-empty">{t('agentMap.cards.noAlerts', 'No alerts')}</div>
                )}
                {alerts.map(alert => (
                    <div key={alert.id} className={`alert-feed-row ${alert.severity}`}>
                        <span className="alert-feed-icon">{iconMap[alert.type]}</span>
                        <span className="alert-feed-msg">{alert.message}</span>
                        <span className="alert-feed-time">{alert.time}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AlertFeedCard;

