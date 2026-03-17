import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OutcomeSection } from './OutcomeSection';
import type { OutcomeDashboardData } from '../../types/analytics';

// Mock recharts
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Pie: () => <div data-testid="pie" />,
    Cell: () => <div />,
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    Area: () => <div />,
    BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    Legend: () => <div />,
}));

// Mock MotionDiv to a simple div
vi.mock('../ui/MotionDiv', () => ({
    MotionDiv: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

const mockData: OutcomeDashboardData = {
    distribution: { success: 150, failure: 30, follow_up: 45, unknown: 25 },
    trends: [
        { date: '2026-02-01', success: 10, failure: 2 },
        { date: '2026-02-02', success: 12, failure: 3 },
    ],
    top_closers: [
        { agent_id: 'agent-001', total: 50, success: 30, rate: 0.6 },
        { agent_id: 'agent-002', total: 40, success: 20, rate: 0.5 },
    ],
    by_quality: [{ bucket: 'Good (>3.5)', rate: 0.35 }],
    by_duration: [{ bucket: '2-5 min', rate: 0.28 }],
    by_sentiment: [{ bucket: 'Positive', rate: 0.42 }],
    by_talk_pattern: [{ bucket: '40-60%', rate: 0.31 }],
    roi: { total_cost: 125.50, cost_per_success: 0.84 },
};

describe('OutcomeSection', () => {
    it('should show loading skeletons', () => {
        const { container } = render(<OutcomeSection loading={true} data={null} />);
        const skeletons = container.querySelectorAll('.analytics-skeleton');
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should render nothing when not loading and data is null', () => {
        const { container } = render(<OutcomeSection loading={false} data={null} />);
        expect(container.innerHTML).toBe('');
    });

    it('should render KPI cards with correct values', () => {
        render(<OutcomeSection loading={false} data={mockData} />);
        // Total = 150+30+45+25 = 250
        expect(screen.getByText('250')).toBeInTheDocument();
        expect(screen.getByText('Total Predictions')).toBeInTheDocument();
    });

    it('should calculate conversion rate correctly', () => {
        render(<OutcomeSection loading={false} data={mockData} />);
        // 150/250 = 60% — appears in both KPI card and agent table
        expect(screen.getAllByText(/60\.0%/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Conversion Rate/).length).toBeGreaterThanOrEqual(1);
    });

    it('should show cost per success', () => {
        render(<OutcomeSection loading={false} data={mockData} />);
        expect(screen.getByText('$0.84')).toBeInTheDocument();
    });

    it('should render Outcome Distribution section', () => {
        render(<OutcomeSection loading={false} data={mockData} />);
        expect(screen.getByText('Outcome Distribution')).toBeInTheDocument();
    });

    it('should render Top Closers table with agents', () => {
        render(<OutcomeSection loading={false} data={mockData} />);
        expect(screen.getByText('Top Closers (Agents)')).toBeInTheDocument();
        expect(screen.getByText('agent-001')).toBeInTheDocument();
        expect(screen.getByText('agent-002')).toBeInTheDocument();
    });

    it('should render agent stats in table', () => {
        render(<OutcomeSection loading={false} data={mockData} />);
        // agent-001: total=50, success=30, rate=60%
        expect(screen.getByText('50')).toBeInTheDocument();
        // '30' may match multiple elements; use getAllByText
        expect(screen.getAllByText('30').length).toBeGreaterThanOrEqual(1);
        // 60.0% appears in both KPI card and table
        expect(screen.getAllByText(/60\.0%/).length).toBeGreaterThanOrEqual(2);
    });

    it('should render all chart sections', () => {
        render(<OutcomeSection loading={false} data={mockData} />);
        expect(screen.getByText('Outcome Trends (30 Days)')).toBeInTheDocument();
        expect(screen.getByText('Conversion by Call Quality (MOS)')).toBeInTheDocument();
        expect(screen.getByText('Conversion by Duration')).toBeInTheDocument();
        expect(screen.getByText('Conversion by Sentiment')).toBeInTheDocument();
        expect(screen.getByText('Conversion by Talk Ratio')).toBeInTheDocument();
    });
});
