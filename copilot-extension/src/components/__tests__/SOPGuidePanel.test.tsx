import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { SOPGuidePanel } from '../SOPGuidePanel';
import { useModules } from '~/hooks/useModules';

// Mock the useApi hook to prevent network calls during render
vi.mock('~/hooks/useApi', () => ({
    useApi: () => ({
        fetchApi: vi.fn().mockResolvedValue({ data: [] }),
        isInitialized: true,
    }),
}));

// Mock the useModules hook
vi.mock('~/hooks/useModules', () => ({
    useModules: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
    ClipboardList: () => <div data-testid="icon-clipboard" />,
    ChevronDown: () => <div />,
    ChevronUp: () => <div />,
    Copy: () => <div />,
    Check: () => <div />,
    ArrowRight: () => <div />,
    Mic: () => <div />,
    LayoutTemplate: () => <div />,
    Zap: () => <div />,
    GitBranch: () => <div />,
    PhoneForwarded: () => <div />,
    Bot: () => <div />,
    Flag: () => <div />,
}));

describe('SOPGuidePanel Module Gating', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('renders the SOP guide button when sop module is enabled', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'sop' ? true : false,
        } as any);

        render(<SOPGuidePanel />);

        // The primary trigger button or header should be present
        // Based on actual component structure "Select SOP" or "SOP Guide"
        expect(screen.queryAllByText(/SOP/)[0]).toBeInTheDocument();
    });

    it('renders nothing when sop module is disabled', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'sop' ? false : true,
        } as any);

        const { container } = render(<SOPGuidePanel />);

        // The component should return null, resulting in an empty container
        expect(container).toBeEmptyDOMElement();
    });
});
