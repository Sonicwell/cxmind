import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SipErrorsWidget from './SipErrorsWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('recharts', () => ({
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
}));

vi.mock('./ChartContainer', () => ({
    default: ({ children }: any) => <div>{children}</div>,
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

describe('SipErrorsWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ chartData: null });
        render(<SipErrorsWidget />);
        expect(screen.getByText('SIP Errors & Timeouts (3h)')).toBeTruthy();
    });

    it('shows "No SIP errors" when no data', () => {
        mockUseDashboard.mockReturnValue({ chartData: { sipErrors: [] } });
        render(<SipErrorsWidget />);
        expect(screen.getByText('No SIP errors in last 3h')).toBeTruthy();
    });

    it('renders chart when data exists', () => {
        mockUseDashboard.mockReturnValue({
            chartData: { sipErrors: [{ time: '10:00', '4xx': 5, '5xx': 2, RTP_Timeout: 1, SIP_Timeout: 0 }] },
        });
        render(<SipErrorsWidget />);
        expect(screen.getByTestId('area-chart')).toBeTruthy();
    });

    it('renders check mark when no errors', () => {
        mockUseDashboard.mockReturnValue({ chartData: { sipErrors: [] } });
        render(<SipErrorsWidget />);
        expect(screen.getByText('✓')).toBeTruthy();
    });
});
