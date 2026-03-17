import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BehaviorSection } from './BehaviorSection';
import type { BehaviorDashboardData } from '../../types/analytics';

// Mock recharts to avoid ResizeObserver issues in JSDOM
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Pie: () => <div data-testid="pie" />,
    Cell: () => <div />,
    Tooltip: () => <div />,
    LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
    Line: () => <div />,
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    Area: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Legend: () => <div />,
}));

const mockData: BehaviorDashboardData = {
    distribution: { agent_talk: 45, cust_talk: 35, silence: 20 },
    trend: [
        { date: '2026-02-01', avg_stress: 3.2, avg_talk_ratio: 0.6 },
        { date: '2026-02-02', avg_stress: 3.5, avg_talk_ratio: 0.55 },
    ],
    emotion_dist: [
        { emotion: 'happy', count: 120 },
        { emotion: 'neutral', count: 300 },
        { emotion: 'angry', count: 30 },
    ],
    emotion_trend: [
        { date: '2026-02-01', happy: 40, neutral: 100, sad: 10, angry: 5, frustrated: 5 },
    ],
};

describe('BehaviorSection', () => {
    it('should show loading state', () => {
        render(<BehaviorSection loading={true} data={null} />);
        expect(screen.getByText('Loading behavior metrics...')).toBeInTheDocument();
    });

    it('should render nothing when not loading and data is null', () => {
        const { container } = render(<BehaviorSection loading={false} data={null} />);
        expect(container.innerHTML).toBe('');
    });

    it('should render section title with data', () => {
        render(<BehaviorSection loading={false} data={mockData} />);
        expect(screen.getByText('Behavior & Sentiment Analysis')).toBeInTheDocument();
    });

    it('should render Talk Ratio Analysis panel', () => {
        render(<BehaviorSection loading={false} data={mockData} />);
        expect(screen.getByText('Talk Ratio Analysis')).toBeInTheDocument();
    });

    it('should render Stress Score Trend panel', () => {
        render(<BehaviorSection loading={false} data={mockData} />);
        expect(screen.getByText('Stress Score Trend')).toBeInTheDocument();
    });

    it('should render Acoustic Emotion Distribution panel', () => {
        render(<BehaviorSection loading={false} data={mockData} />);
        expect(screen.getByText('Acoustic Emotion Distribution')).toBeInTheDocument();
    });

    it('should render Acoustic Emotion Trend panel', () => {
        render(<BehaviorSection loading={false} data={mockData} />);
        expect(screen.getByText('Acoustic Emotion Trend')).toBeInTheDocument();
    });

    it('should show "No talk data" when distribution is all zeros', () => {
        const emptyData: BehaviorDashboardData = {
            ...mockData,
            distribution: { agent_talk: 0, cust_talk: 0, silence: 0 },
        };
        render(<BehaviorSection loading={false} data={emptyData} />);
        expect(screen.getByText('No talk data')).toBeInTheDocument();
    });

    it('should show "No trend data" when trend is empty', () => {
        const emptyTrend: BehaviorDashboardData = {
            ...mockData,
            trend: [],
        };
        render(<BehaviorSection loading={false} data={emptyTrend} />);
        expect(screen.getByText('No trend data')).toBeInTheDocument();
    });

    it('should show "No acoustic data" when emotion_dist is empty', () => {
        const emptyEmotion: BehaviorDashboardData = {
            ...mockData,
            emotion_dist: [],
        };
        render(<BehaviorSection loading={false} data={emptyEmotion} />);
        expect(screen.getByText('No acoustic data')).toBeInTheDocument();
    });
});
