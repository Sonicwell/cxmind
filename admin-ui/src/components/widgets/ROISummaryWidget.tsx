import React from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, Clock, Users, Shield, TrendingUp, ArrowUpRight } from 'lucide-react';
import { useDashboardAnalytics } from '../../dashboard/DashboardContext';
import { useNavigate } from 'react-router-dom';
import type { ROIMetric } from '../../dashboard/types';

const METRIC_ICONS: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
    call_duration_saved: Clock,
    asr_cost_saved: DollarSign,
    revenue_attributed: TrendingUp,
    compliance_risk_avoided: Shield,
    acw_time_saved: Clock,
    fte_equivalent: Users,
    customer_ltv_rescued: DollarSign,
};

const METRIC_COLORS: Record<string, string> = {
    call_duration_saved: '#3b82f6',
    asr_cost_saved: '#10b981',
    revenue_attributed: '#f59e0b',
    compliance_risk_avoided: '#ef4444',
    acw_time_saved: '#8b5cf6',
    fte_equivalent: '#6366f1',
    customer_ltv_rescued: '#ec4899',
};

function fmtValue(m: ROIMetric): string {
    if (m.unit === 'USD') return `$${m.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (m.unit === 'hours') return `${m.value}h`;
    if (m.unit === 'FTE') return m.value.toFixed(2);
    return String(m.value);
}

const ROISummaryWidget: React.FC = () => {
    const { t } = useTranslation();
    const { roiSummary } = useDashboardAnalytics();
    const navigate = useNavigate();

    if (!roiSummary) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                {t('roi.noData', 'No ROI data available')}
            </div>
        );
    }

    // Only show non-zero active metrics in the compact card
    const activeMetrics = roiSummary.metrics.filter(m => m.value > 0);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Header with total value */}
            <div
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 4, cursor: 'pointer',
                }}
                onClick={() => navigate('/roi')}
            >
                <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {t('roi.totalValue', 'Total ROI Value')} ({roiSummary.period_days}d)
                    </div>
                    <div style={{
                        fontSize: '1.6rem', fontWeight: 800,
                        background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                        ${roiSummary.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                </div>
                <ArrowUpRight size={16} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            </div>

            {/* Active metrics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto' }}>
                {activeMetrics.map(m => {
                    const Icon = METRIC_ICONS[m.key] || DollarSign;
                    const color = METRIC_COLORS[m.key] || '#6b7280';
                    return (
                        <div key={m.key} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', borderRadius: 'var(--radius-md)',
                            background: `${color}10`,
                            border: `1px solid ${color}22`,
                        }}>
                            <Icon size={15} style={{ color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {m.label}
                                </div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color }}>
                                    {fmtValue(m)}
                                </div>
                            </div>
                            {m.improvement_pct > 0 && (
                                <div style={{
                                    fontSize: '0.6rem', fontWeight: 600, color: '#10b981',
                                    background: '#10b98118', padding: '2px 5px', borderRadius: 4,
                                }}>
                                    +{m.improvement_pct}%
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center',
                    cursor: 'pointer', padding: '2px 0',
                }}
                onClick={() => navigate('/roi')}
            >
                {t('roi.viewFullReport', 'View Full ROI Report')} →
            </div>
        </div>
    );
};

export default ROISummaryWidget;
