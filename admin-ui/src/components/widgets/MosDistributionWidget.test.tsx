import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MosDistributionWidget from './MosDistributionWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('recharts', () => ({
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Pie: () => null, Cell: () => null, Tooltip: () => null,
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

describe('MosDistributionWidget', () => {
    it('renders title "MOS Distribution"', () => {
        mockUseDashboard.mockReturnValue({ mosDist: null });
        render(<MosDistributionWidget />);
        expect(screen.getByText('MOS Distribution')).toBeTruthy();
    });

    it('shows "No MOS data" when total is 0', () => {
        mockUseDashboard.mockReturnValue({ mosDist: { excellent: 0, good: 0, fair: 0, poor: 0, total: 0 } });
        render(<MosDistributionWidget />);
        expect(screen.getByText('No MOS data')).toBeTruthy();
    });

    it('renders pie chart when data exists', () => {
        mockUseDashboard.mockReturnValue({ mosDist: { excellent: 50, good: 30, fair: 15, poor: 5, total: 100 } });
        render(<MosDistributionWidget />);
        expect(screen.getByTestId('pie-chart')).toBeTruthy();
    });

    it('renders legend items', () => {
        mockUseDashboard.mockReturnValue({ mosDist: { excellent: 50, good: 30, fair: 15, poor: 5, total: 100 } });
        render(<MosDistributionWidget />);
        expect(screen.getByText('Excellent (≥4.0)')).toBeTruthy();
        expect(screen.getByText('Good (3.0-4.0)')).toBeTruthy();
        expect(screen.getByText('Fair (2.0-3.0)')).toBeTruthy();
        expect(screen.getByText('Poor (<2.0)')).toBeTruthy();
    });
});
