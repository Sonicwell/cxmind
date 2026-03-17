import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutcomeDurationWidget from './OutcomeDurationWidget';

vi.mock('recharts', () => ({ BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null }));
vi.mock('./ChartContainer', () => ({ default: ({ children }: any) => <div>{children}</div> }));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));

describe('OutcomeDurationWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ outcomeByDuration: [] });
        render(<OutcomeDurationWidget />);
        expect(screen.getByText('Outcome × Duration')).toBeTruthy();
    });
    it('shows "No duration data" when empty', () => {
        mockUseDashboard.mockReturnValue({ outcomeByDuration: [] });
        render(<OutcomeDurationWidget />);
        expect(screen.getByText('No duration data')).toBeTruthy();
    });
    it('renders chart when data exists', () => {
        mockUseDashboard.mockReturnValue({ outcomeByDuration: [{ bucket: '0-2min', rate: 0.3, total: 50 }] });
        render(<OutcomeDurationWidget />);
        expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });
});
