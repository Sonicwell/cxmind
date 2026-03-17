import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LeaderboardWall from './LeaderboardWall';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: true }),
}));

vi.mock('../../services/mock-data', () => ({
    getMockLeaderboard: () => ({
        period: 'today', metric: 'conversions', generatedAt: '2025-01-01',
        leaderboard: [
            { rank: 1, agentId: 'a1', agentName: 'Alice', totalCalls: 50, conversions: 12, avgDurationMin: 5.2, avgMOS: 4.1, streak: 3 },
            { rank: 2, agentId: 'a2', agentName: 'Bob', totalCalls: 45, conversions: 10, avgDurationMin: 4.8, avgMOS: 3.9, streak: 0 },
            { rank: 3, agentId: 'a3', agentName: 'Charlie', totalCalls: 40, conversions: 8, avgDurationMin: 6.1, avgMOS: 4.3, streak: 5 },
        ],
    }),
}));

vi.mock('../../services/api', () => ({
    default: { get: vi.fn() },
}));

describe('LeaderboardWall', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders title "Agent Leaderboard"', () => {
        render(<LeaderboardWall />);
        expect(screen.getByText('Agent Leaderboard')).toBeTruthy();
    });

    it('renders period buttons', () => {
        render(<LeaderboardWall />);
        expect(screen.getByText('Today')).toBeTruthy();
        expect(screen.getByText('Week')).toBeTruthy();
        expect(screen.getByText('Month')).toBeTruthy();
    });

    it('renders metric tabs', () => {
        render(<LeaderboardWall />);
        expect(screen.getByText('Conversions')).toBeTruthy();
        expect(screen.getByText('Calls')).toBeTruthy();
        expect(screen.getByText('Satisfaction')).toBeTruthy();
    });

    it('renders agent names from mock data', async () => {
        render(<LeaderboardWall />);
        // Wait for useEffect fetch
        await vi.waitFor(() => {
            expect(screen.getByText('Alice')).toBeTruthy();
        });
        expect(screen.getByText('Bob')).toBeTruthy();
        expect(screen.getByText('Charlie')).toBeTruthy();
    });

    it('renders calls count for agents', async () => {
        render(<LeaderboardWall />);
        await vi.waitFor(() => {
            expect(screen.getByText('50 calls')).toBeTruthy();
        });
    });

    it('renders conversion values', async () => {
        render(<LeaderboardWall />);
        await vi.waitFor(() => {
            expect(screen.getByText('12')).toBeTruthy();
            expect(screen.getByText('10')).toBeTruthy();
        });
    });

    it('applies fullscreen class when prop is true', () => {
        const { container } = render(<LeaderboardWall fullscreen />);
        expect(container.querySelector('.leaderboard-fullscreen')).toBeTruthy();
    });
});
