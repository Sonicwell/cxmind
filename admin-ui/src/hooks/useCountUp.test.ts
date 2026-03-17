import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCountUp } from './useCountUp';

// Mock requestAnimationFrame to run synchronously
beforeEach(() => {
    vi.useFakeTimers();
    let rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        rafId++;
        setTimeout(() => cb(performance.now()), 16);
        return rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

describe('useCountUp', () => {
    it('starts at 0', () => {
        const { result } = renderHook(() => useCountUp(100));
        expect(result.current).toBe(0);
    });

    it('returns a number', () => {
        const { result } = renderHook(() => useCountUp(50));
        expect(typeof result.current).toBe('number');
    });
});
