import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

// Mock recharts — it doesn't render in jsdom
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    RadialBarChart: ({ children }: any) => <div>{children}</div>,
    RadialBar: () => <div />,
    BarChart: ({ children }: any) => <div>{children}</div>,
    Bar: () => <div />,
    AreaChart: ({ children }: any) => <div>{children}</div>,
    Area: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    Legend: () => <div />,
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

// Mock MotionDiv to plain div
vi.mock('../ui/MotionDiv', () => ({
    MotionDiv: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

import { SLAOverviewSection } from './SLAOverviewSection';
import type { SLAOverview, HourlyTrend, AgentRow, VolumeEntry, HeatmapEntry } from '../../types/analytics';

// ── Test Data ──
const mockOverview: SLAOverview = {
    total_calls: 847,
    answered: 720,
    abandoned: 127,
    answer_rate: 85.0,
    abandon_rate: 15.0,
    avg_handle_time: 245,
    avg_wait_time: 18,
    service_level: 74.8,
    change: {
        total_calls: 12,
        answered: 8,
        abandoned: -3,
        answer_rate: 2.5,
        abandon_rate: -1.2,
        avg_handle_time: -5,
        avg_wait_time: 3,
        service_level: 4.1,
    },
};

const mockHourly: HourlyTrend[] = [
    { hour: 0, offered: 10, answered: 8, abandoned: 2, sl_pct: 80 },
];

const mockAgents: AgentRow[] = [
    { agent_id: 'agent-001', agent_name: 'Alice Chen', total_calls: 45, avg_handle_time: 180, avg_qi_score: 92, conversion_rate: 35, trend: [30, 50, 70, 60, 80, 90, 85] },
    { agent_id: 'agent-002', agent_name: 'Bob Wang', total_calls: 38, avg_handle_time: 210, avg_qi_score: 78, conversion_rate: 28 },
];

const mockVolume: VolumeEntry[] = [
    { date: '2026-02-20', total: 120, answered: 100, abandoned: 20 },
];

const mockHeatmap: HeatmapEntry[] = [
    { sentiment: 'Positive', score_bucket: '4.0+', count: 35 },
    { sentiment: 'Positive', score_bucket: '3.0-4.0', count: 20 },
    { sentiment: 'Negative', score_bucket: '4.0+', count: 5 },
    { sentiment: 'Negative', score_bucket: '3.0-4.0', count: 15 },
];

const defaultProps = {
    loading: false,
    overview: mockOverview,
    hourly: mockHourly,
    agents: mockAgents,
    volume: mockVolume,
    heatmap: mockHeatmap,
    handleDrillDown: vi.fn(),
};

describe('SLAOverviewSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── T1.1: No console.log ──
    it('should NOT call console.log during render', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
        render(<SLAOverviewSection {...defaultProps} />);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    // ── T1.2: Agent Sparkline uses real trend data ──
    it('should render sparkline bars matching agent.trend length when trend exists', () => {
        const { container } = render(<SLAOverviewSection {...defaultProps} />);
        const sparklines = container.querySelectorAll('.analytics-sparkline');
        // First agent has trend = [30,50,70,60,80,90,85] → 7 bars
        const firstSparkline = sparklines[0];
        expect(firstSparkline).toBeTruthy();
        const bars = firstSparkline.querySelectorAll('.analytics-sparkline-bar');
        expect(bars.length).toBe(7);
    });

    it('should render empty/fallback sparkline when agent.trend is undefined', () => {
        const { container } = render(<SLAOverviewSection {...defaultProps} />);
        const sparklines = container.querySelectorAll('.analytics-sparkline');
        // Second agent (Bob) has no trend
        const secondSparkline = sparklines[1];
        expect(secondSparkline).toBeTruthy();
        const bars = secondSparkline.querySelectorAll('.analytics-sparkline-bar');
        // Should have 0 bars or a dash/placeholder
        expect(bars.length).toBe(0);
    });

    // ── T1.3: Heatmap axis labels ──
    it('should display sentiment labels (Y-axis) in heatmap', () => {
        render(<SLAOverviewSection {...defaultProps} />);
        expect(screen.getByText('Positive')).toBeInTheDocument();
        expect(screen.getByText('Negative')).toBeInTheDocument();
    });

    it('should display score_bucket labels (X-axis) in heatmap', () => {
        render(<SLAOverviewSection {...defaultProps} />);
        expect(screen.getByText('4.0+')).toBeInTheDocument();
        expect(screen.getByText('3.0-4.0')).toBeInTheDocument();
    });

    // ── T2.3: Agent name renders as clickable ──
    it('should render agent names as clickable elements', () => {
        const { container } = render(<SLAOverviewSection {...defaultProps} />);
        const agentLink = container.querySelector('[data-agent-id="agent-001"]');
        expect(agentLink).toBeInTheDocument();
        expect(agentLink?.textContent).toContain('Alice Chen');
    });

    // ── Basic rendering ──
    it('should render loading skeleton when loading=true', () => {
        const { container } = render(<SLAOverviewSection {...defaultProps} loading={true} />);
        expect(container.querySelector('.analytics-skeleton')).toBeInTheDocument();
    });

    it('should render nothing when overview is null', () => {
        const { container } = render(<SLAOverviewSection {...defaultProps} overview={null} />);
        // Only Fragment rendered, no KPI cards
        expect(container.querySelector('.analytics-kpi-card')).not.toBeInTheDocument();
    });
});
