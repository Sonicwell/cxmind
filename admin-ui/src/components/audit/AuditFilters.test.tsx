import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditFilters from './AuditFilters';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

describe('AuditFilters', () => {
    let onFilterChange: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        onFilterChange = vi.fn();
    });

    it('renders filter title', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        expect(screen.getByText('audit.filters')).toBeTruthy();
    });

    it('renders quick filter preset buttons', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        expect(screen.getByText('Failed Logins (1h)')).toBeTruthy();
        expect(screen.getByText('Today')).toBeTruthy();
        expect(screen.getByText('Delete Ops')).toBeTruthy();
        expect(screen.getByText('Permission Changes')).toBeTruthy();
    });

    it('calls onFilterChange when preset is clicked', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        fireEvent.click(screen.getByText('Delete Ops'));
        expect(onFilterChange).toHaveBeenCalledWith({ action: 'delete' });
    });

    it('toggles advanced filters panel visibility', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        // Initially hidden
        expect(screen.queryByText('audit.applyFilters')).toBeNull();
        // Click show
        fireEvent.click(screen.getByText('audit.show'));
        expect(screen.getByText('audit.applyFilters')).toBeTruthy();
    });

    it('shows category and action selects when filters expanded', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        fireEvent.click(screen.getByText('audit.show'));
        expect(screen.getByText('actions.category')).toBeTruthy();
        expect(screen.getByText('actions.action')).toBeTruthy();
    });

    it('shows date range inputs when filters expanded', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        fireEvent.click(screen.getByText('audit.show'));
        expect(screen.getByText('audit.startDate')).toBeTruthy();
        expect(screen.getByText('audit.endDate')).toBeTruthy();
    });

    it('shows operator search when filters expanded', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        fireEvent.click(screen.getByText('audit.show'));
        expect(screen.getByText('audit.operatorSearch')).toBeTruthy();
    });

    it('calls onFilterChange with empty object when clear is clicked', () => {
        render(<AuditFilters onFilterChange={onFilterChange} />);
        // Trigger a preset first
        fireEvent.click(screen.getByText('Today'));
        onFilterChange.mockClear();
        // Expand and clear
        fireEvent.click(screen.getByText('audit.show'));
        fireEvent.click(screen.getByText('audit.clear'));
        expect(onFilterChange).toHaveBeenCalledWith({});
    });

    it('disables presets when loading=true', () => {
        render(<AuditFilters onFilterChange={onFilterChange} loading />);
        const deleteOps = screen.getByText('Delete Ops');
        expect(deleteOps.closest('button')?.disabled).toBe(true);
    });
});
