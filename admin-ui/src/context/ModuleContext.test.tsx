import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

// Mock API
vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({
            data: {
                modules: [
                    { slug: 'analytics', tier: 'optional', enabled: true },
                    { slug: 'knowledge', tier: 'optional', enabled: false },
                    { slug: 'monitoring', tier: 'core', enabled: true },
                ],
            },
        }),
    },
}));

describe('ModuleContext', () => {
    let ModuleProvider: any;
    let useModules: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('./ModuleContext');
        ModuleProvider = mod.ModuleProvider;
        useModules = mod.useModules;
    });

    const wrapper = ({ children }: any) =>
        React.createElement(ModuleProvider, null, children);

    it('starts with loading true', () => {
        const { result } = renderHook(() => useModules(), { wrapper });
        expect(result.current.loading).toBe(true);
    });

    it('loads modules from API', async () => {
        const { result } = renderHook(() => useModules(), { wrapper });
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.modules.length).toBeGreaterThan(0);
    });

    it('isModuleEnabled returns correct state', async () => {
        const { result } = renderHook(() => useModules(), { wrapper });
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.isModuleEnabled('analytics')).toBe(true);
        expect(result.current.isModuleEnabled('knowledge')).toBe(false);
    });
});
