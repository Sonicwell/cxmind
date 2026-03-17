import React from 'react';
import { Headset, Phone, PhoneIncoming, TrendingUp } from 'lucide-react';
import { useDashboardCore, useDashboardLive } from '../../dashboard/DashboardContext';
import type { WidgetProps } from '../../dashboard/types';
import { useTranslation } from 'react-i18next';
import { useAgentStatusColors } from '../../hooks/useAgentStatusColors';
import './operations-widget.css';

/**
 * Dashboard-native Operations Overview widget.
 * Consumes aggregated agent status data from DashboardContext
 * (pushed via WS `dashboard:invalidate` or fetched from `/platform/stats`).
 * 颜色从 DB 读取, fallback 到 AGENT_STATUS_MAP.
 */
const OperationsWidget: React.FC<WidgetProps> = () => {
    const { t } = useTranslation();
    const { stats } = useDashboardCore();
    const { opsAgentCounts } = useDashboardLive();
    const colorMap = useAgentStatusColors();

    // Prefer WS direct-push, fallback to REST stats
    const counts = opsAgentCounts ?? stats?.system?.agentStatusCounts;

    const registered = counts?.registered ?? 0;
    const onCall = counts?.on_call ?? 0;
    const ringing = counts?.ringing ?? 0;
    const available = counts?.available ?? 0;
    const onBreak = counts?.break ?? 0;
    const wrapUp = counts?.wrap_up ?? 0;
    const away = counts?.away ?? 0;
    const onhold = counts?.onhold ?? 0;
    const dnd = counts?.dnd ?? 0;
    const offline = counts?.offline ?? 0;
    const occupancy = counts?.occupancy ?? 0;
    const isLive = !!counts;

    const statusRows = [
        { key: 'available', label: 'Available', count: available, color: colorMap.available },
        { key: 'away', label: 'Away', count: away, color: colorMap.away },
        { key: 'onCall', label: 'On Call', count: onCall, color: colorMap.oncall },
        { key: 'ringing', label: 'Ringing', count: ringing, color: colorMap.ring },
        { key: 'onhold', label: 'On Hold', count: onhold, color: colorMap.onhold },
        { key: 'wrapUp', label: 'Wrap Up', count: wrapUp, color: colorMap.wrapup },
        { key: 'break', label: 'Break', count: onBreak, color: colorMap.break },
        { key: 'dnd', label: 'Do Not Disturb', count: dnd, color: colorMap.dnd },
        { key: 'offline', label: 'Offline', count: offline, color: colorMap.offline },
    ];

    return (
        <div className="dw-ops" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <TrendingUp size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                {t('ops.title', 'Operations Overview')}
                <span className={`dw-ops-live ${isLive ? 'active' : ''}`}>●</span>
            </h3>

            {/* KPI Row */}
            <div className="dw-ops-kpi-row">
                <div className="dw-ops-kpi">
                    <div className="dw-ops-kpi-icon" style={{ background: 'hsla(0,75%,55%,0.12)', color: 'var(--danger)' }}>
                        <Headset size={16} />
                    </div>
                    <div>
                        <div className="dw-ops-kpi-value">{onCall}</div>
                        <div className="dw-ops-kpi-label">{t('ops.onCall', 'On Call')}</div>
                    </div>
                </div>
                <div className="dw-ops-kpi">
                    <div className="dw-ops-kpi-icon" style={{ background: 'hsla(150,60%,45%,0.12)', color: 'var(--success)' }}>
                        <Phone size={16} />
                    </div>
                    <div>
                        <div className="dw-ops-kpi-value">{registered}</div>
                        <div className="dw-ops-kpi-label">{t('ops.registered', 'Registered')}</div>
                    </div>
                </div>
                <div className="dw-ops-kpi">
                    <div className="dw-ops-kpi-icon" style={{ background: 'hsla(35,90%,60%,0.12)', color: 'var(--warning)' }}>
                        <PhoneIncoming size={16} />
                    </div>
                    <div>
                        <div className="dw-ops-kpi-value">{ringing}</div>
                        <div className="dw-ops-kpi-label">{t('ops.ringing', 'Ringing')}</div>
                    </div>
                </div>
            </div>

            {/* Occupancy Bar */}
            <div className="dw-ops-occupancy">
                <div className="dw-ops-occupancy-header">
                    <span>{t('ops.occupancy', 'Occupancy')}</span>
                    <span className="dw-ops-occupancy-pct" style={{
                        color: occupancy > 90 ? 'var(--danger)' : occupancy > 50 ? 'var(--warning)' : 'var(--success)'
                    }}>{occupancy}%</span>
                </div>
                <div className="dw-ops-bar-track">
                    <div
                        className="dw-ops-bar-fill"
                        style={{
                            width: `${Math.min(occupancy, 100)}%`,
                            background: occupancy > 90 ? 'var(--danger)' : occupancy > 50 ? 'var(--warning)' : 'var(--success)',
                        }}
                    />
                </div>
            </div>

            {/* Agent Status Breakdown */}
            <div className="dw-ops-breakdown">
                {statusRows.map(row => (
                    <div key={row.key} className="dw-ops-status-row">
                        <span className="dw-ops-dot" style={{ background: row.color }} />
                        <span className="dw-ops-status-label">{row.label}</span>
                        <span className="dw-ops-status-count">{row.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default OperationsWidget;
