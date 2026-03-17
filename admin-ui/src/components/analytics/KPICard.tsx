import React from 'react';
import WidgetInfoTooltip from '../ui/WidgetInfoTooltip';

export interface KPICardProps {
    label: string;
    value: string;
    color: string;
    icon: React.ReactNode;
    sub?: string;
    status?: 'good' | 'warn';
    change?: number;
    infoKey?: string;
}

export const KPICard: React.FC<KPICardProps> = ({ label, value, color, icon, sub, status, change, infoKey }) => (
    <div className={`analytics-kpi-card glass-panel kpi-${color}`} style={{ position: 'relative' }}>
        <span className="analytics-kpi-label flex justify-between items-center">
            <span className="flex items-center gap-1">
                {icon} {label}
                {infoKey && <WidgetInfoTooltip inline info={{
                    descriptionKey: `widgetInfo.${infoKey}.desc`,
                    sourceKey: `widgetInfo.${infoKey}.source`,
                    calculationKey: `widgetInfo.${infoKey}.calc`,
                }} />}
            </span>
        </span>
        <span className="analytics-kpi-value" style={{
            color: status === 'good' ? '#10b981' : status === 'warn' ? '#f59e0b' : '#1e293b'
        }}>{value}</span>
        {sub && <span className="analytics-kpi-sub">{sub}</span>}
        {change !== undefined && (
            <span className={`text-xs font-bold ${change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
            </span>
        )}
    </div>
);
