/**
 * SettingsLayout 模块门控测试
 * 验证 Wave 1 only / 全关闭场景下 Settings 侧栏菜单的可见性
 *
 * 独立文件: vi.mock 是 hoisted 的，需要与 SettingsLayout.test.tsx 不同的 ModuleContext mock
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// Wave 1 only: knowledge/action_center/inbox 关闭, analytics 开启
const WAVE1_ENABLED = ['analytics', 'contacts', 'sop', 'demo'];

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

vi.mock('../context/ModuleContext', () => ({
    useModules: () => ({
        isModuleEnabled: (slug: string) => WAVE1_ENABLED.includes(slug),
    }),
}));

import SettingsLayout from './SettingsLayout';

const renderSettings = () => {
    return render(
        <MemoryRouter initialEntries={['/settings/general']}>
            <Routes>
                <Route path="/settings" element={<SettingsLayout />}>
                    <Route path="general" element={<div>General</div>} />
                </Route>
            </Routes>
        </MemoryRouter>
    );
};

function getNavHrefs() {
    return Array.from(document.querySelectorAll('a.nav-item')).map(a => a.getAttribute('href'));
}

describe('SettingsLayout — Wave 1 module gating', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hides Vector DB when knowledge module is off', () => {
        renderSettings();
        expect(getNavHrefs()).not.toContain('/settings/ai/vector-db');
    });

    it('hides Intents when action_center module is off', () => {
        renderSettings();
        expect(getNavHrefs()).not.toContain('/settings/business/intents');
    });

    it('hides Channels group when inbox module is off', () => {
        renderSettings();
        expect(getNavHrefs()).not.toContain('/settings/channels/omnichannel');
    });

    it('keeps Schemas visible when analytics is on', () => {
        renderSettings();
        expect(getNavHrefs()).toContain('/settings/business/schemas');
    });

    it('always shows SER config regardless of module state', () => {
        renderSettings();
        expect(getNavHrefs()).toContain('/settings/ai/ser');
    });

    it('always shows core system links', () => {
        renderSettings();
        const hrefs = getNavHrefs();
        expect(hrefs).toContain('/settings/general');
        expect(hrefs).toContain('/settings/ai/vendors');
        expect(hrefs).toContain('/settings/system/general');
        expect(hrefs).toContain('/settings/system/modules');
    });

    it('Business Logic group visible when analytics is on', () => {
        renderSettings();
        const body = document.body.textContent || '';
        expect(body).toContain('settings.nav.businessLogic');
    });
});
