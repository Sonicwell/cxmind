import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutcomeDistributionWidget from './OutcomeDistributionWidget';

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

describe('OutcomeDistributionWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ outcomeStats: null, outcomeLoading: false });
        render(<OutcomeDistributionWidget />);
        expect(screen.getByText('Outcome Distribution')).toBeTruthy();
    });

    it('shows "No outcome data" when empty', () => {
        mockUseDashboard.mockReturnValue({ outcomeStats: { total_calls: 0, distribution: null }, outcomeLoading: false });
        render(<OutcomeDistributionWidget />);
        expect(screen.getByText('No outcome data')).toBeTruthy();
    });

    it('shows loading state', () => {
        mockUseDashboard.mockReturnValue({ outcomeStats: null, outcomeLoading: true });
        render(<OutcomeDistributionWidget />);
        expect(screen.getByText('Loading...')).toBeTruthy();
    });

    it('renders pie chart with data', () => {
        mockUseDashboard.mockReturnValue({
            outcomeStats: {
                total_calls: 100,
                distribution: { success: 60, failure: 20, follow_up: 15, unknown: 5 },
            },
            outcomeLoading: false,
        });
        render(<OutcomeDistributionWidget />);
        expect(screen.getByTestId('pie-chart')).toBeTruthy();
    });

    it('renders legend items', () => {
        mockUseDashboard.mockReturnValue({
            outcomeStats: {
                total_calls: 100,
                distribution: { success: 60, failure: 20, follow_up: 15, unknown: 5 },
            },
            outcomeLoading: false,
        });
        render(<OutcomeDistributionWidget />);
        expect(screen.getByText('Closed')).toBeTruthy();
        expect(screen.getByText('Lost')).toBeTruthy();
    });
});
