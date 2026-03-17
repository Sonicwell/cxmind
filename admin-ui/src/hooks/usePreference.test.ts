import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePreference } from './usePreference';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockRejectedValue({ response: { status: 404 } }),
        put: vi.fn().mockResolvedValue({ data: {} }),
    },
}));

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe('usePreference', () => {
    it('returns default value when no stored preference', () => {
        const { result } = renderHook(() => usePreference('theme', 'dark'));
        expect(result.current.data).toBe('dark');
    });

    it('reads from localStorage on mount', () => {
        localStorage.setItem('cxmind_pref_layout', JSON.stringify('grid'));
        const { result } = renderHook(() => usePreference('layout', 'list'));
        expect(result.current.data).toBe('grid');
    });

    it('provides a save function', () => {
        const { result } = renderHook(() => usePreference('sort', 'asc'));
        expect(typeof result.current.save).toBe('function');
    });

    it('starts with loading true', () => {
        const { result } = renderHook(() => usePreference('x', 'y'));
        // loading is initially true
        expect(result.current.loading).toBe(true);
    });

    it('resolves loading to false after API call', async () => {
        const { result } = renderHook(() => usePreference('x', 'y'));
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
    });
});
