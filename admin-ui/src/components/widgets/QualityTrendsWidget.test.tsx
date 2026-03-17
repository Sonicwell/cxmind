import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QualityTrendsWidget from './QualityTrendsWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('recharts', () => ({
    LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
}));

vi.mock('./ChartContainer', () => ({
    default: ({ children }: any) => <div>{children}</div>,
}));

const mockSetHours = vi.fn();
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
    TIME_OPTIONS: [
        { value: 1, label: '1h' },
        { value: 3, label: '3h' },
        { value: 6, label: '6h' },
        { value: 24, label: '24h' },
    ],
}));

describe('QualityTrendsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders title "Quality Trends"', () => {
        mockUseDashboard.mockReturnValue({ trends: [], hours: 3, setHours: mockSetHours });
        render(<QualityTrendsWidget />);
        expect(screen.getByText('Quality Trends')).toBeTruthy();
    });

    it('renders time filter buttons', () => {
        mockUseDashboard.mockReturnValue({ trends: [], hours: 3, setHours: mockSetHours });
        render(<QualityTrendsWidget />);
        expect(screen.getByText('1h')).toBeTruthy();
        expect(screen.getByText('3h')).toBeTruthy();
        expect(screen.getByText('6h')).toBeTruthy();
        expect(screen.getByText('24h')).toBeTruthy();
    });

    it('shows "No data" when no trends', () => {
        mockUseDashboard.mockReturnValue({ trends: [], hours: 3, setHours: mockSetHours });
        render(<QualityTrendsWidget />);
        expect(screen.getByText('No data')).toBeTruthy();
    });

    it('renders chart when trends exist', () => {
        mockUseDashboard.mockReturnValue({
            trends: [{ time: '10:00', avg_mos: 4.1, avg_loss: 0.01, avg_jitter: 5, avg_rtt: 15 }],
            hours: 3, setHours: mockSetHours,
        });
        render(<QualityTrendsWidget />);
        expect(screen.getByTestId('line-chart')).toBeTruthy();
    });

    it('calls setHours when time filter is clicked', () => {
        mockUseDashboard.mockReturnValue({ trends: [], hours: 3, setHours: mockSetHours });
        render(<QualityTrendsWidget />);
        fireEvent.click(screen.getByText('6h'));
        expect(mockSetHours).toHaveBeenCalledWith(6);
    });
});
