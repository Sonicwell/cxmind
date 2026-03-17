import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AICostROIWidget from './AICostROIWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
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

describe('AICostROIWidget', () => {
    it('renders "No AI cost data" when aiCostROI is null', () => {
        mockUseDashboard.mockReturnValue({ aiCostROI: null });
        render(<AICostROIWidget />);
        expect(screen.getByText('No AI cost data')).toBeTruthy();
    });

    it('renders title when data is available', () => {
        mockUseDashboard.mockReturnValue({
            aiCostROI: { total_cost: 12.50, cost_per_success: 0.005, avg_tokens: 1500, total_predictions: 3200 },
        });
        render(<AICostROIWidget />);
        expect(screen.getByText('AI Prediction ROI')).toBeTruthy();
    });

    it('renders total cost formatted', () => {
        mockUseDashboard.mockReturnValue({
            aiCostROI: { total_cost: 42.75, cost_per_success: 0.008, avg_tokens: 2100, total_predictions: 5000 },
        });
        render(<AICostROIWidget />);
        expect(screen.getByText('$42.75')).toBeTruthy();
    });

    it('renders cost per success', () => {
        mockUseDashboard.mockReturnValue({
            aiCostROI: { total_cost: 10, cost_per_success: 0.012, avg_tokens: 800, total_predictions: 1000 },
        });
        render(<AICostROIWidget />);
        expect(screen.getByText('$0.012')).toBeTruthy();
    });

    it('renders average tokens', () => {
        mockUseDashboard.mockReturnValue({
            aiCostROI: { total_cost: 5, cost_per_success: 0.001, avg_tokens: 3456, total_predictions: 200 },
        });
        render(<AICostROIWidget />);
        expect(screen.getByText('3,456')).toBeTruthy();
    });

    it('renders all 3 stat labels', () => {
        mockUseDashboard.mockReturnValue({
            aiCostROI: { total_cost: 1, cost_per_success: 0.01, avg_tokens: 100, total_predictions: 50 },
        });
        render(<AICostROIWidget />);
        expect(screen.getByText('Total AI Cost')).toBeTruthy();
        expect(screen.getByText('Cost per Success')).toBeTruthy();
        expect(screen.getByText('Avg Tokens')).toBeTruthy();
    });
});
