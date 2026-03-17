import { useState, useEffect, useRef } from 'react';

/**
 * useCountUp – animates a numeric value from 0 to `target` on mount/change.
 * Pure requestAnimationFrame, zero dependencies.
 */
export function useCountUp(target: number, duration = 600): number {
    const [value, setValue] = useState(0);
    const prevTarget = useRef(0);

    useEffect(() => {
        if (target === prevTarget.current) return;
        const start = prevTarget.current;
        prevTarget.current = target;

        const startTime = performance.now();
        let raf: number;

        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = start + (target - start) * eased;

            setValue(Number.isInteger(target) ? Math.round(current) : parseFloat(current.toFixed(1)));

            if (progress < 1) {
                raf = requestAnimationFrame(step);
            }
        };

        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);

    return value;
}
