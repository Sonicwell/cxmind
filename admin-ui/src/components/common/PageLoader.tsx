import React from 'react';

/**
 * Global fallback component displayed during Route-level Code Splitting (React.lazy).
 * Provides a minimal, centered loading spinner consistent with the app's dark theme.
 */
export const PageLoader: React.FC = () => {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                minHeight: '400px',
                width: '100%',
                background: 'var(--bg-light, transparent)',
                color: 'var(--text-secondary, #94a3b8)',
            }}
        >
            <div
                style={{
                    width: 40,
                    height: 40,
                    border: '3px solid rgba(99, 102, 241, 0.1)', // primary with low opacity
                    borderTop: '3px solid var(--primary, #6366f1)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    marginBottom: '16px',
                }}
            />
            <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '0.05em' }}>
                Loading module...
            </span>
            <style>
                {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
            </style>
        </div>
    );
};
