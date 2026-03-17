import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDemoMode } from './useDemoMode';

// Reset localStorage and import.meta.env between tests
beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('import', { meta: { env: { VITE_MOCK_MODE: 'false' } } });
});

afterEach(() => vi.restoreAllMocks());

describe('useDemoMode', () => {
    it('returns false by default', () => {
        const { result } = renderHook(() => useDemoMode());
        expect(result.current.demoMode).toBe(false);
    });

    it('returns true when localStorage has demo mode on', () => {
        localStorage.setItem('cxmind:demo-mode', 'true');
        const { result } = renderHook(() => useDemoMode());
        expect(result.current.demoMode).toBe(true);
    });

    it('setDemoMode updates localStorage and dispatches event', () => {
        const eventSpy = vi.fn();
        window.addEventListener('demo-mode-changed', eventSpy);

        const { result } = renderHook(() => useDemoMode());
        act(() => result.current.setDemoMode(true));

        expect(localStorage.getItem('cxmind:demo-mode')).toBe('true');
        expect(eventSpy).toHaveBeenCalled();

        window.removeEventListener('demo-mode-changed', eventSpy);
    });

    it('responds to external storage events', async () => {
        const { result } = renderHook(() => useDemoMode());
        expect(result.current.demoMode).toBe(false);

        // Simulate external change
        localStorage.setItem('cxmind:demo-mode', 'true');
        act(() => window.dispatchEvent(new Event('storage')));

        await waitFor(() => {
            expect(result.current.demoMode).toBe(true);
        });
    });
});
