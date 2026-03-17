import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveCallsWidget from './LiveCallsWidget';

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
    mosGradeClass: (mos: number) => mos >= 4 ? 'good' : mos >= 3 ? 'fair' : 'poor',
    fmtDuration: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
}));

describe('LiveCallsWidget', () => {
    it('renders title "Live Call Quality"', () => {
        mockUseDashboard.mockReturnValue({ liveCalls: [], liveCount: 0, now: Date.now() });
        render(<LiveCallsWidget />);
        expect(screen.getByText('Live Call Quality')).toBeTruthy();
    });

    it('renders "No active calls" when empty', () => {
        mockUseDashboard.mockReturnValue({ liveCalls: [], liveCount: 0, now: Date.now() });
        render(<LiveCallsWidget />);
        expect(screen.getByText('No active calls')).toBeTruthy();
    });




    it('renders table when calls exist', () => {
        mockUseDashboard.mockReturnValue({
            liveCalls: [{
                call_id: 'abc-123', caller: '1001', callee: '2002',
                start_time: new Date(Date.now() - 60000).toISOString(),
                duration: 60, status: 'answered',
                has_quality_data: true, mos: 4.2, jitter: 5.1, loss: 0.01, rtt: 15,
            }],
            liveCount: 1,
            now: Date.now(),
        });
        const { container } = render(<LiveCallsWidget />);
        expect(container.querySelector('.live-calls-table')).toBeTruthy();
    });

    it('renders hint text when no calls', () => {
        mockUseDashboard.mockReturnValue({ liveCalls: [], liveCount: 0, now: Date.now() });
        render(<LiveCallsWidget />);
        expect(screen.getByText('Active calls will appear here with real-time quality metrics')).toBeTruthy();
    });
});
