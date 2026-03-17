import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BentoGrid from './BentoGrid';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }) }));
vi.mock('../../context/WebSocketContext', () => ({ useWebSocket: () => ({ connected: true, subscribe: () => () => { } }) }));
vi.mock('../../services/api', () => ({
    default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));

const mockCore = vi.fn().mockReturnValue({ liveCount: 0, avgDuration: null });
const mockAnalytics = vi.fn().mockReturnValue({ outcomeStats: null, outcomeTrends: [] });
const mockRealtime = vi.fn().mockReturnValue({ emotionAlerts: [] });

vi.mock('../../dashboard/DashboardContext', () => ({
    useDashboardCore: () => mockCore(),
    useDashboardAnalytics: () => mockAnalytics(),
    useDashboardRealtime: () => mockRealtime(),
    // facade hooks (unused but may be required by other test mocks)
    useDashboard: () => ({}),
    useDashboardQuality: () => ({}),
    useDashboardLive: () => ({}),
}));

describe('BentoGrid', () => {
    it('renders without crashing', () => {
        const { container } = render(<BentoGrid />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders bento cells', () => {
        const { container } = render(<BentoGrid />);
        const cells = container.querySelectorAll('.bento-cell');
        expect(cells.length).toBeGreaterThan(0);
    });

    it('shows dash placeholder when analytics data is null', () => {
        mockAnalytics.mockReturnValue({ outcomeStats: null, outcomeTrends: [] });
        render(<BentoGrid />);
        // AI Prediction Accuracy hero should show '—' when no data
        const dashes = screen.getAllByText('—');
        expect(dashes.length).toBeGreaterThan(0);
    });

    it('renders real values from DashboardContext', () => {
        mockCore.mockReturnValue({ liveCount: 42, avgDuration: 275 });
        mockAnalytics.mockReturnValue({
            outcomeStats: {
                accuracy: { accuracy_rate: 0.95, ai_predictions: 1000, manual_overrides: 5, total_calls: 1200, match_count: 950 },
                conversion_rate: 0.32,
                total_calls: 1200,
                distribution: { success: 384, failure: 400, follow_up: 300, unknown: 116 },
            },
            outcomeTrends: [
                { date: '2026-03-01', success: 10, failure: 5, follow_up: 3 },
                { date: '2026-03-02', success: 15, failure: 3, follow_up: 4 },
            ],
        });

        render(<BentoGrid />);
        // Active calls = 42
        expect(screen.getByText('42')).toBeTruthy();
        // AI accuracy = 95.0%
        expect(screen.getByText('95.0%')).toBeTruthy();
        // AI predictions = 1,000
        expect(screen.getByText('1,000')).toBeTruthy();
    });
});
