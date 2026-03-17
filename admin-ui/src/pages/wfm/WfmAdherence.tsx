import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import classes from './WfmAdherence.module.css';
import { useTranslation } from 'react-i18next';

interface AdherenceAlert {
    agentId: string;
    agentName: string;
    expectedState: string;
    actualState: string;
    driftMinutes: number;
    timestamp: string;
}

const WfmAdherence: React.FC = () => {
    const { t } = useTranslation();
    const { connected } = useWebSocket();
    const [alerts, setAlerts] = useState<AdherenceAlert[]>([]);
    const [mockAgents, setMockAgents] = useState<{ name: string, ext: string, status: string, since: string, isAdhering: boolean, avatarUrl: string }[]>([]);

    // In a real implementation we would also fetch the current snapshot of all scheduled agents
    // and their current real-time state, but for this milestone we will focus on
    // displaying the anomaly WebSocket events as requested.

    // WS推来的adherence异常
    useEffect(() => {
        const handleViolation = (event: CustomEvent) => {
            const data: AdherenceAlert = event.detail.data;
            setAlerts(prev => {
                // Keep only the latest 50 alerts, new ones at top
                const newAlerts = [data, ...prev];
                return newAlerts.slice(0, 50);
            });
        };

        window.addEventListener('wfm:adherence-violation', handleViolation as EventListener);
        return () => window.removeEventListener('wfm:adherence-violation', handleViolation as EventListener);
    }, []);

    // Also simulate listening to agent status changes globally to update a "Current Status" board
    useEffect(() => {
        const handleStatusChange = (_event: CustomEvent) => {
            // const { agentId, status } = event.detail.data;
            // update status board here
        };

        window.addEventListener('agent:status_change', handleStatusChange as EventListener);
        return () => window.removeEventListener('agent:status_change', handleStatusChange as EventListener);
    }, []);

    // Demo Mode: Inject Mock Adherence Alerts
    useEffect(() => {
        const isDemo = import.meta.env.VITE_MOCK_MODE === 'true' || localStorage.getItem('cxmind:demo-mode') === 'true';
        if (!isDemo) return;

        const fakeAgents = [
            'Test Agent 1', 'Test Agent 2', 'Test Agent 5', 'Test Agent 8', 'Test Agent 12'
        ];

        let initialMockFired = false;

        const generateMockViolation = () => {
            const agentName = fakeAgents[Math.floor(Math.random() * fakeAgents.length)];
            const expected = Math.random() > 0.5 ? 'working' : 'offline';
            const actual = expected === 'working' ? 'offline' : 'working';
            const driftMinutes = Math.floor(Math.random() * 15) + 1;

            const mockAlert: AdherenceAlert = {
                agentId: `mock_${Math.random()}`,
                agentName,
                expectedState: expected,
                actualState: actual,
                driftMinutes,
                timestamp: new Date().toISOString()
            };

            window.dispatchEvent(new CustomEvent('wfm:adherence-violation', { detail: { data: mockAlert } }));
        };

        const getAvatar = (name: string) => `https://api.dicebear.com/9.x/micah/svg?seed=${encodeURIComponent(name)}&backgroundColor=transparent`;

        // mock坐席看板初始化
        setMockAgents([
            { name: 'Test Agent 1', ext: '1001', status: 'Working', since: '08:00 AM', isAdhering: true, avatarUrl: getAvatar('Test Agent 1') },
            { name: 'Test Agent 2', ext: '1002', status: 'Working', since: '08:15 AM', isAdhering: true, avatarUrl: getAvatar('Test Agent 2') },
            { name: 'Test Agent 5', ext: '1005', status: 'Offline', since: '10:30 AM', isAdhering: false, avatarUrl: getAvatar('Test Agent 5') },
            { name: 'Test Agent 8', ext: '1008', status: 'On Break', since: '12:00 PM', isAdhering: true, avatarUrl: getAvatar('Test Agent 8') },
            { name: 'Test Agent 12', ext: '1012', status: 'Working', since: '09:00 AM', isAdhering: true, avatarUrl: getAvatar('Test Agent 12') },
            { name: 'Test Agent 3', ext: '1003', status: 'Working', since: '08:20 AM', isAdhering: true, avatarUrl: getAvatar('Test Agent 3') },
        ]);

        // Fire a few immediately
        if (!initialMockFired) {
            for (let i = 0; i < 3; i++) {
                setTimeout(generateMockViolation, i * 500);
            }
            initialMockFired = true;
        }

        // Fire periodically
        const interval = setInterval(() => {
            if (Math.random() > 0.3) {
                generateMockViolation();
            }
        }, 8000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className={classes.adherenceContainer}>
            <header className={classes.dashboardHeader}>
                <div>
                    <h2>{t('wfmAdherence.title')}</h2>
                    <p>{t('wfmAdherence.subtitle')}</p>
                </div>
                <div className={classes.connectionStatus}>
                    <span className={`${classes.statusDot} ${connected ? classes.online : classes.offline}`}></span>
                    WS: {connected ? t('wfmAdherence.connected') : t('wfmAdherence.disconnected')}
                </div>
            </header>

            <div className={classes.grid}>
                {/* Real-time Anomalies Feed */}
                <div className={classes.card}>
                    <div className={classes.cardHeader}>
                        <h3>{t('wfmAdherence.alertsTitle')}</h3>
                        <span className={classes.badge}>{alerts.length}</span>
                    </div>
                    <div className={classes.cardContent}>
                        {alerts.length === 0 ? (
                            <div className={classes.emptyState}>
                                <p>{t('wfmAdherence.noViolations')}</p>
                                <span>{t('wfmAdherence.allAdhering')}</span>
                            </div>
                        ) : (
                            <ul className={classes.alertList}>
                                {alerts.map((alert, idx) => (
                                    <li key={idx} className={classes.alertItem}>
                                        <div className={classes.alertIconWrapper}>
                                            <div className={`${classes.pulseRing} ${classes.criticalRing}`}></div>
                                        </div>
                                        <div className={classes.alertDetails}>
                                            <strong>{alert.agentName}</strong> {t('wfmAdherence.outOfAdherence')}
                                            <div className={classes.alertSubtext}>
                                                {t('wfmAdherence.expected')}: <span className={classes.expected}>{alert.expectedState}</span> |
                                                {t('wfmAdherence.actual')}: <span className={classes.actual}>{alert.actualState}</span>
                                            </div>
                                        </div>
                                        <div className={classes.alertTime}>
                                            {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Current Schedule Snapshot (Placeholder for larger implemention) */}
                <div className={classes.card}>
                    <div className={classes.cardHeader}>
                        <h3>{t('wfmAdherence.scheduledAgents')}</h3>
                    </div>
                    <div className={classes.cardContent} style={{ padding: 0 }}>
                        {mockAgents.length === 0 ? (
                            <div className={classes.emptyState}>
                                <p>{t('wfmAdherence.snapshotLoading')}</p>
                                <span>{t('wfmAdherence.snapshotDesc')}</span>
                            </div>
                        ) : (
                            <div className={classes.rosterList}>
                                {mockAgents.map((agent, i) => (
                                    <div key={i} className={classes.rosterItem}>
                                        <div className={classes.rosterAvatar} style={{
                                            backgroundImage: `url(${agent.avatarUrl})`,
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                            backgroundColor: 'var(--bg-tertiary)',
                                            color: 'transparent',
                                            overflow: 'hidden'
                                        }}>
                                        </div>
                                        <div className={classes.rosterInfo}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <strong>{agent.name}</strong>
                                                <span
                                                    className={classes.rosterStatusDot}
                                                    style={{ backgroundColor: agent.isAdhering ? '#10b981' : '#ef4444' }}
                                                    title={agent.isAdhering ? 'In Adherence' : 'Out of Adherence'}
                                                />
                                            </div>
                                            <span>EXT: {agent.ext}</span>
                                        </div>
                                        <div className={classes.rosterState}>
                                            <div className={classes.rosterBadge} style={{
                                                backgroundColor: agent.status === 'Working' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
                                                color: agent.status === 'Working' ? '#10b981' : 'var(--text-secondary)'
                                            }}>
                                                {agent.status}
                                            </div>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{t('wfmAdherence.since')} {agent.since}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WfmAdherence;
