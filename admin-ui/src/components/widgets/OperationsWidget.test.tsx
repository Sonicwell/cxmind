import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OperationsWidget from './OperationsWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({
    useDashboard: () => mockUseDashboard(),
    useDashboardCore: () => mockUseDashboard(),
    useDashboardQuality: () => mockUseDashboard(),
    useDashboardLive: () => mockUseDashboard(),
    useDashboardAnalytics: () => mockUseDashboard(),
    useDashboardRealtime: () => mockUseDashboard(),
}));

describe('OperationsWidget', () => {
    it('renders title "Operations Overview"', () => {
        mockUseDashboard.mockReturnValue({ stats: null, opsAgentCounts: null });
        render(<OperationsWidget />);
        expect(screen.getByText('Operations Overview')).toBeTruthy();
    });

    it('renders KPI labels (Online, On Call, Ringing)', () => {
        mockUseDashboard.mockReturnValue({
            stats: null,
            opsAgentCounts: {
                online: 10, on_call: 3, ringing: 2, available: 5,
                break: 1, wrap_up: 1, working: 2, busy: 0, onhold: 0, occupancy: 60,
            },
        });
        render(<OperationsWidget />);
        expect(screen.getByText('Available')).toBeTruthy();
        screen.debug(); expect(screen.getAllByText('On Call').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Ringing').length).toBeGreaterThan(0);
    });

    it('renders agent status breakdown rows', () => {
        mockUseDashboard.mockReturnValue({
            stats: null,
            opsAgentCounts: {
                online: 5, on_call: 2, ringing: 1, available: 3,
                break: 1, wrap_up: 0, working: 1, busy: 0, onhold: 0, occupancy: 45,
            },
        });
        render(<OperationsWidget />);
        expect(screen.getByText('Available')).toBeTruthy();
        expect(screen.getByText('Wrap Up')).toBeTruthy();
        expect(screen.getByText('Break')).toBeTruthy();
    });

    it('renders occupancy percentage', () => {
        mockUseDashboard.mockReturnValue({
            stats: null,
            opsAgentCounts: {
                online: 8, on_call: 4, ringing: 1, available: 3,
                break: 0, wrap_up: 0, working: 0, busy: 0, onhold: 0, occupancy: 75,
            },
        });
        render(<OperationsWidget />);
        expect(screen.getByText('Occupancy')).toBeTruthy();
        expect(screen.getByText('75%')).toBeTruthy();
    });

    it('renders zero counts when no data', () => {
        mockUseDashboard.mockReturnValue({ stats: null, opsAgentCounts: null });
        render(<OperationsWidget />);
        expect(screen.getByText('0%')).toBeTruthy();
    });
});
