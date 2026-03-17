import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { AuditStats } from '../../types/audit';
import { useTranslation } from 'react-i18next';
import WidgetInfoTooltip from '../ui/WidgetInfoTooltip';

interface AuditCategoryChartProps {
    data: AuditStats[];
    loading?: boolean;
}

const COLORS: Record<string, string> = {
    auth: '#818cf8',
    user_management: '#34d399',
    client_management: '#a78bfa',
    agent_management: '#fbbf24',
    call_access: '#f87171',
    knowledge_base: '#22d3ee',
    ai_config: '#f472b6',
    monitoring: '#818cf8',
    mfa: '#2dd4bf',
};


const AuditCategoryChart: React.FC<AuditCategoryChartProps> = ({ data, loading = false }) => {
    const { t } = useTranslation();

    const CATEGORY_LABELS: Record<string, string> = {
        auth: t('audit.cat_auth'),
        user_management: t('audit.cat_user_mgmt'),
        client_management: t('audit.cat_client_mgmt'),
        agent_management: t('audit.cat_agent_mgmt'),
        call_access: t('audit.cat_call_access'),
        knowledge_base: t('audit.cat_knowledge_base'),
        ai_config: t('audit.cat_ai_config'),
        monitoring: t('audit.cat_monitoring'),
        mfa: t('audit.cat_mfa'),
    };

    if (loading) {
        return (
            <div className="glass-panel audit-chart-panel">
                <h3>{t('audit.eventsByCategory')}</h3>
                <div className="chart-empty">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="glass-panel audit-chart-panel">
                <h3>{t('audit.eventsByCategory')}</h3>
                <div className="chart-empty">{t('audit.noAuditData')}</div>
            </div>
        );
    }

    const chartData = data.map((item) => ({
        name: CATEGORY_LABELS[item.category] || item.category,
        value: item.count,
        category: item.category,
    }));

    return (
        <div className="glass-panel audit-chart-panel" style={{ position: 'relative' }}>
            <WidgetInfoTooltip info={{
                descriptionKey: 'widgetInfo.auditByCategory.desc',
                sourceKey: 'widgetInfo.auditByCategory.source',
                calculationKey: 'widgetInfo.auditByCategory.calc',
            }} />
            <h3>{t('audit.eventsByCategory')}</h3>
            <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => {
                            const pct = ((percent || 0) * 100).toFixed(0);
                            return `${name}: ${pct}%`;
                        }}
                        outerRadius={90}
                        dataKey="value"
                    >
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={COLORS[entry.category] || '#6B7280'}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            background: 'rgba(15, 23, 42, 0.92)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            color: '#e2e8f0',
                            fontSize: '0.78rem',
                        }}
                    />
                    <Legend
                        wrapperStyle={{ color: 'var(--text-muted)' }}
                        formatter={(value) => <span style={{ color: 'var(--text-secondary)' }}>{value}</span>}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default AuditCategoryChart;
