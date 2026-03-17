import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom';
import React from 'react';

// ── Module Mocks ──────────────────────────────────────────

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../components/settings/SystemHealthPanel', () => ({
    SystemHealthPanel: () => <div data-testid="system-health">System Health</div>,
}));

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: { data: {} } }),
        post: vi.fn().mockResolvedValue({ data: {} }),
    },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { role: 'platform_admin', clientId: 'c1' },
        hasPermission: () => true,
    }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ isDemoMode: false, demoMode: false }),
}));

// Import after mocks
import SettingsLayout from './SettingsLayout';

// Wrapper that renders SettingsLayout with nested routes
const renderWithRoute = (initialPath: string, childElement?: React.ReactElement) => {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route path="/settings" element={<SettingsLayout />}>
                    <Route path="general" element={<div data-testid="page-general">General Page</div>} />
                    <Route path="organization/roles" element={<div data-testid="page-roles">Roles Page</div>} />
                    <Route path="organization/sessions" element={<div data-testid="page-sessions">Sessions Page</div>} />
                    <Route path="ai/vendors" element={<div data-testid="page-ai-vendors">AI Vendors Page</div>} />
                    <Route path="ai/ser" element={<div data-testid="page-ser">SER Page</div>} />
                    <Route path="ai/vector-db" element={<div data-testid="page-vector-db">Vector DB Page</div>} />
                    <Route path="business/intents" element={<div data-testid="page-intents">Intents Page</div>} />
                    <Route path="business/schemas" element={<div data-testid="page-schemas">Schemas Page</div>} />
                    <Route path="channels/omnichannel" element={<div data-testid="page-omni">Omnichannel Page</div>} />
                    <Route path="system/general" element={<div data-testid="page-sys-config">System Config Page</div>} />
                    <Route path="system/modules" element={<div data-testid="page-modules">Modules Page</div>} />
                    <Route path="system/storage" element={<div data-testid="page-storage">Storage Page</div>} />
                    <Route path="system/smtp" element={<div data-testid="page-smtp">SMTP Page</div>} />
                </Route>
            </Routes>
        </MemoryRouter>
    );
};

describe('SettingsLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Structure ──────────────────────────────────────────

    it('renders sidebar with SETTINGS header', () => {
        renderWithRoute('/settings/general');
        // 侧边栏标题
        expect(screen.getByText('sidebar.settings')).toBeTruthy();
    });

    it('renders SystemHealthPanel on every page', () => {
        renderWithRoute('/settings/general');
        expect(screen.getByTestId('system-health')).toBeTruthy();
    });

    it('renders outlet content for general route', () => {
        renderWithRoute('/settings/general');
        expect(screen.getByTestId('page-general')).toBeTruthy();
    });

    // ── Sidebar Navigation Items ──────────────────────────

    it('renders all sidebar nav groups', () => {
        renderWithRoute('/settings/general');
        const body = document.body.textContent || '';
        // t() mock returns keys: settings.nav.organization etc
        expect(body).toContain('settings.nav.organization');
        expect(body).toContain('settings.nav.aiEngine');
        expect(body).toContain('settings.nav.businessLogic');
        expect(body).toContain('settings.nav.channels');
        expect(body).toContain('settings.nav.system');
    });

    it('renders all sidebar nav links', () => {
        renderWithRoute('/settings/general');
        const links = document.querySelectorAll('a.nav-item');
        // General(1) + Organization(2) + AI Engine(3) + Business Logic(4) + Channels(1) + System(6)
        expect(links.length).toBeGreaterThanOrEqual(17);
    });

    it('has correct nav link hrefs', () => {
        renderWithRoute('/settings/general');
        const hrefs = Array.from(document.querySelectorAll('a.nav-item')).map(
            (a) => a.getAttribute('href')
        );
        expect(hrefs).toContain('/settings/general');
        expect(hrefs).toContain('/settings/organization/roles');
        expect(hrefs).toContain('/settings/organization/sessions');
        expect(hrefs).toContain('/settings/ai/vendors');
        expect(hrefs).toContain('/settings/ai/ser');
        expect(hrefs).toContain('/settings/ai/vector-db');
        expect(hrefs).toContain('/settings/business/intents');
        expect(hrefs).toContain('/settings/business/schemas');
        expect(hrefs).toContain('/settings/business/stages');
        expect(hrefs).toContain('/settings/channels/omnichannel');
        expect(hrefs).toContain('/settings/system/general');
        expect(hrefs).toContain('/settings/system/modules');
        expect(hrefs).toContain('/settings/system/storage');
        expect(hrefs).toContain('/settings/system/smtp');
    });

    // ── Route Rendering ───────────────────────────────────

    it('renders AI Vendors page at /settings/ai/vendors', () => {
        renderWithRoute('/settings/ai/vendors');
        expect(screen.getByTestId('page-ai-vendors')).toBeTruthy();
    });

    it('renders SER page at /settings/ai/ser', () => {
        renderWithRoute('/settings/ai/ser');
        expect(screen.getByTestId('page-ser')).toBeTruthy();
    });

    it('renders Roles page at /settings/organization/roles', () => {
        renderWithRoute('/settings/organization/roles');
        expect(screen.getByTestId('page-roles')).toBeTruthy();
    });

    it('renders Omnichannel page at /settings/channels/omnichannel', () => {
        renderWithRoute('/settings/channels/omnichannel');
        expect(screen.getByTestId('page-omni')).toBeTruthy();
    });

    it('renders System Config page at /settings/system/general', () => {
        renderWithRoute('/settings/system/general');
        expect(screen.getByTestId('page-sys-config')).toBeTruthy();
    });

    it('renders Storage page at /settings/system/storage', () => {
        renderWithRoute('/settings/system/storage');
        expect(screen.getByTestId('page-storage')).toBeTruthy();
    });

    it('renders SMTP page at /settings/system/smtp', () => {
        renderWithRoute('/settings/system/smtp');
        expect(screen.getByTestId('page-smtp')).toBeTruthy();
    });

    // ── Active State ──────────────────────────────────────

    it('marks active nav link with active class', () => {
        renderWithRoute('/settings/ai/vendors');
        const activeLinks = document.querySelectorAll('a.nav-item.active');
        expect(activeLinks.length).toBe(1);
        expect(activeLinks[0].getAttribute('href')).toBe('/settings/ai/vendors');
    });
});
