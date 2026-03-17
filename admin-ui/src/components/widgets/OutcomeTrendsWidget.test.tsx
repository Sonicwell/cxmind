import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutcomeTrendsWidget from './OutcomeTrendsWidget';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }) }));
vi.mock('recharts', () => ({ AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>, Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null }));
vi.mock('./ChartContainer', () => ({ default: ({ children }: any) => <div>{children}</div> }));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));

describe('OutcomeTrendsWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ outcomeTrends: [] });
        render(<OutcomeTrendsWidget />);
        expect(screen.getByText('Outcome Trends (14d)')).toBeTruthy();
    });
    it('shows "No data" when empty', () => {
        mockUseDashboard.mockReturnValue({ outcomeTrends: [] });
        render(<OutcomeTrendsWidget />);
        expect(screen.getByText('No data')).toBeTruthy();
    });
    it('renders chart when data exists', () => {
        mockUseDashboard.mockReturnValue({ outcomeTrends: [{ date: '2025-01-01', success: 10, failure: 2, follow_up: 3 }] });
        render(<OutcomeTrendsWidget />);
        expect(screen.getByTestId('area-chart')).toBeTruthy();
    });
});
