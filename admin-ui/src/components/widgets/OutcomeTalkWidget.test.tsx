import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutcomeTalkWidget from './OutcomeTalkWidget';

vi.mock('recharts', () => ({ BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, Cell: () => null }));
vi.mock('./ChartContainer', () => ({ default: ({ children }: any) => <div>{children}</div> }));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));

describe('OutcomeTalkWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ outcomeByTalkPattern: [] });
        render(<OutcomeTalkWidget />);
        expect(screen.getByText('Outcome × Talk Pattern')).toBeTruthy();
    });
    it('shows "No talk pattern data" when empty', () => {
        mockUseDashboard.mockReturnValue({ outcomeByTalkPattern: [] });
        render(<OutcomeTalkWidget />);
        expect(screen.getByText('No talk pattern data')).toBeTruthy();
    });
    it('renders chart when data exists', () => {
        mockUseDashboard.mockReturnValue({ outcomeByTalkPattern: [{ bucket: 'Balanced (30-50%)', rate: 0.65, total: 60 }] });
        render(<OutcomeTalkWidget />);
        expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });
});
