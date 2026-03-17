
import React, { useEffect, useRef, useState } from 'react';

interface LazySectionProps {
    children: React.ReactNode;
    /** Callback when section becomes visible. Use this to trigger data fetching. */
    onVisible?: () => void;
    /** Optional delay before rendering content after visible */
    renderDelay?: number;
    className?: string;
    /** Height to occupy while loading (prevents layout shift) */
    minHeight?: string | number;
    title?: string;
    icon?: React.ReactNode;
}

/**
 * LazySection
 * A wrapper that detects when it enters the viewport and triggers onVisible.
 * It also handles the loading state visualization.
 */
export const LazySection: React.FC<LazySectionProps> = ({
    children,
    onVisible,
    renderDelay = 0,
    className = '',
    minHeight = 300,
    title,
    icon
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const hasTriggered = useRef(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasTriggered.current) {
                    hasTriggered.current = true;
                    setIsVisible(true);
                    if (onVisible) onVisible();

                    if (renderDelay > 0) {
                        setTimeout(() => setShouldRender(true), renderDelay);
                    } else {
                        setShouldRender(true);
                    }

                    // Once visible, we can stop observing
                    if (containerRef.current) {
                        observer.unobserve(containerRef.current);
                    }
                }
            },
            {
                root: null, // viewport
                rootMargin: '100px', // Trigger 100px before entering viewport
                threshold: 0.1
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) {
                observer.unobserve(containerRef.current);
            }
        };
    }, [onVisible, renderDelay]);

    return (
        <div
            ref={containerRef}
            className={`analytics-lazy-section ${className}`}
            style={{ minHeight: isVisible ? 'auto' : minHeight }}
        >
            {shouldRender ? (
                <>
                    {title && (
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            background: 'var(--glass-bg)',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
                            marginBottom: '1rem', backdropFilter: 'blur(8px)'
                        }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                {icon} {title}
                            </h2>
                        </div>
                    )}
                    {children}
                </>
            ) : (
                <div className="flex items-center justify-center w-full h-full text-sm" style={{ color: 'var(--text-muted)' }}>
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    </div>
                </div>
            )}
        </div>
    );
};
