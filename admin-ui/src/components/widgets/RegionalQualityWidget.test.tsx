import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RegionalQualityWidget from './RegionalQualityWidget';

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));
vi.mock('../../dashboard/helpers', () => ({ mosGradeClass: (mos: number) => mos >= 4 ? 'mos-excellent' : 'mos-poor' }));

describe('RegionalQualityWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ geoMedia: [] });
        render(<RegionalQualityWidget />);
        expect(screen.getByText('Regional Quality')).toBeTruthy();
    });

    it('shows "No regional data" when empty', () => {
        mockUseDashboard.mockReturnValue({ geoMedia: [] });
        render(<RegionalQualityWidget />);
        expect(screen.getByText('No regional data')).toBeTruthy();
    });

    it('renders country cards with data', () => {
        mockUseDashboard.mockReturnValue({
            geoMedia: [
                { country: 'United States', avg_mos: 4.2, avg_loss: 0.01, avg_rtt: 25, report_count: 150 },
                { country: 'Germany', avg_mos: 3.8, avg_loss: 0.02, avg_rtt: 45, report_count: 80 },
            ],
        });
        render(<RegionalQualityWidget />);
        expect(screen.getByText('United States')).toBeTruthy();
        expect(screen.getByText('Germany')).toBeTruthy();
    });

    it('renders metric labels (Avg MOS, Loss, RTT, Reports)', () => {
        mockUseDashboard.mockReturnValue({
            geoMedia: [{ country: 'Japan', avg_mos: 4.5, avg_loss: 0.005, avg_rtt: 15, report_count: 200 }],
        });
        render(<RegionalQualityWidget />);
        expect(screen.getAllByText('Avg MOS').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Loss').length).toBeGreaterThan(0);
        expect(screen.getAllByText('RTT').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
    });
});
