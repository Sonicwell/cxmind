import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorstCallsWidget from './WorstCallsWidget';

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

vi.mock('../../dashboard/helpers', () => ({
    mosGradeClass: (mos: number) => mos >= 4 ? 'mos-excellent' : 'mos-poor',
    fmtDuration: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
}));

describe('WorstCallsWidget', () => {
    it('renders title "Worst Calls"', () => {
        mockUseDashboard.mockReturnValue({ worstCalls: [] });
        render(<WorstCallsWidget />);
        expect(screen.getByText('Worst Calls')).toBeTruthy();
    });

    it('shows "No data" when empty', () => {
        mockUseDashboard.mockReturnValue({ worstCalls: [] });
        render(<WorstCallsWidget />);
        expect(screen.getByText('No data')).toBeTruthy();
    });

    it('renders table with call data', () => {
        mockUseDashboard.mockReturnValue({
            worstCalls: [{
                call_id: 'call-123-abc-def', avg_mos: 1.5, min_mos: 1.0,
                avg_loss: 0.05, avg_jitter: 30, avg_rtt: 200, duration: 120,
            }],
        });
        const { container } = render(<WorstCallsWidget />);
        expect(container.querySelector('.cq-worst-table')).toBeTruthy();
    });

    it('renders table headers', () => {
        mockUseDashboard.mockReturnValue({
            worstCalls: [{
                call_id: 'call-123-abc-def', avg_mos: 1.5, min_mos: 1.0,
                avg_loss: 0.05, avg_jitter: 30, avg_rtt: 200, duration: 120,
            }],
        });
        render(<WorstCallsWidget />);
        expect(screen.getByText('Call ID')).toBeTruthy();
        expect(screen.getByText('Avg MOS')).toBeTruthy();
        expect(screen.getByText('Duration')).toBeTruthy();
    });
});
