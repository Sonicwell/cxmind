import React, { useState, useEffect } from 'react';
import { Trophy, Medal, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../../services/api';

interface LeaderboardCardProps {
    agents: Record<string, any>;
    isSimulating: boolean;
}

interface RankEntry {
    agent_id: string;
    name: string;
    total_calls: number;
    avg_handle_time: number;
    avg_qi_score: number;
    conversion_rate: number;
}

const LeaderboardCard: React.FC<LeaderboardCardProps> = ({ agents, isSimulating }) => {
    const { t } = useTranslation();
    const [rankings, setRankings] = useState<RankEntry[]>([]);

    useEffect(() => {
        if (isSimulating) {
            // 模拟模式 mock 排行
            const agentList = Object.values(agents).filter((a: any) => a.status !== 'offline');
            const mock = agentList.slice(0, 5).map((a: any) => ({
                agent_id: a.id,
                name: a.name,
                total_calls: Math.floor(10 + Math.random() * 30),
                avg_handle_time: Math.round(120 + Math.random() * 180),
                avg_qi_score: Math.round(60 + Math.random() * 35),
                conversion_rate: Math.round(20 + Math.random() * 60),
            }));
            // 按 total_calls 排序
            mock.sort((a, b) => b.total_calls - a.total_calls);
            setRankings(mock);
            return;
        }

        // 真实模式：从 API 拉取
        let cancelled = false;
        const fetchLeaderboard = async () => {
            try {
                const res = await api.get('/analytics/sla/agent-leaderboard?days=1');
                const data = res.data?.data || [];
                if (cancelled) return;
                // agent_id 是 sipNumber，尝试匹配 agents 中的名字
                const mapped: RankEntry[] = data.slice(0, 5).map((r: any) => {
                    const match = Object.values(agents).find((a: any) =>
                        a.extension === r.agent_id || a.sipNumber === r.agent_id || a.id === r.agent_id
                    );
                    return {
                        agent_id: r.agent_id,
                        name: match?.name || r.agent_id,
                        total_calls: Number(r.total_calls) || 0,
                        avg_handle_time: Number(r.avg_handle_time) || 0,
                        avg_qi_score: Number(r.avg_qi_score) || 0,
                        conversion_rate: Number(r.conversion_rate) || 0,
                    };
                });
                setRankings(mapped);
            } catch { if (!cancelled) setRankings([]); }
        };
        fetchLeaderboard();
        const iv = setInterval(fetchLeaderboard, 30_000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [isSimulating, agents]);

    const getMedalColor = (idx: number) => {
        if (idx === 0) return '#fbbf24'; // gold
        if (idx === 1) return '#94a3b8'; // silver
        if (idx === 2) return '#d97706'; // bronze
        return '#475569';
    };

    const formatHandleTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.round(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div className="slot-card leaderboard-card">
            <div className="slot-card-header">
                <Trophy size={14} />
                <span>{t('agentMap.cards.leaderboard', 'LEADERBOARD')}</span>
            </div>
            <div className="leaderboard-list">
                {rankings.length === 0 && (
                    <div className="leaderboard-empty">{t('agentMap.cards.noData', 'No data')}</div>
                )}
                {rankings.map((entry, idx) => (
                    <div key={entry.agent_id} className="leaderboard-row">
                        <div className="leaderboard-rank">
                            <Medal size={14} style={{ color: getMedalColor(idx) }} />
                            <span className="rank-number">{idx + 1}</span>
                        </div>
                        <div className="leaderboard-info">
                            <div className="leaderboard-name">{entry.name}</div>
                            <div className="leaderboard-stats">
                                <span>{entry.total_calls} {t('agentMap.cards.calls', 'calls')}</span>
                                <span>AHT {formatHandleTime(entry.avg_handle_time)}</span>
                                {entry.avg_qi_score > 0 && <span>QI {entry.avg_qi_score}</span>}
                            </div>
                        </div>
                        {entry.conversion_rate > 0 && (
                            <div className="leaderboard-conversion">
                                <TrendingUp size={10} />
                                <span>{entry.conversion_rate}%</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LeaderboardCard;
