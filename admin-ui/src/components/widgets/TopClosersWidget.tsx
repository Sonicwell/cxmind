import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';

const TopClosersWidget: React.FC = () => {
    const { t } = useTranslation();
    const { topClosers } = useDashboardAnalytics();

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title" style={{ margin: '0 0 8px' }}>
                <Trophy size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('topClosers.title', 'Top Closers')}
            </h3>
            {topClosers.length > 0 ? (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {topClosers.map((agent, i) => {
                        const pct = Math.round(agent.rate * 100);
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                        return (
                            <div
                                key={agent.agent_id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 10px', borderRadius: 'var(--radius-md)',
                                    background: i < 3 ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                }}
                            >
                                <span style={{ fontSize: '0.85rem', minWidth: 24, textAlign: 'center' }}>{medal}</span>
                                <span style={{ flex: '0 0 80px', fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {agent.agent_name || agent.agent_id}
                                </span>
                                <div style={{ flex: 1, height: 8, background: 'var(--glass-border)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${pct}%`, height: '100%', borderRadius: 4,
                                        background: pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444',
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
                                    {pct}%
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 24, textAlign: 'right' }}>
                                    {agent.success}/{agent.total}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{t('topClosers.noData', 'No agent data')}</div>
            )}
        </div>
    );
};

export default TopClosersWidget;
