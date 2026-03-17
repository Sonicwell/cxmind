import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { TabBar } from '../TabBar';
import { useModules } from '~/hooks/useModules';

// Mock the react-i18next translation hook
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

// Mock the lucide-react icons
vi.mock('lucide-react', () => ({
    Phone: () => <div data-testid="icon-phone" />,
    MessageSquare: () => <div data-testid="icon-message" />,
    Home: () => <div data-testid="icon-home" />,
    User: () => <div data-testid="icon-user" />,
    Wrench: () => <div data-testid="icon-wrench" />
}));

// Mock the useModules hook
vi.mock('~/hooks/useModules', () => ({
    useModules: vi.fn(),
}));

describe('TabBar Module Gating', () => {
    const defaultProps = {
        activeTab: 'home',
        onTabChange: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('renders chat tab when inbox module is enabled', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'inbox' ? true : true,
        } as any);

        render(<TabBar {...defaultProps} />);

        // Should find the 'tabs.chat' label or its container
        expect(screen.queryByTestId('icon-message')).toBeInTheDocument();
    });

    it('hides chat tab when inbox module is disabled', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'inbox' ? false : true,
        } as any);

        render(<TabBar {...defaultProps} />);

        // 'tabs.chat' should NOT be in the document
        expect(screen.queryByTestId('icon-message')).not.toBeInTheDocument();

        // Other tabs should still be rendered
        expect(screen.queryByTestId('icon-home')).toBeInTheDocument();
        expect(screen.queryByTestId('icon-phone')).toBeInTheDocument();
        expect(screen.queryByTestId('icon-user')).toBeInTheDocument();
    });
});
