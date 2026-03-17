import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock all context providers
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { displayName: 'Admin User', email: 'admin@test.com', role: 'Platform Admin', avatar: null },
        logout: vi.fn(),
    }),
}));

vi.mock('../context/ModuleContext', () => ({
    useModules: () => ({
        isModuleEnabled: (mod: string) => {
            // Enable a subset of modules for testing
            const enabled = ['analytics', 'monitoring', 'alerts', 'audit', 'webhooks', 'qi', 'contacts', 'roi', 'wfm', 'agent_map', 'action_center', 'inbox', 'knowledge', 'demo'];
            return enabled.includes(mod);
        },
    }),
}));

vi.mock('../context/WebSocketContext', () => ({
    useWebSocket: () => ({
        connected: true,
        subscribe: () => () => { },
    }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: false }),
}));

vi.mock('../context/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark' }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../components/DemoBanner', () => ({
    DemoBanner: () => <div data-testid="demo-banner" />,
}));

vi.mock('../components/ui/GlobalSearch', () => ({
    GlobalSearch: () => null,
}));

vi.mock('../components/ui/AIOverlay', () => ({
    default: () => null,
}));

vi.mock('../components/common/LanguageSwitcher', () => ({
    LanguageSwitcher: () => <span>Lang</span>,
}));

vi.mock('../components/common/ThemeSelector', () => ({
    ThemeSelector: () => <span>Theme</span>,
}));

vi.mock('../components/ui/AvatarInitials', () => ({
    default: ({ name }: any) => <div data-testid="avatar">{name}</div>,
}));

// Mock build-time constants
vi.stubGlobal('__APP_VERSION__', '1.2.3');
vi.stubGlobal('__APP_COMMIT__', 'abc1234');
vi.stubGlobal('__APP_BUILD_TIME__', '2026-03-06T10:00:00.000Z');

import DashboardLayout from './DashboardLayout';

const Wrapper = ({ children }: any) => <MemoryRouter initialEntries={['/dashboard']}>{children}</MemoryRouter>;

describe('DashboardLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // matchMedia mock for viewport-aware sidebar collapse
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    it('renders sidebar with logo', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        const logos = screen.getAllByAltText('CXMind');
        expect(logos.length).toBeGreaterThanOrEqual(1);
    });

    it('renders user display name and role', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        // Avatar mock also renders name, so multiple matches expected
        expect(screen.getAllByText('Admin User').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Platform Admin')).toBeTruthy();
    });

    it('renders version number with commit hash', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(screen.getByText('v1.2.3 (abc1234)')).toBeTruthy();
    });

    it('renders navigation groups', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(screen.getByText('sidebar.groupOperations')).toBeTruthy();
        expect(screen.getByText('sidebar.groupIntelligence')).toBeTruthy();
        expect(screen.getByText('sidebar.groupManagement')).toBeTruthy();
    });

    it('renders core nav items in open groups', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        // Operations & Intelligence groups are defaultOpen=true
        expect(screen.getByText('sidebar.dashboard')).toBeTruthy();
        expect(screen.getByText('sidebar.monitoring')).toBeTruthy();
        expect(screen.getByText('sidebar.calls')).toBeTruthy();
        expect(screen.getByText('sidebar.userManagement')).toBeTruthy();
    });

    it('renders module-gated nav items in open groups', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        // Analytics & Alerts are in Intelligence group (defaultOpen=true)
        expect(screen.getByText('sidebar.analytics')).toBeTruthy();
        expect(screen.getByText('sidebar.alerts')).toBeTruthy();
        // QI, Webhooks, Settings are in groups with defaultOpen=false
        // They only render when the group is toggled open
    });

    it('renders search trigger with ⌘K shortcut', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(screen.getByText('⌘K')).toBeTruthy();
    });

    it('renders collapse toggle button', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        const aside = document.querySelector('.sidebar');
        expect(aside).toBeTruthy();
        const toggleBtn = document.querySelector('.collapse-toggle');
        expect(toggleBtn).toBeTruthy();
    });

    it('toggles sidebar collapse state', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        const toggleBtn = document.querySelector('.collapse-toggle')!;
        fireEvent.click(toggleBtn);
        expect(localStorage.getItem('cxmind:ui:sidebar-collapsed')).toBe('true');
    });

    it('renders DemoBanner', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(screen.getByTestId('demo-banner')).toBeTruthy();
    });

    it('renders Outlet for child routes', async () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        const main = document.querySelector('.main-content');
        expect(main).toBeTruthy();
    });
});
