import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AuditLog } from '../../types/audit';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, p?: any) => {
            // Handle interpolated keys
            if (p && typeof p === 'object') {
                let result = k;
                Object.entries(p).forEach(([key, val]) => { result += ` ${val}`; });
                return result;
            }
            return k;
        }
    }),
}));

vi.mock('../../utils/date', () => ({
    formatUTCToLocal: (ts: string) => '2025-01-01 10:30:00',
}));

const mockLogs: AuditLog[] = [
    {
        timestamp: '2025-01-01T10:30:00Z', category: 'auth', operator_id: 'u1',
        operator_name: 'Admin User', action: 'login', target_id: '', target_name: '',
        ip_address: '10.0.0.1', user_agent: 'Chrome', success: 1, failure_reason: '',
    },
    {
        timestamp: '2025-01-01T10:31:00Z', category: 'user_management', operator_id: 'u2',
        operator_name: 'Manager', action: 'create', target_id: 'u3', target_name: 'New User',
        ip_address: '10.0.0.2', user_agent: 'Firefox', success: 0, failure_reason: 'Permission denied',
    },
];

import AuditLogsTable from './AuditLogsTable';

describe('AuditLogsTable', () => {
    const onViewDetails = vi.fn();
    const onOperatorClick = vi.fn();
    const onPageChange = vi.fn();

    const defaultProps = {
        logs: mockLogs,
        loading: false,
        onViewDetails,
        onOperatorClick,
        total: 50,
        limit: 20,
        offset: 0,
        onPageChange,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders table headers', () => {
        render(<AuditLogsTable {...defaultProps} />);
        expect(screen.getByText('audit.timestamp')).toBeTruthy();
        expect(screen.getByText('actions.category')).toBeTruthy();
        expect(screen.getByText('audit.operator')).toBeTruthy();
        expect(screen.getByText('actions.action')).toBeTruthy();
    });

    it('renders log rows', () => {
        render(<AuditLogsTable {...defaultProps} />);
        expect(screen.getByText('Admin User')).toBeTruthy();
        expect(screen.getByText('Manager')).toBeTruthy();
    });

    it('renders category badges', () => {
        render(<AuditLogsTable {...defaultProps} />);
        expect(screen.getByText('auth')).toBeTruthy();
        expect(screen.getByText('user management')).toBeTruthy();
    });

    it('renders action names', () => {
        render(<AuditLogsTable {...defaultProps} />);
        expect(screen.getByText('login')).toBeTruthy();
        expect(screen.getByText('create')).toBeTruthy();
    });

    it('renders success/failed status', () => {
        render(<AuditLogsTable {...defaultProps} />);
        expect(screen.getByText('audit.success')).toBeTruthy();
        expect(screen.getByText('audit.failed')).toBeTruthy();
    });

    it('renders target names', () => {
        render(<AuditLogsTable {...defaultProps} />);
        expect(screen.getByText('New User')).toBeTruthy();
    });

    it('calls onViewDetails when detail button clicked', () => {
        render(<AuditLogsTable {...defaultProps} />);
        const detailBtns = screen.getAllByText('actions.details');
        fireEvent.click(detailBtns[0]);
        expect(onViewDetails).toHaveBeenCalledWith(mockLogs[0]);
    });

    it('calls onOperatorClick when operator name clicked', () => {
        render(<AuditLogsTable {...defaultProps} />);
        fireEvent.click(screen.getByText('Admin User'));
        expect(onOperatorClick).toHaveBeenCalledWith('u1', 'Admin User');
    });

    it('renders pagination info', () => {
        render(<AuditLogsTable {...defaultProps} />);
        // Page 1 of 3 (50 total / 20 limit)
        expect(screen.getByText(/audit.pageOf/)).toBeTruthy();
    });

    it('calls onPageChange on next page click', () => {
        render(<AuditLogsTable {...defaultProps} />);
        const nextBtn = screen.getByText('audit.next');
        fireEvent.click(nextBtn);
        expect(onPageChange).toHaveBeenCalledWith(20); // offset + limit
    });

    it('disables prev button on first page', () => {
        render(<AuditLogsTable {...defaultProps} />);
        const prevBtn = screen.getByText('audit.previous').closest('button')!;
        expect(prevBtn.style.opacity).toBe('0.5');
    });

    it('shows loading skeleton state', () => {
        const { container } = render(<AuditLogsTable {...defaultProps} loading={true} />);
        // Loading shows 5 pulse divs
        expect(container.querySelectorAll('[style*="animation"]').length).toBe(5);
    });

    it('shows empty state when no logs', () => {
        render(<AuditLogsTable {...defaultProps} logs={[]} />);
        expect(screen.getByText('audit.noLogsFound')).toBeTruthy();
        expect(screen.getByText('audit.tryAdjustFilters')).toBeTruthy();
    });
});
