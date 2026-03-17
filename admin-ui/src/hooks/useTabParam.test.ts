import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useTabParam } from './useTabParam';
import React from 'react';

const wrapper = ({ children }: any) =>
    React.createElement(MemoryRouter, { initialEntries: ['/'] }, children);

describe('useTabParam', () => {
    it('returns default value when no param in URL', () => {
        const { result } = renderHook(
            () => useTabParam('tab', 'agents'),
            { wrapper }
        );
        expect(result.current[0]).toBe('agents');
    });

    it('returns value from URL search params', () => {
        const urlWrapper = ({ children }: any) =>
            React.createElement(MemoryRouter, { initialEntries: ['/?tab=settings'] }, children);

        const { result } = renderHook(
            () => useTabParam('tab', 'agents'),
            { wrapper: urlWrapper }
        );
        expect(result.current[0]).toBe('settings');
    });

    it('provides a setter function', () => {
        const { result } = renderHook(
            () => useTabParam('tab', 'agents'),
            { wrapper }
        );
        expect(typeof result.current[1]).toBe('function');
    });

    it('updates tab value when setter is called', () => {
        const { result } = renderHook(
            () => useTabParam('tab', 'agents'),
            { wrapper }
        );
        // 调用 setter 更新 tab 值
        const setTab = result.current[1];
        expect(() => setTab('agents')).not.toThrow();
    });
});
