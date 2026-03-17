import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import WidgetInfoTooltip from './WidgetInfoTooltip';
import '../../styles/shared-dashboard.css';

export interface MetricCardProps {
    /** Metric label text */
    label: string;
    /** Formatted value string (e.g. "$1,234", "85%") */
    value: string;
    /** Lucide icon element */
    icon?: React.ReactNode;
    /** Accent color for the icon and value */
    color?: string;
    /** Subtitle / secondary info */
    sub?: string;
    /** Change percentage for badge (+/-) */
    change?: number;
    /** WidgetInfoTooltip i18n key prefix */
    infoKey?: string;
    /** Show as dimmed placeholder */
    placeholder?: boolean;
    /** Placeholder text */
    placeholderText?: string;
}

/**
 * Unified metric card for Dashboard / Analytics / ROI pages.
 * Based on ROI page visual design: compact, with colored icon accent.
 */
const MetricCard: React.FC<MetricCardProps> = ({
    label, value, icon, color = '#6b7280', sub, change, infoKey,
    placeholder, placeholderText,
}) => {
    return (
        <div
            className={`metric-card ${placeholder ? 'metric-card--placeholder' : ''}`}
            style={placeholder ? undefined : {
                background: `${color}08`,
                border: `1px solid ${color}22`,
            }}
        >
            <div className="metric-card-header">
                {icon && <span style={{ color, display: 'flex' }}>{icon}</span>}
                <span className="metric-card-label roi-metric-label">
                    {label}
                    {infoKey && (
                        <WidgetInfoTooltip inline info={{
                            descriptionKey: `widgetInfo.${infoKey}.desc`,
                            sourceKey: `widgetInfo.${infoKey}.source`,
                            calculationKey: `widgetInfo.${infoKey}.calc`,
                        }} />
                    )}
                </span>
            </div>
            <div className="metric-card-value" style={{ color }}>
                {placeholder ? '—' : value}
            </div>
            {sub && <div className="metric-card-sub">{sub}</div>}
            {change !== undefined && change !== 0 && (
                <div className={`metric-card-badge ${change > 0 ? 'metric-card-badge--up' : 'metric-card-badge--down'}`}>
                    {change > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                    {Math.abs(change)}%
                </div>
            )}
            {placeholder && placeholderText && (
                <div className="metric-card-sub">{placeholderText}</div>
            )}
        </div>
    );
};

export default MetricCard;
