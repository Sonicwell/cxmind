import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutcomeQualityWidget from './OutcomeQualityWidget';

vi.mock('recharts', () => ({ BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, Cell: () => null }));
vi.mock('./ChartContainer', () => ({ default: ({ children }: any) => <div>{children}</div> }));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));

describe('OutcomeQualityWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ outcomeByQuality: [] });
        render(<OutcomeQualityWidget />);
        expect(screen.getByText('Outcome × Quality')).toBeTruthy();
    });
    it('shows "No quality data" when empty', () => {
        mockUseDashboard.mockReturnValue({ outcomeByQuality: [] });
        render(<OutcomeQualityWidget />);
        expect(screen.getByText('No quality data')).toBeTruthy();
    });
    it('renders chart when data exists', () => {
        mockUseDashboard.mockReturnValue({ outcomeByQuality: [{ bucket: 'Excellent (4+)', rate: 0.85, total: 100 }] });
        render(<OutcomeQualityWidget />);
        expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });
});
