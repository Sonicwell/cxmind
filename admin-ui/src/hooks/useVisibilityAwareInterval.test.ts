import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVisibilityAwareInterval } from './useVisibilityAwareInterval';

describe('useVisibilityAwareInterval', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should call callback at interval when page is visible', () => {
        const cb = vi.fn();
        renderHook(() => useVisibilityAwareInterval(cb, 1000));
        vi.advanceTimersByTime(3000);
        expect(cb).toHaveBeenCalledTimes(3);
    });

    it('should not call callback when enabled is false', () => {
        const cb = vi.fn();
        renderHook(() => useVisibilityAwareInterval(cb, 1000, false));
        vi.advanceTimersByTime(3000);
        expect(cb).not.toHaveBeenCalled();
    });

    it('should stop interval when page becomes hidden', () => {
        const cb = vi.fn();
        renderHook(() => useVisibilityAwareInterval(cb, 1000));

        vi.advanceTimersByTime(2000);
        expect(cb).toHaveBeenCalledTimes(2);

        // 模拟Tab切走
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        vi.advanceTimersByTime(5000);
        // 不应再增长
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it('should resume and fire immediately when page becomes visible again', () => {
        const cb = vi.fn();
        renderHook(() => useVisibilityAwareInterval(cb, 1000));

        // 先切hidden
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        cb.mockClear();

        // 回来
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        // 立即执行一次
        expect(cb).toHaveBeenCalledTimes(1);

        // interval恢复
        vi.advanceTimersByTime(2000);
        expect(cb).toHaveBeenCalledTimes(3);
    });

    it('should cleanup on unmount', () => {
        const cb = vi.fn();
        const { unmount } = renderHook(() => useVisibilityAwareInterval(cb, 1000));

        vi.advanceTimersByTime(2000);
        expect(cb).toHaveBeenCalledTimes(2);

        unmount();
        cb.mockClear();

        vi.advanceTimersByTime(5000);
        expect(cb).not.toHaveBeenCalled();
    });
});
