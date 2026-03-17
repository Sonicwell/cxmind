import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

// Dashboard is a thin shell that renders DashboardGrid
vi.mock('../dashboard/DashboardGrid', () => ({
    default: () => <div data-testid="dashboard-grid">Dashboard Grid</div>,
}));

vi.mock('../styles/call-quality.css', () => ({}));

describe('Dashboard', () => {
    it('renders without crashing', () => {
        render(<Dashboard />);
        expect(screen.getByTestId('dashboard-grid')).toBeTruthy();
    });

    it('delegates rendering to DashboardGrid', () => {
        render(<Dashboard />);
        expect(screen.getByText('Dashboard Grid')).toBeTruthy();
    });
});
