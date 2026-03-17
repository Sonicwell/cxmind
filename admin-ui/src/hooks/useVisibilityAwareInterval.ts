import { useEffect, useRef, useCallback } from 'react';

/**
 * 页面不可见时暂停interval, 回到前台立即执行一次并恢复定时器。
 * 解决后台标签页空转浪费资源的问题。
 */
export function useVisibilityAwareInterval(
    callback: () => void,
    intervalMs: number,
    enabled: boolean = true,
): void {
    const savedCallback = useRef(callback);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 始终保持最新引用, 避免 stale closure
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    const startInterval = useCallback(() => {
        if (intervalRef.current !== null) return;
        intervalRef.current = setInterval(() => savedCallback.current(), intervalMs);
    }, [intervalMs]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            stopInterval();
            return;
        }

        // 页面可见 → 启动
        if (document.visibilityState === 'visible') {
            startInterval();
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // 回到前台: 立即刷新一次 + 恢复定时器
                savedCallback.current();
                startInterval();
            } else {
                stopInterval();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            stopInterval();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, startInterval, stopInterval]);
}
