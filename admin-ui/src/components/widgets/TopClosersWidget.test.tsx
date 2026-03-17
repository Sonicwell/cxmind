import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TopClosersWidget from './TopClosersWidget';

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

describe('TopClosersWidget', () => {
    it('renders title "Top Closers"', () => {
        mockUseDashboard.mockReturnValue({ topClosers: [] });
        render(<TopClosersWidget />);
        expect(screen.getByText('Top Closers')).toBeTruthy();
    });

    it('shows "No agent data" when empty', () => {
        mockUseDashboard.mockReturnValue({ topClosers: [] });
        render(<TopClosersWidget />);
        expect(screen.getByText('No agent data')).toBeTruthy();
    });

    it('renders agent names', () => {
        mockUseDashboard.mockReturnValue({
            topClosers: [
                { agent_id: 'a1', agent_name: 'Alice', rate: 0.85, success: 17, total: 20 },
                { agent_id: 'a2', agent_name: 'Bob', rate: 0.72, success: 13, total: 18 },
            ],
        });
        render(<TopClosersWidget />);
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('renders medal emojis for top 3', () => {
        mockUseDashboard.mockReturnValue({
            topClosers: [
                { agent_id: 'a1', agent_name: 'Gold', rate: 0.9, success: 9, total: 10 },
                { agent_id: 'a2', agent_name: 'Silver', rate: 0.8, success: 8, total: 10 },
                { agent_id: 'a3', agent_name: 'Bronze', rate: 0.7, success: 7, total: 10 },
            ],
        });
        render(<TopClosersWidget />);
        expect(screen.getByText('🥇')).toBeTruthy();
        expect(screen.getByText('🥈')).toBeTruthy();
        expect(screen.getByText('🥉')).toBeTruthy();
    });

    it('renders percentage values', () => {
        mockUseDashboard.mockReturnValue({
            topClosers: [
                { agent_id: 'a1', agent_name: 'Alice', rate: 0.85, success: 17, total: 20 },
            ],
        });
        render(<TopClosersWidget />);
        expect(screen.getByText('85%')).toBeTruthy();
        expect(screen.getByText('17/20')).toBeTruthy();
    });
});
