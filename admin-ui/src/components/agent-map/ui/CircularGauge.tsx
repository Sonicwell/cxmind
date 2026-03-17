import React from 'react';

interface CircularGaugeProps {
    value: number;
    max?: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    trackColor?: string;
    label?: string;
    subLabel?: string;
    icon?: React.ReactNode;
    formatValue?: (v: number) => string;
}

export const CircularGauge: React.FC<CircularGaugeProps> = ({
    value,
    max = 100,
    size = 80,
    strokeWidth = 8,
    color = '#3b82f6',
    trackColor = 'rgba(255, 255, 255, 0.1)',
    label,
    subLabel,
    icon,
    formatValue = (v) => `${Math.round(v)}%`
}) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const progress = Math.min(Math.max(value / max, 0), 1);
    const dashoffset = circumference - progress * circumference;

    return (
        <div className="circular-gauge-container" style={{ width: size, height: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: size, height: size }}>
                {/* SVG Ring */}
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    style={{ transform: 'rotate(-90deg)' }}
                >
                    {/* Track */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="transparent"
                        stroke={trackColor}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                    {/* Progress */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="transparent"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashoffset}
                        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                </svg>

                {/* Center Content */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white'
                    }}
                >
                    {icon && <div style={{ marginBottom: 2, opacity: 0.8 }}>{icon}</div>}
                    <div style={{ fontSize: size * 0.22, fontWeight: 700, lineHeight: 1 }}>
                        {formatValue(value)}
                    </div>
                    {subLabel && (
                        <div style={{ fontSize: size * 0.15, opacity: 0.6, marginTop: 2 }}>
                            {subLabel}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Label */}
            {label && (
                <div style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: '#94a3b8',
                    textAlign: 'center',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                }}>
                    {label}
                </div>
            )}
        </div>
    );
};
