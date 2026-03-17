import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrafficOriginsWidget from './TrafficOriginsWidget';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }) }));

// Mock react-simple-maps
vi.mock('react-simple-maps', () => ({
    ComposableMap: ({ children }: any) => <div data-testid="map">{children}</div>,
    Geographies: ({ children }: any) => <div>{children({ geographies: [] })}</div>,
    Geography: () => null,
}));

const mockUseDashboard = vi.fn();
vi.mock('../../dashboard/DashboardContext', () => ({ useDashboard: () => mockUseDashboard(), useDashboardCore: () => mockUseDashboard(), useDashboardQuality: () => mockUseDashboard(), useDashboardLive: () => mockUseDashboard(), useDashboardAnalytics: () => mockUseDashboard(), useDashboardRealtime: () => mockUseDashboard() }));

describe('TrafficOriginsWidget', () => {
    it('renders title', () => {
        mockUseDashboard.mockReturnValue({ stats: null, geoCountSet: new Set() });
        render(<TrafficOriginsWidget />);
        expect(screen.getByText('Traffic Origins')).toBeTruthy();
    });

    it('shows "No data" when no geo stats', () => {
        mockUseDashboard.mockReturnValue({ stats: null, geoCountSet: new Set() });
        render(<TrafficOriginsWidget />);
        expect(screen.getByText('No data')).toBeTruthy();
    });

    it('renders map when geo data exists', () => {
        mockUseDashboard.mockReturnValue({
            stats: { system: { geoStats: [{ country: 'US', count: 100 }] } },
            geoCountSet: new Set(['840']),
        });
        render(<TrafficOriginsWidget />);
        expect(screen.getByTestId('map')).toBeTruthy();
    });

    it('renders geo legend items', () => {
        mockUseDashboard.mockReturnValue({
            stats: { system: { geoStats: [{ country: 'US', count: 100 }, { country: 'DE', count: 50 }] } },
            geoCountSet: new Set(['840', '276']),
        });
        render(<TrafficOriginsWidget />);
        expect(screen.getByText(/US:/)).toBeTruthy();
        expect(screen.getByText(/DE:/)).toBeTruthy();
    });
});
