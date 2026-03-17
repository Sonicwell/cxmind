/**
 * Wave 1 模块门控测试 — DashboardLayout 侧栏
 * 验证 Wave 1 only 场景下侧栏菜单的可见性
 *
 * 独立文件: vi.mock hoisting 限制
 *
 * 注意: "Knowledge & Tools" NavGroup 为 defaultOpen={false}
 * 因此 SOP/Demo 等子菜单初始不渲染到 DOM 中
 * 测试方法: 验证 NavLink 的 href 是否存在（已渲染的菜单可以通过 href 查找）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Wave 1 only: contacts/analytics/sop/demo enabled, rest disabled
const WAVE1_MODULES = ['contacts', 'analytics', 'sop', 'demo'];

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { displayName: 'Admin User', email: 'admin@test.com', role: 'Platform Admin', avatar: null },
        logout: vi.fn(),
    }),
}));

vi.mock('../context/ModuleContext', () => ({
    useModules: () => ({
        isModuleEnabled: (mod: string) => WAVE1_MODULES.includes(mod),
    }),
}));

vi.mock('../context/WebSocketContext', () => ({
    useWebSocket: () => ({ connected: true, subscribe: () => () => { } }),
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

vi.mock('../components/DemoBanner', () => ({ DemoBanner: () => null }));
vi.mock('../components/ui/GlobalSearch', () => ({ GlobalSearch: () => null }));
vi.mock('../components/ui/AIOverlay', () => ({ default: () => null }));
vi.mock('../components/common/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('../components/common/ThemeSelector', () => ({ ThemeSelector: () => null }));
vi.mock('../components/ui/AvatarInitials', () => ({
    default: ({ name }: any) => <div data-testid="avatar">{name}</div>,
}));

vi.stubGlobal('__APP_VERSION__', '1.0.0');
vi.stubGlobal('__APP_COMMIT__', 'test123');
vi.stubGlobal('__APP_BUILD_TIME__', '2026-03-08T00:00:00.000Z');

import DashboardLayout from './DashboardLayout';

const Wrapper = ({ children }: any) => <MemoryRouter initialEntries={['/dashboard']}>{children}</MemoryRouter>;

function getNavHrefs() {
    return Array.from(document.querySelectorAll('a.nav-item')).map(a => a.getAttribute('href'));
}

describe('DashboardLayout — Wave 1 module gating', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // jsdom 不提供 matchMedia，mock 掉响应式侧栏逻辑
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation(query => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    // ── 始终可见的 Core 菜单 ─────────────────────────

    it('always shows Dashboard link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/dashboard');
    });

    it('always shows Monitoring link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/monitoring');
    });

    it('always shows Calls link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/calls');
    });

    it('always shows Users link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/users');
    });

    it('always shows Agents link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/agents');
    });

    it('always shows Agent Map link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/map');
    });

    it('always shows Events link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/events');
    });

    it('always shows Alerts link', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/alerts');
    });

    // ── Wave 1 可见: contacts/analytics (defaultOpen groups) ──

    it('shows Contact 360 when contacts module is enabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/contacts');
    });

    it('shows Analytics when analytics module is enabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/analytics');
    });

    it('shows ROI when analytics module is enabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).toContain('/roi');
    });

    // ── Wave 2 隐藏菜单 ──────────────────────────────

    it('hides Inbox when inbox module is disabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).not.toContain('/inbox');
    });

    it('hides WFM when wfm module is disabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).not.toContain('/wfm');
    });

    it('hides Knowledge Base when knowledge module is disabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).not.toContain('/knowledge');
    });

    it('hides Action Center when action_center module is disabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).not.toContain('/actions');
    });

    it('hides Omni Monitor when inbox module is disabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).not.toContain('/omni-monitor');
    });

    it('hides Templates when inbox module is disabled', () => {
        render(<DashboardLayout />, { wrapper: Wrapper });
        expect(getNavHrefs()).not.toContain('/templates');
    });
});
