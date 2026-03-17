import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Phone, PhoneIncoming, TrendingUp } from 'lucide-react';
import { CircularGauge } from './CircularGauge';
import { AGENT_STATUS_MAP, resolveStatusColor } from '../utils';
import type { ConfiguredStatus } from '../utils';
import api from '../../../services/api';

interface OperationsCardProps {
    agents: Record<string, any>;
    isSimulating: boolean;
    configuredStatuses?: ConfiguredStatus[];
    queueCount?: number;
}

interface SLAData {
    total_calls: number;
    service_level: number;
    abandon_rate: number;
    avg_handle_time: number;
}

export const OperationsCard: React.FC<OperationsCardProps> = ({ agents, isSimulating, configuredStatuses = [], queueCount: externalQueueCount }) => {
    const { t } = useTranslation();
    const [slaData, setSlaData] = useState<SLAData | null>(null);

    // 非模拟模式下拉取真实 SLA 数据
    useEffect(() => {
        if (isSimulating) { setSlaData(null); return; }
        const fetchSLA = async () => {
            try {
                const res = await api.get('/analytics/sla/overview?days=1');
                const d = res.data?.data;
                if (d) {
                    setSlaData({
                        total_calls: Number(d.total_calls) || 0,
                        service_level: Number(d.service_level) || 0,
                        abandon_rate: Number(d.abandon_rate) || 0,
                        avg_handle_time: Number(d.avg_handle_time) || 0,
                    });
                }
            } catch { /* card gracefully shows 0 */ }
        };
        fetchSLA();
        const iv = setInterval(fetchSLA, 30_000);
        return () => clearInterval(iv);
    }, [isSimulating]);

    // Merge configured + system statuses for breakdown
    const allStatuses = useMemo(() => {
        if (configuredStatuses.length > 0) {
            return configuredStatuses.map(s => ({ id: s.id, label: s.label, color: resolveStatusColor(s.color) }));
        }
        // Fallback hardcoded (DB format IDs)
        return [
            { id: 'available', label: t('agentMap.status.available', 'Available'), color: AGENT_STATUS_MAP.available.color },
            { id: 'oncall', label: t('agentMap.status.onCall', 'On Call'), color: AGENT_STATUS_MAP.oncall.color },
            { id: 'ring', label: t('agentMap.status.ringing', 'Ringing'), color: AGENT_STATUS_MAP.ring.color },
            { id: 'onhold', label: t('agentMap.status.onHold', 'On Hold'), color: AGENT_STATUS_MAP.onhold?.color || '#f59e0b' },
            { id: 'wrapup', label: t('agentMap.status.wrapUp', 'Wrap-up'), color: AGENT_STATUS_MAP.wrapup.color },
            { id: 'working', label: t('agentMap.status.working', 'Working'), color: AGENT_STATUS_MAP.working?.color || '#3b82f6' },
            { id: 'busy', label: t('agentMap.status.busy', 'Busy'), color: AGENT_STATUS_MAP.busy?.color || '#ef4444' },
            { id: 'break', label: t('agentMap.status.break', 'Break'), color: AGENT_STATUS_MAP.break.color },
            { id: 'away', label: t('agentMap.status.away', 'Away'), color: AGENT_STATUS_MAP.away.color },
            { id: 'dnd', label: t('agentMap.status.dnd', 'Do Not Disturb'), color: AGENT_STATUS_MAP.dnd?.color || '#ef4444' },
            { id: 'offline', label: t('agentMap.status.offline', 'Offline'), color: AGENT_STATUS_MAP.offline.color },
        ];
    }, [configuredStatuses, t]);

    const stats = useMemo(() => {
        const agentList = Object.values(agents);
        const total = agentList.length;
        const offline = agentList.filter(a => a.status === 'offline').length;
        const online = total - offline;
        const onCall = agentList.filter(a => a.status === 'oncall').length;
        const ringing = agentList.filter(a => a.status === 'ring').length;
        const wrapUp = agentList.filter(a => a.status === 'wrapup').length;

        // Per-status counts
        const statusCounts: Record<string, number> = {};
        for (const s of allStatuses) {
            statusCounts[s.id] = agentList.filter(a => (a.status || 'offline') === s.id).length;
        }

        // 占用率计算: busyCount / total
        const busyCount = agentList.filter(a =>
            ['oncall', 'ring', 'onhold', 'wrapup', 'busy'].includes(a.status)
        ).length;
        const occupancy = total > 0 ? Math.round((busyCount / total) * 100) : 0;

        // 模拟模式用 mock 数据，真实模式用 API 数据 + 外部 queue prop
        const queueCount = isSimulating ? Math.floor(Math.random() * 8) + 1 : (externalQueueCount || 0);
        const ahtSec = slaData ? slaData.avg_handle_time : 0;
        const avgTalkTime = isSimulating ? '02:45' : (ahtSec > 0 ? `${String(Math.floor(ahtSec / 60)).padStart(2, '0')}:${String(Math.round(ahtSec % 60)).padStart(2, '0')}` : '--:--');
        const todayCalls = isSimulating ? 156 : (slaData?.total_calls || 0);
        const serviceLevel = isSimulating ? (85 + Math.floor(Math.random() * 12)) : (slaData?.service_level || 0);
        const abandonRate = isSimulating ? (1 + Math.random() * 3).toFixed(1) : (slaData?.abandon_rate?.toFixed(1) || '0.0');

        return {
            total, online, onCall, ringing, wrapUp, statusCounts,
            occupancy, queueCount, avgTalkTime, todayCalls, serviceLevel, abandonRate
        };
    }, [agents, isSimulating, allStatuses, slaData, externalQueueCount]);



    return (
        <div className="ops-card">
            <div className="ops-card-header">
                <TrendingUp size={14} />
                <span>{t('agentMap.operationsOverview')}</span>
                <span className={`ops-live-dot ${isSimulating ? 'active' : ''}`}>●</span>
            </div>

            {/* Content with glass bg */}
            <div className="ops-card-content">
                {/* KPI Grid */}
                <div className="ops-kpi-grid">
                    <div className="ops-kpi">
                        <div className="ops-kpi-value" style={{ color: '#22c55e' }}>{stats.online}</div>
                        <div className="ops-kpi-label"><Users size={10} /> {t('agentMap.online')}</div>
                    </div>
                    <div className="ops-kpi">
                        <div className="ops-kpi-value" style={{ color: '#ef4444' }}>{stats.onCall}</div>
                        <div className="ops-kpi-label"><Phone size={10} /> {t('agentMap.onCall')}</div>
                    </div>
                    <div className="ops-kpi">
                        <div className="ops-kpi-value" style={{ color: '#f59e0b' }}>{stats.queueCount}</div>
                        <div className="ops-kpi-label"><PhoneIncoming size={10} /> {t('agentMap.queue')}</div>
                    </div>
                </div>

                {/* Gauges Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '1rem 0' }}>
                    <CircularGauge
                        value={stats.occupancy}
                        label={t('agentMap.occupancy')}
                        size={80}
                        color={stats.occupancy > 90 ? '#ef4444' : stats.occupancy > 50 ? '#eab308' : '#22c55e'}
                        strokeWidth={6}
                    />

                    {isSimulating && (
                        <>
                            <CircularGauge
                                value={stats.serviceLevel}
                                label={t('agentMap.serviceLevel')}
                                size={80}
                                color={stats.serviceLevel >= 90 ? '#22c55e' : stats.serviceLevel >= 70 ? '#eab308' : '#ef4444'}
                                strokeWidth={6}
                            />
                            <CircularGauge
                                value={parseFloat(stats.abandonRate)}
                                label={t('agentMap.abandonRate')}
                                size={80}
                                color={parseFloat(stats.abandonRate) > 5 ? '#ef4444' : '#22c55e'}
                                strokeWidth={6}
                                max={10} // Emphasize small values (0-10% range)
                                formatValue={(v) => `${v}%`}
                            />
                        </>
                    )}
                </div>

                {/* Agent Status Breakdown */}
                <div className="ops-status-breakdown">
                    {allStatuses.map(si => (
                        <div key={si.id} className="ops-status-row">
                            <span className="ops-status-dot" style={{ background: si.color }} />
                            <span>{si.label}</span>
                            <span className="ops-status-count">{stats.statusCounts[si.id] || 0}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
