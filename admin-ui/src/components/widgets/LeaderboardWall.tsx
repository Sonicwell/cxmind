import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Flame, TrendingUp, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDemoMode } from '../../hooks/useDemoMode';
import { getMockLeaderboard } from '../../services/mock-data';
import api from '../../services/api';
import { Button } from '../ui/button';

interface LeaderboardEntry {
    rank: number;
    agentId: string;
    agentName?: string;
    totalCalls: number;
    conversions: number;
    avgDurationMin: number;
    avgMOS: number;
    streak: number;
}

interface LeaderboardData {
    period: string;
    metric: string;
    generatedAt: string;
    leaderboard: LeaderboardEntry[];
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze
const MEDAL_ICONS = [Crown, Medal, Medal];

const LeaderboardWall: React.FC<{ fullscreen?: boolean }> = ({ fullscreen }) => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [data, setData] = useState<LeaderboardData | null>(null);
    const [metric, setMetric] = useState('conversions');
    const [period, setPeriod] = useState('today');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 60000); // refresh every 60s
        return () => clearInterval(interval);
    }, [metric, period, demoMode]);

    const fetchLeaderboard = async () => {
        setLoading(true);
        try {
            if (demoMode) {
                setData(getMockLeaderboard(period, metric));
            } else {
                const res = await api.get(
                    `/platform/leaderboard?period=${period}&metric=${metric}&limit=10`,
                );
                if (res.status === 200) setData(res.data);
            }
        } catch (err) {
            console.error('Leaderboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const getMetricValue = (entry: LeaderboardEntry): string | number => {
        switch (metric) {
            case 'conversions': return entry.conversions;
            case 'satisfaction': return entry.avgMOS;
            case 'calls': return entry.totalCalls;
            case 'duration': return `${entry.avgDurationMin}m`;
            default: return entry.conversions;
        }
    };

    return (
        <div className={`leaderboard-wall glass-panel ${fullscreen ? 'leaderboard-fullscreen' : ''}`} style={{
            padding: '1.25rem', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--glass-border)',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Trophy size={20} style={{ color: '#FFD700' }} />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t('leaderboard.title', 'Agent Leaderboard')}
                    </h3>
                </div>

                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {['today', 'week', 'month'].map(p => (
                        <Button key={p} onClick={() => setPeriod(p)}
                            style={{
                                padding: '3px 8px', fontSize: '0.7rem', borderRadius: '4px',
                                background: period === p ? 'var(--primary)' : 'transparent',
                                color: period === p ? 'white' : 'var(--text-muted)',
                                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                            }}>
                            {t(`leaderboard.${p}`, p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month')}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Metric tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {[
                    { key: 'conversions', label: t('leaderboard.conversions', 'Conversions') },
                    { key: 'calls', label: t('leaderboard.calls', 'Calls') },
                    { key: 'satisfaction', label: t('leaderboard.satisfaction', 'Satisfaction') },
                ].map(m => (
                    <Button key={m.key} onClick={() => setMetric(m.key)}
                        style={{
                            padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px',
                            background: metric === m.key
                                ? 'var(--primary)'
                                : 'var(--bg-card)',
                            color: metric === m.key ? 'white' : 'var(--text-secondary)',
                            border: `1px solid ${metric === m.key ? 'transparent' : 'var(--glass-border)'}`,
                            cursor: 'pointer', fontWeight: metric === m.key ? 600 : 400,
                            transition: 'all 0.2s',
                        }}>
                        {m.label}
                    </Button>
                ))}
            </div>

            {/* Leaderboard rows */}
            {
                loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="skeleton shimmer" style={{ height: '3rem', borderRadius: '8px' }} />
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {data?.leaderboard.map((entry, idx) => {
                            const isTop3 = idx < 3;
                            const MedalIcon = isTop3 ? MEDAL_ICONS[idx] : TrendingUp;
                            const medalColor = isTop3 ? MEDAL_COLORS[idx] : 'var(--text-muted)';

                            return (
                                <div key={entry.agentId} className="leaderboard-row" style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.6rem 0.75rem', borderRadius: '8px',
                                    background: isTop3
                                        ? `linear-gradient(135deg, ${medalColor}08, ${medalColor}03)`
                                        : 'var(--bg-card)',
                                    border: `1px solid ${isTop3 ? `${medalColor}30` : 'var(--glass-border)'}`,
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                }}>
                                    {/* Rank */}
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: isTop3 ? `${medalColor}20` : 'var(--bg-sidebar)',
                                        flexShrink: 0,
                                    }}>
                                        <MedalIcon size={14} style={{ color: medalColor }} />
                                    </div>

                                    {/* Agent info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.85rem', fontWeight: isTop3 ? 700 : 500,
                                            color: 'var(--text-primary)', whiteSpace: 'nowrap',
                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {entry.agentName || entry.agentId}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            {entry.totalCalls} {t('leaderboard.callsLabel', 'calls')}
                                        </div>
                                    </div>

                                    {/* Streak */}
                                    {entry.streak > 0 && (
                                        <span style={{
                                            display: 'flex', alignItems: 'center', gap: '2px',
                                            fontSize: '0.7rem', color: '#FF6B35',
                                        }}>
                                            <Flame size={12} /> {entry.streak}
                                        </span>
                                    )}

                                    {/* Metric value */}
                                    <div style={{
                                        fontSize: '1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                        color: isTop3 ? medalColor : 'var(--text-primary)',
                                        minWidth: '3rem', textAlign: 'right',
                                    }}>
                                        {getMetricValue(entry)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            }
        </div >
    );
};

export default LeaderboardWall;
