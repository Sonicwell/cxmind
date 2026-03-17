import React, { useMemo } from 'react';
import { Phone, Headphones, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardLive } from '../../../dashboard/DashboardContext';

interface LiveCallsCardProps {
    agents: Record<string, any>;
    isSimulating: boolean;
}

const LiveCallsCard: React.FC<LiveCallsCardProps> = ({ agents, isSimulating }) => {
    const { t } = useTranslation();
    const { liveCalls: realCalls } = useDashboardLive();

    const activeCalls = useMemo(() => {
        if (isSimulating) {
            // 模拟模式：从 agents 状态 mock 通话列表
            return Object.values(agents)
                .filter((a: any) => a.status === 'oncall')
                .map((a: any, i: number) => ({
                    agentName: a.name,
                    agentId: a.id,
                    caller: `+1 (555) ${String(100 + i).padStart(3, '0')}-${String(1000 + Math.floor(Math.random() * 9000))}`,
                    duration: `${Math.floor(Math.random() * 10)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
                    direction: Math.random() > 0.5 ? 'inbound' : 'outbound',
                }));
        }

        // 真实模式：从 DashboardContext liveCalls 获取
        return (realCalls || []).map((call: any) => {
            const durSec = Number(call.duration) || 0;
            const mins = Math.floor(durSec / 60);
            const secs = durSec % 60;
            return {
                agentName: call.callee || 'Agent',
                agentId: call.call_id,
                caller: call.caller || 'Unknown',
                duration: `${mins}:${String(secs).padStart(2, '0')}`,
                direction: (call.caller || '').includes('outbound') ? 'outbound' : 'inbound',
            };
        });
    }, [agents, isSimulating, realCalls]);

    return (
        <div className="slot-card live-calls-card">
            <div className="slot-card-header">
                <Phone size={14} />
                <span>{t('agentMap.cards.liveCalls', 'LIVE CALLS')}</span>
                <span className="slot-card-badge">{activeCalls.length}</span>
            </div>
            <div className="live-calls-list">
                {activeCalls.length === 0 && (
                    <div className="live-calls-empty">{t('agentMap.cards.noActiveCalls', 'No active calls')}</div>
                )}
                {activeCalls.map((call, i) => (
                    <div key={i} className="live-call-row">
                        <div className="live-call-agent">
                            <Headphones size={12} />
                            <span>{call.agentName}</span>
                        </div>
                        <div className="live-call-caller">{call.caller}</div>
                        <div className="live-call-meta">
                            <Clock size={10} />
                            <span>{call.duration}</span>
                            <span className={`live-call-dir ${call.direction}`}>
                                {call.direction === 'inbound' ? t('agentMap.cards.dirIn', '↓ IN') : t('agentMap.cards.dirOut', '↑ OUT')}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LiveCallsCard;
