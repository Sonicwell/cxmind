import React from 'react';
import { TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardAnalytics } from '../../../dashboard/DashboardContext';

/**
 * Compact Outcome Card for Agent Map — shows today's outcome counts.
 */
const OutcomeCard: React.FC = () => {
    const { t } = useTranslation();
    const { outcomeStats, outcomeLoading } = useDashboardAnalytics();

    if (outcomeLoading || !outcomeStats) {
        return (
            <div className="slot-card">
                <h4 className="slot-card-header">
                    <TrendingUp size={14} style={{ marginRight: 4 }} /> {t('agentMap.cards.outcomes', 'Outcomes')}
                </h4>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '8px 0' }}>
                    {t('common.loading', 'Loading...')}
                </div>
            </div>
        );
    }

    const { distribution: d, conversion_rate } = outcomeStats;

    return (
        <div className="slot-card">
            <h4 className="slot-card-header">
                <TrendingUp size={14} style={{ marginRight: 4 }} /> {t('agentMap.cards.outcomes', 'Outcomes')}
            </h4>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '6px 0', fontSize: 13 }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{d.success}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{t('agentMap.cards.closed', 'Closed')}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{d.failure}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{t('agentMap.cards.lost', 'Lost')}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{d.follow_up}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{t('agentMap.cards.followUp', 'Follow-up')}</div>
                </div>
            </div>
            <div style={{
                textAlign: 'center', padding: '4px 0', fontSize: 12,
                color: 'var(--text-secondary)', borderTop: '1px solid var(--glass-border)'
            }}>
                {t('agentMap.cards.convRate', 'Conv. Rate')}: <strong style={{ color: '#10b981' }}>{(conversion_rate * 100).toFixed(1)}%</strong>
            </div>
        </div>
    );
};

export default OutcomeCard;
