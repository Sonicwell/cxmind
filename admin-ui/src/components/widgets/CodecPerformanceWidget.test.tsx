import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CodecPerformanceWidget from './CodecPerformanceWidget';

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));
vi.mock('../../dashboard/helpers', () => ({ mosGradeClass: (mos: number) => mos >= 4 ? 'mos-excellent' : 'mos-poor' }));

describe('CodecPerformanceWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ codecData: [] });
        render(<CodecPerformanceWidget />);
        expect(screen.getByText('Codec Performance')).toBeTruthy();
    });
    it('shows "No codec data" when empty', () => {
        mockUseDashboard.mockReturnValue({ codecData: [] });
        render(<CodecPerformanceWidget />);
        expect(screen.getByText('No codec data')).toBeTruthy();
    });
    it('renders table with codec data', () => {
        mockUseDashboard.mockReturnValue({
            codecData: [{ codec: 'G.711', call_count: 50, avg_mos: 4.2, avg_loss: 0.01, avg_rtt: 25 }],
        });
        render(<CodecPerformanceWidget />);
        expect(screen.getByText('G.711')).toBeTruthy();
        expect(screen.getByText('50')).toBeTruthy();
    });
    it('renders table headers', () => {
        mockUseDashboard.mockReturnValue({
            codecData: [{ codec: 'OPUS', call_count: 30, avg_mos: 4.5, avg_loss: 0.005, avg_rtt: 15 }],
        });
        render(<CodecPerformanceWidget />);
        expect(screen.getByText('codecs')).toBeInTheDocument();
        expect(screen.getByText('calls')).toBeInTheDocument();
        expect(screen.getByText('Avg MOS')).toBeInTheDocument();
        expect(screen.getByText('Avg Loss')).toBeInTheDocument();
        expect(screen.getByText('Avg RTT')).toBeInTheDocument();
    });
});
