import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ROISummaryWidget from './ROISummaryWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({
    useDashboard: () => mockUseDashboard(),
    useDashboardCore: () => mockUseDashboard(),
    useDashboardQuality: () => mockUseDashboard(),
    useDashboardLive: () => mockUseDashboard(),
    useDashboardAnalytics: () => mockUseDashboard(),
    useDashboardRealtime: () => mockUseDashboard(),
}));

describe('ROISummaryWidget', () => {
    it('shows "No ROI data" when null', () => {
        mockUseDashboard.mockReturnValue({ roiSummary: null });
        render(<ROISummaryWidget />);
        expect(screen.getByText('No ROI data available')).toBeTruthy();
    });

    it('renders total value when data exists', () => {
        mockUseDashboard.mockReturnValue({
            roiSummary: {
                total_value: 25000,
                period_days: 30,
                metrics: [
                    { key: 'asr_cost_saved', label: 'ASR Cost Saved', value: 5000, unit: 'USD', improvement_pct: 12 },
                ],
            },
        });
        render(<ROISummaryWidget />);
        expect(screen.getByText('$25,000')).toBeTruthy();
    });

    it('renders metric labels', () => {
        mockUseDashboard.mockReturnValue({
            roiSummary: {
                total_value: 10000,
                period_days: 7,
                metrics: [
                    { key: 'asr_cost_saved', label: 'ASR Cost Saved', value: 3000, unit: 'USD', improvement_pct: 0 },
                    { key: 'call_duration_saved', label: 'Duration Saved', value: 50, unit: 'hours', improvement_pct: 5 },
                ],
            },
        });
        render(<ROISummaryWidget />);
        expect(screen.getByText('ASR Cost Saved')).toBeTruthy();
        expect(screen.getByText('Duration Saved')).toBeTruthy();
    });

    it('renders "View Full ROI Report" link', () => {
        mockUseDashboard.mockReturnValue({
            roiSummary: {
                total_value: 5000,
                period_days: 7,
                metrics: [],
            },
        });
        render(<ROISummaryWidget />);
        expect(screen.getByText(/View Full ROI Report/)).toBeTruthy();
    });
});
