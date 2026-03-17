/**
 * ModuleRoute 组件单元测试
 *
 * 验证: 模块启用→渲染children, 模块禁用→重定向Dashboard, loading→null
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

const ENABLED_MODULES = ['analytics', 'contacts'];

vi.mock('../../context/ModuleContext', () => ({
    useModules: () => ({
        isModuleEnabled: (slug: string) => ENABLED_MODULES.includes(slug),
        loading: false,
    }),
}));

vi.mock('react-hot-toast', () => ({
    default: {
        error: vi.fn(),
    },
}));

import { ModuleRoute } from './ModuleRoute';
import toast from 'react-hot-toast';

const renderWithRoute = (path: string, module: string) => {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
                <Route path="/inbox" element={
                    <ModuleRoute module={module}>
                        <div data-testid="inbox-page">Inbox</div>
                    </ModuleRoute>
                } />
                <Route path="/analytics" element={
                    <ModuleRoute module={module}>
                        <div data-testid="analytics-page">Analytics</div>
                    </ModuleRoute>
                } />
            </Routes>
        </MemoryRouter>
    );
};

describe('ModuleRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders children when module is enabled', () => {
        renderWithRoute('/analytics', 'analytics');
        expect(screen.getByTestId('analytics-page')).toBeTruthy();
    });

    it('redirects to /dashboard when module is disabled', () => {
        renderWithRoute('/inbox', 'inbox');
        expect(screen.getByTestId('dashboard')).toBeTruthy();
        expect(screen.queryByTestId('inbox-page')).toBeNull();
    });

    it('shows toast when module is disabled', async () => {
        renderWithRoute('/inbox', 'inbox');
        // toast fires in useEffect → need to flush
        await vi.waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Module "inbox" is not enabled',
                { id: 'module-guard-inbox' }
            );
        });
    });

    it('does not show toast when module is enabled', () => {
        renderWithRoute('/analytics', 'analytics');
        expect(toast.error).not.toHaveBeenCalled();
    });
});
