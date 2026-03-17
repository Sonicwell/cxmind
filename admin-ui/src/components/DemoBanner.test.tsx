import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DemoBanner } from './DemoBanner';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: vi.fn().mockReturnValue({
        demoMode: true,
        setDemoMode: vi.fn(),
    }),
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { useDemoMode } from '../hooks/useDemoMode';
const mockUseDemoMode = vi.mocked(useDemoMode);

describe('DemoBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseDemoMode.mockReturnValue({ demoMode: true, setDemoMode: vi.fn() } as any);
    });

    it('renders banner title when demoMode is true', () => {
        render(<DemoBanner />);
        expect(screen.getByText('demoBanner.title')).toBeTruthy();
    });

    it('renders exit demo button', () => {
        render(<DemoBanner />);
        expect(screen.getByText('demoBanner.exitDemo')).toBeTruthy();
    });

    it('renders KPI labels', () => {
        render(<DemoBanner />);
        expect(screen.getByText('demoBanner.callsToday')).toBeTruthy();
        expect(screen.getByText('demoBanner.agentsOnline')).toBeTruthy();
        expect(screen.getByText('demoBanner.avgScore')).toBeTruthy();
        expect(screen.getByText('demoBanner.resolved')).toBeTruthy();
    });

    it('calls setDemoMode(false) when exit button is clicked', () => {
        const setDemoMode = vi.fn();
        mockUseDemoMode.mockReturnValue({ demoMode: true, setDemoMode } as any);

        render(<DemoBanner />);
        fireEvent.click(screen.getByText('demoBanner.exitDemo'));
        expect(setDemoMode).toHaveBeenCalledWith(false);
    });

    it('renders nothing when demoMode is false', () => {
        mockUseDemoMode.mockReturnValue({ demoMode: false, setDemoMode: vi.fn() } as any);
        const { container } = render(<DemoBanner />);
        expect(container.textContent).toBe('');
    });

    it('renders CXMI icon image', () => {
        render(<DemoBanner />);
        const img = screen.getByRole('img', { name: 'CXMI' });
        expect(img).toBeTruthy();
    });
});
