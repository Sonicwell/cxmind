import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', noPadding = false, ...props }) => {
    return (
        <div
            className={`card-base ${className}`}
            style={{
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md, 0.75rem)',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                ...(noPadding ? {} : { padding: '1.5rem' })
            }}
            {...props}
        >
            {children}
        </div>
    );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', style, ...props }) => {
    return (
        <div
            className={className}
            style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-tertiary)',
                ...style
            }}
            {...props}
        >
            {children}
        </div>
    );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', style, ...props }) => {
    return (
        <div
            className={className}
            style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.5rem',
                ...style
            }}
            {...props}
        >
            {children}
        </div>
    );
};
