import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { MeTab } from '../MeTab';
import { useModules } from '~/hooks/useModules';

// Mock hooks
vi.mock('~/hooks/useAuth', () => ({
    useAuth: () => ({
        agentInfo: { avatar: '/avatar.jpg', name: 'Agent Smith' },
    }),
}));

vi.mock('~/hooks/useApi', () => ({
    useApi: () => ({
        apiUrl: 'http://localhost:3000',
    }),
}));

vi.mock('~/hooks/useTheme', () => ({
    useTheme: () => ({
        theme: 'light',
        isDark: false,
        toggleTheme: vi.fn(),
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
    CalendarClock: () => <div data-testid="icon-calendar" />,
    MessageSquare: () => <div />,
    Settings: () => <div />,
    ChevronRight: () => <div />,
    User: () => <div />,
    Sun: () => <div />,
    Moon: () => <div />,
}));

// Mock the useModules hook
vi.mock('~/hooks/useModules', () => ({
    useModules: vi.fn(),
}));

describe('MeTab Module Gating', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('renders mySchedule menu item when wfm module is enabled', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'wfm' ? true : true,
        } as any);

        render(<MeTab />);

        // Should find the 'me.mySchedule' translation key
        expect(screen.queryByTestId('icon-calendar')).toBeInTheDocument();
    });

    it('hides mySchedule menu item when wfm module is disabled', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'wfm' ? false : true,
        } as any);

        render(<MeTab />);

        // 'me.mySchedule' should NOT be in the document
        expect(screen.queryByTestId('icon-calendar')).not.toBeInTheDocument();
    });

    it('shows fallback when wfm module is disabled and deep navigating to schedule', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'wfm' ? false : true,
        } as any);

        render(<MeTab initialView="schedule" />);

        expect(screen.getByText('WFM module is not enabled for your account.')).toBeInTheDocument();
    });
});
