import React, { useState, useMemo, useEffect } from 'react';
import { X, Headphones, HeadphoneOff, MessageSquare, Phone, Activity, PhoneCall } from 'lucide-react';
import { AGENT_STATUS_MAP, DEFAULT_STATUS, getStatusLabel } from '../utils';

import { Button } from '../../ui/button';

interface AgentDetailCardProps {
    agent: {
        id: string;
        name: string;
        status: string;
        avatar?: string;
        extension?: string;
        lastStatusChange?: string;
    };
    isSimulating: boolean;
    onClose: () => void;
    onMonitor?: () => void;
    onMessage?: () => void;
}

export const AgentDetailCard: React.FC<AgentDetailCardProps> = ({
    agent,
    isSimulating,
    onClose,
    onMonitor,
    onMessage,
}) => {
    const [isMonitoring, setIsMonitoring] = useState(false);

    const statusDef = AGENT_STATUS_MAP[agent.status] || DEFAULT_STATUS;
    const config = {
        color: statusDef.color,
        glow: `${statusDef.color}4D`, // 30% opacity hex suffix
        label: getStatusLabel(agent.status).toUpperCase(),
    };
    const isOnCall = agent.status === 'oncall';
    const isRinging = agent.status === 'ring';

    // Live-ticking timer for status duration
    const [statusDuration, setStatusDuration] = useState('--:--');
    useEffect(() => {
        if (!agent.lastStatusChange) { setStatusDuration('--:--'); return; }
        const tick = () => {
            const diff = Date.now() - new Date(agent.lastStatusChange!).getTime();
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setStatusDuration(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
        };
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [agent.lastStatusChange]);

    // Mock data — only in simulation mode
    const mockCall = useMemo(() => {
        if (!isSimulating || !isOnCall) return null;
        return {
            caller: `+86 138${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}****`,
            callee: agent.name,
            duration: statusDuration,
            direction: 'inbound' as const,
        };
    }, [isSimulating, isOnCall, agent.name]);

    // 真实/模拟模式的统计数据
    // 优先使用父级注入到 agent 上的 callsToday（来自 /agent-stats/batch 批量 API）
    const [agentStats, setAgentStats] = useState<{ todayCalls: number; totalTalkTime: string } | null>(null);
    useEffect(() => {
        if (isSimulating) {
            // 模拟模式 mock
            const calls = 10 + Math.floor(Math.random() * 30);
            const hours = Math.floor(calls * 2.5 / 60);
            const mins = Math.floor((calls * 2.5) % 60);
            setAgentStats({ todayCalls: calls, totalTalkTime: `${hours}h ${mins}m` });
            return;
        }

        // 真实模式：从 agent 对象读取已注入的批量统计数据
        const agentAny = agent as any;
        if (typeof agentAny.callsToday === 'number') {
            const ahtStr = agentAny.avgHandleTime || '0m 0s';
            // 用 callsToday * avgDuration 估算 totalTalkTime
            const ahtMatch = ahtStr.match(/(\d+)m\s*(\d+)s/);
            const ahtSec = ahtMatch ? (parseInt(ahtMatch[1]) * 60 + parseInt(ahtMatch[2])) : 0;
            const totalSec = agentAny.callsToday * ahtSec;
            const hours = Math.floor(totalSec / 3600);
            const mins = Math.round((totalSec % 3600) / 60);
            setAgentStats({
                todayCalls: agentAny.callsToday,
                totalTalkTime: `${hours}h ${mins}m`,
            });
        } else {
            // callsToday 尚未注入（批量 API 未返回），显示 0
            setAgentStats({ todayCalls: 0, totalTalkTime: '0h 0m' });
        }
    }, [isSimulating, (agent as any).callsToday, agent.id]);

    const handleMonitor = () => {
        setIsMonitoring(!isMonitoring);
        onMonitor?.();
    };

    const monitorLabel = isMonitoring
        ? 'Stop Monitoring'
        : isOnCall || isRinging
            ? 'Monitor This Call'
            : 'Auto-Monitor Next';

    return (
        <div className="agent-detail-card">
            {/* Status color accent line */}
            <div className="adc-accent" style={{ background: config.color }} />

            {/* Header */}
            <div className="adc-header">
                <div className="adc-avatar-wrap">
                    <img
                        src={agent.avatar || '/avatars/agent_1.png'}
                        alt={agent.name}
                        className="adc-avatar"
                    />
                    <span
                        className="adc-status-dot"
                        style={{
                            background: config.color,
                            boxShadow: `0 0 8px ${config.glow}`,
                        }}
                    />
                </div>
                <div className="adc-info">
                    <div className="adc-name">{agent.name}</div>
                    <div className="adc-meta">
                        {agent.extension && <span className="adc-ext">Ext. {agent.extension}</span>}
                        <span className="adc-status-badge" style={{ color: config.color }}>
                            {config.label}
                        </span>
                        <span className="adc-duration">{statusDuration}</span>
                    </div>
                </div>
                <Button variant="none" onClick={onClose} className="adc-close-btn">
                    <X size={16} />
                </Button>
            </div>

            {/* Active Call */}
            {mockCall && (
                <div className="adc-section adc-call-section">
                    <div className="adc-section-title">
                        <PhoneCall size={12} />
                        <span>Active Call</span>
                        <span className="adc-call-duration-badge">{mockCall.duration}</span>
                    </div>
                    <div className="adc-call-info">
                        <div className="adc-call-party">
                            <Phone size={13} className="adc-call-icon" />
                            <div>
                                <div className="adc-caller">{mockCall.caller}</div>
                                <div className="adc-callee">→ {mockCall.callee}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* No active call placeholder */}
            {!mockCall && isSimulating && (
                <div className="adc-section adc-no-call">
                    <Phone size={16} style={{ opacity: 0.3 }} />
                    <span>No active call</span>
                </div>
            )}

            {/* Stats */}
            {agentStats && (
                <div className="adc-section">
                    <div className="adc-section-title">
                        <Activity size={12} />
                        <span>Today's Stats</span>
                    </div>
                    <div className="adc-stats-grid">
                        <div className="adc-stat">
                            <div className="adc-stat-value">{agentStats.todayCalls}</div>
                            <div className="adc-stat-label">Calls</div>
                        </div>
                        <div className="adc-stat">
                            <div className="adc-stat-value">{agentStats.totalTalkTime}</div>
                            <div className="adc-stat-label">Talk Time</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="adc-actions">
                <button
                    onClick={handleMonitor}
                    className={`adc-btn adc-btn-monitor ${isMonitoring ? 'active' : ''}`}
                >
                    {isMonitoring ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
                    <span>{monitorLabel}</span>
                </button>
                <Button variant="none" onClick={onMessage} className="adc-btn adc-btn-message">
                    <MessageSquare size={15} />
                    <span>Message</span>
                </Button>
            </div>

            {/* Auto-monitor hint */}
            {!isOnCall && !isRinging && !isMonitoring && isSimulating && (
                <div className="adc-auto-hint">
                    Will auto-start monitoring when a call begins
                </div>
            )}
        </div>
    );
};
