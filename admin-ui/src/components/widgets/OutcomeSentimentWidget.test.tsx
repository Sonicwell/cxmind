import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutcomeSentimentWidget from './OutcomeSentimentWidget';

vi.mock('recharts', () => ({ BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, Cell: () => null }));
vi.mock('./ChartContainer', () => ({ default: ({ children }: any) => <div>{children}</div> }));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));

describe('OutcomeSentimentWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ outcomeBySentiment: [] });
        render(<OutcomeSentimentWidget />);
        expect(screen.getByText('Outcome × Sentiment')).toBeTruthy();
    });
    it('shows "No sentiment data" when empty', () => {
        mockUseDashboard.mockReturnValue({ outcomeBySentiment: [] });
        render(<OutcomeSentimentWidget />);
        expect(screen.getByText('No sentiment data')).toBeTruthy();
    });
    it('renders chart when data exists', () => {
        mockUseDashboard.mockReturnValue({ outcomeBySentiment: [{ bucket: 'positive', rate: 0.7, total: 80 }] });
        render(<OutcomeSentimentWidget />);
        expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });
});
