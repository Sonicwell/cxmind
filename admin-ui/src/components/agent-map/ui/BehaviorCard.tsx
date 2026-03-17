import React, { useMemo } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardRealtime } from '../../../dashboard/DashboardContext';

interface BehaviorCardProps {
    agents: Record<string, any>;
    isSimulating: boolean;
}

const BehaviorCard: React.FC<BehaviorCardProps> = ({ agents, isSimulating }) => {
    const { t } = useTranslation();
    const { stressMap } = useDashboardRealtime();

    const data = useMemo(() => {
        if (isSimulating) {
            // 模拟模式 mock
            const onCall = Object.values(agents).filter((a: any) => a.status === 'oncall');
            if (onCall.length === 0) return { avgStress: 0, highStressCount: 0, avgTalkRatio: 0, hasData: false };
            return {
                avgStress: Math.round(30 + Math.random() * 40),
                highStressCount: Math.floor(Math.random() * 3),
                avgTalkRatio: Math.round(40 + Math.random() * 30),
                hasData: true,
            };
        }

        // 真实模式：从 DashboardContext stressMap 计算
        if (stressMap.size === 0) return { avgStress: 0, highStressCount: 0, avgTalkRatio: 0, hasData: false };

        let totalStress = 0;
        let highCount = 0;
        for (const [, snap] of stressMap) {
            const score = snap.stress_score ?? 0;
            totalStress += score;
            if (score > 70) highCount++;
        }
        return {
            avgStress: Math.round(totalStress / stressMap.size),
            highStressCount: highCount,
            avgTalkRatio: 0, // 暂无后端数据源
            hasData: true,
        };
    }, [agents, isSimulating, stressMap]);

    const stressColor = data.avgStress > 70 ? '#ef4444' : data.avgStress > 40 ? '#eab308' : '#22c55e';

    return (
        <div className="slot-card behavior-card">
            <div className="slot-card-header">
                <Activity size={14} />
                <span>{t('agentMap.cards.behavior', 'BEHAVIOR')}</span>
            </div>
            <div className="behavior-content">
                <div className="behavior-metric">
                    <div className="behavior-metric-label">{t('agentMap.cards.avgStress', 'Avg Stress')}</div>
                    <div className="behavior-metric-value" style={{ color: stressColor }}>
                        {data.hasData ? `${data.avgStress}%` : '—'}
                    </div>
                    <div className="behavior-bar">
                        <div className="behavior-bar-fill" style={{ width: `${data.avgStress}%`, backgroundColor: stressColor }} />
                    </div>
                </div>
                <div className="behavior-metric">
                    <div className="behavior-metric-label">{t('agentMap.cards.talkRatio', 'Talk Ratio')}</div>
                    <div className="behavior-metric-value">
                        {isSimulating && data.hasData ? `${data.avgTalkRatio}%` : '—'}
                    </div>
                    <div className="behavior-bar">
                        <div className="behavior-bar-fill" style={{ width: `${isSimulating ? data.avgTalkRatio : 0}%`, backgroundColor: '#3b82f6' }} />
                    </div>
                </div>
                {data.highStressCount > 0 && (
                    <div className="behavior-alert">
                        <AlertTriangle size={12} />
                        <span>{t('agentMap.cards.highStress', '{{count}} agent(s) high stress', { count: data.highStressCount })}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BehaviorCard;
