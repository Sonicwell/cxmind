import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AlertCenter from './AlertCenter';

// ── Mock Data ─────────────────────────────────────────────
const mockAlerts = [
    {
        timestamp: '2026-02-20T10:30:00Z',
        rule_id: 'rule-001', rule_name: 'Excessive Failed Logins',
        severity: 'high', event_category: 'auth', event_action: 'login_failed',
        operator_id: 'op1', operator_name: 'Alice',
        ip_address: '192.168.1.100', event_summary: '5 failed login attempts in 10 min',
        notification_status: 'sent' as const,
        resolved_status: 'open' as const,
    },
    {
        timestamp: '2026-02-20T09:15:00Z',
        rule_id: 'rule-002', rule_name: 'Bulk Data Export',
        severity: 'critical', event_category: 'data', event_action: 'export',
        operator_id: 'op2', operator_name: 'Bob',
        ip_address: '10.0.0.50', event_summary: 'Exported 10k+ records',
        notification_status: 'failed' as const,
        resolved_status: 'open' as const,
    },
    {
        timestamp: '2026-02-19T15:00:00Z',
        rule_id: 'rule-003', rule_name: 'Off-hours Access',
        severity: 'medium', event_category: 'access', event_action: 'login',
        operator_id: 'op3', operator_name: 'Charlie',
        ip_address: '172.16.0.10', event_summary: 'Login at 03:00 AM',
        notification_status: 'sent' as const,
        resolved_status: 'acknowledged' as const,
        resolved_by: 'admin',
        resolved_at: '2026-02-20T08:00:00Z',
    },
];

// ── Module Mocks ──────────────────────────────────────────

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockImplementation(() =>
            Promise.resolve({ data: { data: mockAlerts } })
        ),
        post: vi.fn().mockResolvedValue({ data: {} }),
        put: vi.fn().mockResolvedValue({ data: {} }),
    },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { role: 'platform_admin', clientId: 'c1' },
        hasPermission: () => true,
    }),
}));

vi.mock('../components/ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, ...props }: any) => (
        <button onClick={onClick} {...props}>{children}</button>
    ),
}));

vi.mock('../components/ui/OrganicCard', () => ({
    OrganicCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('../components/ui/card', () => ({
    Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../components/audit/OperatorProfile', () => ({
    OperatorProfile: ({ isOpen }: any) =>
        isOpen ? <div data-testid="operator-profile">Profile</div> : null,
}));

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

// ── Tests ──────────────────────────────────────────────────

describe('AlertCenter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders page title', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Alert Center')).toBeTruthy();
        });
    });

    it('renders page description', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/Monitor and respond to security/)).toBeTruthy();
        });
    });

    it('renders status filter buttons (Open/Resolved/All)', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/Open/)).toBeTruthy();
            expect(screen.getByText(/Resolved/)).toBeTruthy();
            expect(screen.getByText(/All/)).toBeTruthy();
        });
    });

    it('renders alert rule names', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Excessive Failed Logins')).toBeTruthy();
            expect(screen.getByText('Bulk Data Export')).toBeTruthy();
        });
    });

    it('renders severity badges', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('HIGH')).toBeTruthy();
            expect(screen.getByText('CRITICAL')).toBeTruthy();
        });
    });

    it('renders event summaries', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/5 failed login attempts/)).toBeTruthy();
            expect(screen.getByText(/Exported 10k\+ records/)).toBeTruthy();
        });
    });

    it('renders operator names', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeTruthy();
            expect(screen.getByText('Bob')).toBeTruthy();
        });
    });

    it('renders IP addresses', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('192.168.1.100')).toBeTruthy();
            expect(screen.getByText('10.0.0.50')).toBeTruthy();
        });
    });

    it('shows "Failed to notify" for failed notifications', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/Failed to notify/)).toBeTruthy();
        });
    });

    it('renders table headers', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Time')).toBeTruthy();
            expect(screen.getByText('Rule')).toBeTruthy();
            expect(screen.getByText('Summary')).toBeTruthy();
            expect(screen.getByText('Operator')).toBeTruthy();
            expect(screen.getByText('Status')).toBeTruthy();
            expect(screen.getByText('Actions')).toBeTruthy();
        });
    });

    it('renders resolve buttons for open alerts', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            const ackBtns = screen.getAllByTitle('Acknowledge');
            expect(ackBtns.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('renders "resolved by" info for resolved alerts', async () => {
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/By: admin/)).toBeTruthy();
        });
    });

    it('calls API on mount', async () => {
        const api = (await import('../services/api')).default;
        render(<AlertCenter />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/audit/alerts'));
        });
    });
});
