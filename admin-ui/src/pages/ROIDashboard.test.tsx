import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();

vi.mock('../services/api', () => ({
    default: { get: (...args: any[]) => mockGet(...args) },
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: false }),
}));

vi.mock('../services/mock-data', () => ({
    getMockROISummary: vi.fn(),
    getMockROITrend: vi.fn(),
    getMockROIBreakdown: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../components/ui/WidgetInfoTooltip', () => ({
    default: () => <span data-testid="widget-info" />,
}));
vi.mock('../components/ui/ChartPanel', () => ({
    default: ({ title, children }: any) => <div><h3>{title}</h3>{children}</div>,
}));
vi.mock('../components/ui/MetricCard', () => ({
    default: ({ label, value, placeholder, placeholderText }: any) =>
        <div data-testid="metric-card">
            <span>{label}</span>
            <span>{placeholder ? placeholderText || 'placeholder' : value}</span>
        </div>,
}));

// Mock recharts to avoid SVG rendering issues
vi.mock('recharts', () => ({
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    Area: () => null,
    BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    Legend: () => null,
}));

const mockSummary = {
    total_value: 125000,
    metrics: [
        { key: 'call_duration_saved', label: 'Call Duration Saved', value: 450, unit: 'hours', improvement_pct: 12 },
        { key: 'asr_cost_saved', label: 'ASR Cost Saved', value: 8500, unit: 'USD', improvement_pct: 8 },
        { key: 'revenue_attributed', label: 'Revenue Attributed', value: 75000, unit: 'USD', improvement_pct: 15 },
        { key: 'compliance_risk_avoided', label: 'Compliance Risk', value: 32000, unit: 'USD', improvement_pct: 0 },
        { key: 'acw_time_saved', label: 'ACW Time', value: 0, unit: 'hours', improvement_pct: 0 },
    ],
};

const mockTrend = [
    { date: '2025-01-01', total_value: 4000 },
    { date: '2025-01-02', total_value: 4200 },
];

const mockBreakdown = [
    { date: '2025-01-01', metric_type: 'call_duration_saved', value: 100 },
    { date: '2025-01-01', metric_type: 'asr_cost_saved', value: 200 },
];

import ROIDashboard from './ROIDashboard';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('ROIDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockImplementation((url: string) => {
            if (url.includes('/summary')) return Promise.resolve({ data: { data: mockSummary } });
            if (url.includes('/trend')) return Promise.resolve({ data: { data: mockTrend } });
            if (url.includes('/breakdown')) return Promise.resolve({ data: { data: mockBreakdown } });
            return Promise.resolve({ data: {} });
        });
    });

    it('fetches ROI data on mount', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(mockGet).toHaveBeenCalledWith('/analytics/roi/summary?days=30');
            expect(mockGet).toHaveBeenCalledWith('/analytics/roi/trend?days=30');
            expect(mockGet).toHaveBeenCalledWith('/analytics/roi/breakdown?days=30');
        });
    });

    it('renders page title', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('roiPage.title')).toBeTruthy();
        });
    });

    it('renders total value hero', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('$125,000')).toBeTruthy();
        });
    });

    it('renders metric cards', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => {
            const cards = screen.getAllByTestId('metric-card');
            expect(cards.length).toBe(5);
        });
    });

    it('renders trend chart', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('roiPage.trendTitle')).toBeTruthy();
            expect(screen.getByTestId('area-chart')).toBeTruthy();
        });
    });

    it('renders breakdown chart', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('roiPage.breakdownTitle')).toBeTruthy();
            expect(screen.getByTestId('bar-chart')).toBeTruthy();
        });
    });

    it('renders period selector', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('roiPage.title')).toBeTruthy());
        // Should have options 7d, 14d, 30d, 90d
        const select = screen.getByDisplayValue('30d');
        expect(select).toBeTruthy();
    });

    it('re-fetches data when period changes', async () => {
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
        const select = screen.getByDisplayValue('30d');
        fireEvent.change(select, { target: { value: '7' } });
        await waitFor(() => {
            expect(mockGet).toHaveBeenCalledWith('/analytics/roi/summary?days=7');
        });
    });

    it('shows loading state', () => {
        mockGet.mockReturnValue(new Promise(() => { })); // never resolves
        render(<ROIDashboard />, { wrapper: Wrapper });
        expect(screen.getByText('roiPage.loading')).toBeTruthy();
    });

    it('shows no data state when summary is null', async () => {
        mockGet.mockImplementation((url: string) => {
            if (url.includes('/summary')) return Promise.resolve({ data: { data: null } });
            if (url.includes('/trend')) return Promise.resolve({ data: { data: [] } });
            if (url.includes('/breakdown')) return Promise.resolve({ data: { data: [] } });
            return Promise.resolve({ data: {} });
        });
        render(<ROIDashboard />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('roiPage.noData')).toBeTruthy();
        });
    });
});
