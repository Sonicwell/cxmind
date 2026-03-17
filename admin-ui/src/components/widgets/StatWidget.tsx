import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';

export interface StatWidgetProps {
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
    label: string;
    value: string | number;
    sub: string;
}

const AnimatedValue: React.FC<{ value: string | number }> = ({ value }) => {
    // Skip animation for formatted strings like "3:10" — parseFloat("2:00") silently
    // truncates to 2, which is incorrect.  Only animate pure numeric strings.
    if (typeof value === 'string' && /[^0-9.\-,]/.test(value.replace(/,/g, ''))) {
        return <>{value}</>;
    }
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    const animated = useCountUp(isNaN(numValue) ? 0 : numValue);

    if (typeof value === 'string' && isNaN(numValue)) {
        return <>{value}</>;
    }

    return <>{typeof value === 'number' && Number.isInteger(value) ? animated.toLocaleString() : animated}</>;
};

const StatWidget: React.FC<StatWidgetProps> = ({ icon: Icon, iconBg, iconColor, label, value, sub }) => (
    <div className="stat-card glass-panel" style={{ height: '100%' }}>
        <div className="stat-icon" style={{ background: iconBg, color: iconColor }}>
            <Icon size={24} />
        </div>
        <div>
            <h3>{label}</h3>
            <p className="stat-value"><AnimatedValue value={value} /></p>
            <span className="stat-sub">{sub}</span>
        </div>
    </div>
);

export default StatWidget;
