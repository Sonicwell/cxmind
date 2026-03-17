import React from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Zap, Hash } from 'lucide-react';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';

const AICostROIWidget: React.FC = () => {
    const { t } = useTranslation();
    const { aiCostROI } = useDashboardAnalytics();

    if (!aiCostROI) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                {t('aiRoi.noData', 'No AI cost data')}
            </div>
        );
    }

    const stats = [
        {
            icon: Coins,
            label: t('aiRoi.totalCost', 'Total AI Cost'),
            value: `$${aiCostROI.total_cost.toFixed(2)}`,
            color: '#f59e0b',
        },
        {
            icon: Zap,
            label: t('aiRoi.costPerSuccess', 'Cost per Success'),
            value: `$${aiCostROI.cost_per_success.toFixed(3)}`,
            color: aiCostROI.cost_per_success < 0.01 ? '#10b981' : '#f59e0b',
        },
        {
            icon: Hash,
            label: t('aiRoi.avgTokens', 'Avg Tokens'),
            value: aiCostROI.avg_tokens.toLocaleString(),
            color: '#6366f1',
        },
    ];

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title" style={{ margin: '0 0 12px' }}>
                <Coins size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('aiRoi.title', 'AI Prediction ROI')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                {stats.map(s => (
                    <div key={s.label} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(var(--text-rgb, 255,255,255), 0.03)',
                        border: '1px solid var(--glass-border)',
                    }}>
                        <s.icon size={18} style={{ color: s.color, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.label}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                        </div>
                    </div>
                ))}
                <div style={{
                    fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center',
                    padding: '4px 0'
                }}>
                    {aiCostROI.total_predictions}' ' + t('aiRoi.predictions30d', 'predictions (30d)')
                </div>
            </div>
        </div>
    );
};

export default AICostROIWidget;
