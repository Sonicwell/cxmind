import React from 'react';
import WidgetInfoTooltip from './WidgetInfoTooltip';
import '../../styles/shared-dashboard.css';

export interface ChartPanelProps {
    /** Chart/panel title text */
    title: string;
    /** Icon element before the title */
    icon?: React.ReactNode;
    /** WidgetInfoTooltip i18n key prefix (e.g. 'roiTrend') */
    infoKey?: string;
    /** Panel contents (chart, table, etc.) */
    children: React.ReactNode;
    /** Extra CSS class */
    className?: string;
    /** Extra inline style */
    style?: React.CSSProperties;
}

/**
 * Unified chart panel container for Dashboard / Analytics / ROI pages.
 * Based on ROI page visual design.
 */
const ChartPanel: React.FC<ChartPanelProps> = ({ title, icon, infoKey, children, className, style }) => {
    return (
        <div className={`chart-panel ${className || ''}`} style={style}>
            {infoKey && !title && (
                <WidgetInfoTooltip info={{
                    descriptionKey: `widgetInfo.${infoKey}.desc`,
                    sourceKey: `widgetInfo.${infoKey}.source`,
                    calculationKey: `widgetInfo.${infoKey}.calc`,
                }} />
            )}
            {title && (
                <h3 className="chart-panel-title">
                    {icon}
                    {title}
                    {infoKey && (
                        <WidgetInfoTooltip inline info={{
                            descriptionKey: `widgetInfo.${infoKey}.desc`,
                            sourceKey: `widgetInfo.${infoKey}.source`,
                            calculationKey: `widgetInfo.${infoKey}.calc`,
                        }} />
                    )}
                </h3>
            )}
            {children}
        </div>
    );
};

export default ChartPanel;
