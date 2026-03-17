import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuditStatsCards from './AuditStatsCards';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../ui/WidgetInfoTooltip', () => ({
    default: () => <span data-testid="tooltip" />,
}));

describe('AuditStatsCards', () => {
    const defaultProps = {
        totalEvents: 1500,
        todayEvents: 120,
        activeUsers: 8,
        failedLogins: 3,
    };

    it('renders all 4 stat card titles', () => {
        render(<AuditStatsCards {...defaultProps} />);
        expect(screen.getByText('audit.totalEvents')).toBeTruthy();
        expect(screen.getByText('audit.todaysActivity')).toBeTruthy();
        expect(screen.getByText('audit.activeUsers')).toBeTruthy();
        expect(screen.getByText('audit.failedLogins')).toBeTruthy();
    });

    it('renders stat values', () => {
        render(<AuditStatsCards {...defaultProps} />);
        expect(screen.getByText('1,500')).toBeTruthy(); // toLocaleString
        expect(screen.getByText('120')).toBeTruthy();
        expect(screen.getByText('8')).toBeTruthy();
        expect(screen.getByText('3')).toBeTruthy();
    });

    it('renders loading skeleton when loading=true', () => {
        const { container } = render(<AuditStatsCards {...defaultProps} loading />);
        const skeletons = container.querySelectorAll('.audit-skeleton');
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not render stats when loading', () => {
        render(<AuditStatsCards {...defaultProps} loading />);
        expect(screen.queryByText('audit.totalEvents')).toBeNull();
    });

    it('renders tooltip widgets for each card', () => {
        render(<AuditStatsCards {...defaultProps} />);
        const tooltips = screen.getAllByTestId('tooltip');
        expect(tooltips.length).toBe(4);
    });

    it('renders audit-stats-grid container', () => {
        const { container } = render(<AuditStatsCards {...defaultProps} />);
        expect(container.querySelector('.audit-stats-grid')).toBeTruthy();
    });
});
