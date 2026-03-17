import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import './SystemHealthPanel.css';

import { Button } from '../ui/button';

interface HealthNode {
    status: 'online' | 'offline' | 'warning';
    details: string;
    latencyMs: number;
    version?: string;
}

interface AggregateHealth {
    appNode: HealthNode;
    database: HealthNode;
    goEngine: HealthNode;
    serService: HealthNode;
}

// Globals injected by Vite
declare const __APP_VERSION__: string;

export const SystemHealthPanel: React.FC = () => {
    const { t } = useTranslation();
    const [health, setHealth] = useState<AggregateHealth | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchHealth = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/platform/health/aggregate');
            setHealth(res.data.data);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to fetch health status');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchHealth, 30_000);
        return () => clearInterval(interval);
    }, []);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'online': return '🟢';
            case 'warning': return '🟡';
            case 'offline': return '🔴';
            default: return '⚪';
        }
    };

    const getLatencyDisplay = (ms: number) => {
        if (ms === 0) return '';
        const color = ms < 100 ? 'latency-good' : ms < 500 ? 'latency-warn' : 'latency-bad';
        return <span className={`latency ${color}`}>{ms}ms</span>;
    };

    return (
        <div className="system-health-panel">
            <div className="system-health-header">
                <h3>
                    {t('settingsPage.systemStatus') || 'System Status'}
                    <span className="node-version ui-badge" style={{ marginLeft: '12px' }}>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'} (Admin UI)</span>
                </h3>
                <Button className="-refresh-health"
                    onClick={fetchHealth}
                    disabled={loading}
                    title={t('common.refresh') || 'Refresh'}
                >
                    {loading ? '⟳' : '↻'}
                </Button>
            </div>

            {error && <div className="health-error">{error}</div>}

            <div className="health-nodes-grid">
                {/* Database Node */}
                <div className="health-node">
                    <div className="node-icon">💾</div>
                    <div className="node-info">
                        <div className="node-title">
                            {getStatusIcon(health?.database?.status || 'unknown')} {t('systemHealth.database', 'Database')}
                            {health?.database && getLatencyDisplay(health.database.latencyMs)}
                        </div>
                        <div className="node-details">{health?.database?.details ?? (loading ? 'Loading...' : 'Offline')}</div>
                    </div>
                </div>

                {/* App-Node */}
                <div className="health-node">
                    <div className="node-icon">⚙️</div>
                    <div className="node-info">
                        <div className="node-title">
                            {getStatusIcon(health?.appNode?.status || 'unknown')} {t('systemHealth.appNode', 'App-Node')}
                            {health?.appNode?.version && <span className="node-version ui-badge">v{health.appNode.version}</span>}
                        </div>
                        <div className="node-details">{health?.appNode?.details ?? (loading ? 'Loading...' : 'Offline')}</div>
                    </div>
                </div>

                {/* Go Engine Node */}
                <div className="health-node">
                    <div className="node-icon">🚀</div>
                    <div className="node-info">
                        <div className="node-title">
                            {getStatusIcon(health?.goEngine?.status || 'unknown')} {t('systemHealth.goEngine', 'SIP Ingestion (Go)')}
                            {health?.goEngine?.version && <span className="node-version ui-badge">v{health.goEngine.version}</span>}
                        </div>
                        <div className="node-details">
                            {health?.goEngine && getLatencyDisplay(health.goEngine.latencyMs)}
                            <span style={{ marginLeft: '6px' }}>{health?.goEngine?.details ?? (loading ? 'Loading...' : 'Offline')}</span>
                        </div>
                    </div>
                </div>

                {/* SER Service Node */}
                <div className="health-node">
                    <div className="node-icon">🧠</div>
                    <div className="node-info">
                        <div className="node-title">
                            {getStatusIcon(health?.serService?.status || 'unknown')} {t('systemHealth.serService', 'CXMI AI Service')}
                            {health?.serService?.version && <span className="node-version ui-badge">v{health.serService.version}</span>}
                        </div>
                        <div className="node-details">
                            {health?.serService && getLatencyDisplay(health.serService.latencyMs)}
                            <span style={{ marginLeft: '6px' }}>{health?.serService?.details ?? (loading ? 'Loading...' : 'Offline')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
