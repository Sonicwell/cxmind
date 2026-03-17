import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '', style, ...props }) => {
    let bgColor = 'var(--bg-tertiary)';
    let color = 'var(--text-secondary)';
    let border = '1px solid var(--border-color)';

    switch (variant) {
        case 'success':
            bgColor = 'rgba(16, 185, 129, 0.1)';
            color = '#10b981';
            border = '1px solid rgba(16, 185, 129, 0.2)';
            break;
        case 'danger':
            bgColor = 'rgba(239, 68, 68, 0.1)';
            color = '#ef4444';
            border = '1px solid rgba(239, 68, 68, 0.2)';
            break;
        case 'warning':
            bgColor = 'rgba(245, 158, 11, 0.1)';
            color = '#f59e0b';
            border = '1px solid rgba(245, 158, 11, 0.2)';
            break;
        case 'info':
            bgColor = 'rgba(6, 182, 212, 0.1)';
            color = '#06b6d4'; /* brand cyan */
            border = '1px solid rgba(6, 182, 212, 0.2)';
            break;
        default:
            break;
    }

    return (
        <span
            className={className}
            style={{
                backgroundColor: bgColor,
                color,
                border,
                padding: '0.125rem 0.625rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                ...style
            }}
            {...props}
        >
            {children}
        </span>
    );
};
