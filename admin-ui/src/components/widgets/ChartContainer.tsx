import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Replaces Recharts' ResponsiveContainer to avoid the
 * "width(-1) and height(-1)" console warning.
 *
 * Measures the container via ResizeObserver and clones
 * explicit `width` / `height` props onto the single chart child
 * (LineChart, AreaChart, PieChart, etc.) only after positive
 * dimensions have been observed.
 */
const ChartContainer: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const ref = useRef<HTMLDivElement>(null);
    const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);

    const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
            // Debounce resize events to 200ms to avoid re-rendering charts
            // during the sidebar transition (which takes 300ms).
            // This ensures charts only resize AFTER the transition settles.
            if (timeoutId.current) clearTimeout(timeoutId.current);
            timeoutId.current = setTimeout(() => {
                timeoutId.current = null;
                setSize(prev =>
                    prev && prev.width === Math.round(width) && prev.height === Math.round(height)
                        ? prev
                        : { width: Math.round(width), height: Math.round(height) },
                );
            }, 200);
        }
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(handleResize);
        ro.observe(el);
        return () => {
            ro.disconnect();
            if (timeoutId.current) clearTimeout(timeoutId.current);
        };
    }, [handleResize]);

    return (
        <div ref={ref} style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
            {size && React.cloneElement(children as React.ReactElement<any>, { width: size.width, height: size.height })}
        </div>
    );
};

export default ChartContainer;
