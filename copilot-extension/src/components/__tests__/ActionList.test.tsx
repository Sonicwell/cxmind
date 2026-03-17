import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { ActionList } from '../ActionList';
import { useModules } from '~/hooks/useModules';

// Mock the global chrome object for the useEffect listeners
global.chrome = {
    runtime: {
        onMessage: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
        },
    },
} as any;

// Mock the useApi hook
vi.mock('~/hooks/useApi', () => ({
    useApi: () => ({
        fetchApi: vi.fn().mockResolvedValue([]),
        isInitialized: true,
    }),
}));

// Mock the useModules hook
vi.mock('~/hooks/useModules', () => ({
    useModules: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
    Send: () => <div />,
    Zap: () => <div />,
    AlertCircle: () => <div />,
}));

describe('ActionList Module Gating', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('renders loading or empty state when action_center module is enabled', () => {
        vi.mocked(useModules).mockReturnValue({
            isModuleEnabled: (slug: string) => slug === 'action_center' ? true : false,
        } as any);

        const { container } = render(<ActionList callId="test-call-123" />);

        // Since we mock fetchApi to return [], it should eventually render the empty state
        // containing 'Listening for intent…' or at least not be completely empty
        expect(container).not.toBeEmptyDOMElement();
    });
});
