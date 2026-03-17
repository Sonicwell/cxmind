import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, ThemeType } from './ThemeContext';

// Inline useTheme since it's in the same file
let useTheme: () => { theme: ThemeType; setTheme: (t: ThemeType) => void };

// Full matchMedia mock for jsdom
const mockMatchMedia = (matches: boolean) =>
    vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));

beforeEach(async () => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', mockMatchMedia(false));
    const mod = await import('./ThemeContext');
    useTheme = mod.useTheme;
});

const wrapper = ({ children }: any) =>
    React.createElement(ThemeProvider, null, children);

describe('ThemeContext', () => {
    it('defaults to dark when no stored preference', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe('dark');
    });

    it('reads theme from localStorage', () => {
        localStorage.setItem('app-theme', 'midnight');
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe('midnight');
    });

    it('setTheme updates the theme', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setTheme('cyberpunk'));
        expect(result.current.theme).toBe('cyberpunk');
    });

    it('provides a setTheme function', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(typeof result.current.setTheme).toBe('function');
    });
});
