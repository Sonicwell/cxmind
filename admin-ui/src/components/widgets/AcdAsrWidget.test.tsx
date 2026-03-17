import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AcdAsrWidget from './AcdAsrWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('recharts', () => ({
    LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
    Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
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

describe('AcdAsrWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ chartData: null });
        render(<AcdAsrWidget />);
        expect(screen.getByText('ACD / ASR (3h)')).toBeTruthy();
    });

    it('shows "No data" when no chart data', () => {
        mockUseDashboard.mockReturnValue({ chartData: { quality: [] } });
        render(<AcdAsrWidget />);
        expect(screen.getByText('No data')).toBeTruthy();
    });

    it('renders chart when data exists', () => {
        mockUseDashboard.mockReturnValue({
            chartData: { quality: [{ time: '10:00', acd: 120, asr: 85 }] },
        });
        render(<AcdAsrWidget />);
        expect(screen.getByTestId('line-chart')).toBeTruthy();
    });
});
