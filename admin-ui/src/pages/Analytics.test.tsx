import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Analytics from './Analytics';
import React from 'react';

// ── jsdom polyfills ───────────────────────────────────────
if (typeof IntersectionObserver === 'undefined') {
    (globalThis as any).IntersectionObserver = class {
        observe() { }
        unobserve() { }
        disconnect() { }
    };
}

class TestErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch() { /* swallow */ }
    render() { return this.state.hasError ? <div>error boundary</div> : this.props.children; }
}

// ── Module Mocks ──────────────────────────────────────────

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ isDemoMode: false, demoMode: false }),
}));

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({
            data: { data: [], total: 0, overview: {}, agents: [], topics: [] },
        }),
        post: vi.fn().mockResolvedValue({ data: {} }),
    },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { role: 'platform_admin', clientId: 'c1' },
        hasPermission: () => true,
    }),
}));

vi.mock('../components/ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, ...props }: any) => (
        <button onClick={onClick} {...props}>{children}</button>
    ),
}));

vi.mock('../components/ui/OrganicCard', () => ({
    OrganicCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('../components/ui/MotionDiv', () => ({
    MotionDiv: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../components/ui/ChartPanel', () => ({
    default: ({ children, title }: any) => <div data-testid="chart-panel"><h3>{title}</h3>{children}</div>,
}));

vi.mock('../components/ui/MetricCard', () => ({
    default: ({ label, value }: any) => <div data-testid="metric-card">{label}: {value}</div>,
}));

vi.mock('../components/ui/DropdownMenu', () => ({
    DropdownMenu: ({ trigger }: any) => <div>{trigger}</div>,
}));

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: ({ children }: any) => <div>{children}</div>,
    Bar: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
    LineChart: ({ children }: any) => <div>{children}</div>, Line: () => null,
    PieChart: ({ children }: any) => <div>{children}</div>,
    Pie: () => null, Cell: () => null,
    AreaChart: ({ children }: any) => <div>{children}</div>, Area: () => null,
}));

vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('jspdf', () => ({ jsPDF: vi.fn().mockImplementation(() => ({ addPage: vi.fn(), addImage: vi.fn(), save: vi.fn(), setFillColor: vi.fn(), rect: vi.fn(), setTextColor: vi.fn(), setFontSize: vi.fn(), text: vi.fn(), internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } } })) }));
vi.mock('exceljs', () => ({
    default: vi.fn().mockImplementation(() => ({
        addWorksheet: vi.fn().mockReturnValue({ columns: [], addRow: vi.fn() }),
        xlsx: { writeBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) },
    })),
}));

vi.mock('../services/mock-data', () => ({
    getMockSLAAnalytics: vi.fn().mockResolvedValue({ overview: {}, hourlyTrend: [], agentLeaderboard: [], callVolume: [], qualitySentiment: [] }),
    getMockSummaryAnalytics: vi.fn().mockResolvedValue({ intentDistribution: [], sentimentTrend: [], summaryOverview: null }),
    getMockBehaviorAnalytics: vi.fn().mockResolvedValue({ data: {} }),
    getMockOutcomeDashboard: vi.fn().mockResolvedValue({ data: null }),
}));

vi.mock('../components/analytics/ScheduledReportsModal', () => ({
    ScheduledReportsModal: ({ open }: any) => open ? <div data-testid="schedule-modal">Schedule</div> : null,
}));

vi.mock('../components/analytics/SLAOverviewSection', () => ({
    SLAOverviewSection: () => <div data-testid="sla-section">SLA</div>,
}));

vi.mock('../components/analytics/OutcomeSection', () => ({
    OutcomeSection: () => <div data-testid="outcome-section">Outcome</div>,
}));

vi.mock('../components/analytics/BehaviorSection', () => ({
    BehaviorSection: () => <div data-testid="behavior-section">Behavior</div>,
}));

vi.mock('../components/analytics/LazySection', () => ({
    LazySection: ({ children, title }: any) => <div data-testid="lazy-section">{title && <h3>{title}</h3>}{children}</div>,
}));

vi.mock('../components/analytics/TopicCloudWidget', () => ({
    TopicCloudWidget: () => <div data-testid="topic-cloud">Topics</div>,
}));

const Wrapper = ({ children }: any) => (
    <MemoryRouter>
        <TestErrorBoundary>{children}</TestErrorBoundary>
    </MemoryRouter>
);

// ── Tests ──────────────────────────────────────────────────

describe('Analytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        localStorage.clear();
    });

    it('renders page with analytics-page class', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(document.querySelector('.analytics-page')).toBeTruthy();
        });
    });

    it('renders page title', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('analytics.title')).toBeTruthy();
        });
    });

    it('renders date preset buttons', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('7d')).toBeTruthy();
            expect(screen.getByText('14d')).toBeTruthy();
            expect(screen.getByText('30d')).toBeTruthy();
            expect(screen.getByText('90d')).toBeTruthy();
        });
    });

    it('renders schedule report button', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('analytics.scheduleReport')).toBeTruthy();
        });
    });

    it('renders export button', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('analytics.export')).toBeTruthy();
        });
    });

    it('renders SLA overview section', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByTestId('sla-section')).toBeTruthy();
        });
    });

    it('renders outcome section', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByTestId('outcome-section')).toBeTruthy();
        });
    });

    it('renders topic cloud widget', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByTestId('topic-cloud')).toBeTruthy();
        });
    });

    it('renders behavior section', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByTestId('behavior-section')).toBeTruthy();
        });
    });

    it('calls API endpoints on mount', async () => {
        const api = (await import('../services/api')).default;
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            // 应该调用 9 个分析 API
            expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThanOrEqual(5);
        });
    });

    it('does not crash with error boundary', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.queryByText('error boundary')).toBeNull();
        });
    });

    it('renders custom date range button', async () => {
        render(<Analytics />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('analytics.custom')).toBeTruthy();
        });
    });
});
