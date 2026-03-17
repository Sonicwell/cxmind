import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Users from './Users';

// ── Mocks ─────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, opts?: any) => {
            if (opts?.name) return `${k}: ${opts.name}`;
            return k;
        }
    }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ isDemoMode: false, demoMode: false }),
}));

const mockUsers = [
    {
        _id: 'u1', email: 'admin@test.com', displayName: 'Admin User',
        role: 'platform_admin', status: 'active' as const, isSystem: false,
        agentId: { _id: 'a1', sipNumber: '1001', displayName: 'Agent 1' },
        lastLogin: '2026-02-20T10:00:00Z', createdAt: '2026-01-01T00:00:00Z',
    },
    {
        _id: 'u2', email: 'agent@test.com', displayName: 'Test Agent',
        role: 'agent', status: 'inactive' as const, isSystem: false,
        createdAt: '2026-01-15T00:00:00Z',
    },
    {
        _id: 'u3', email: 'system@test.com', displayName: 'System Bot',
        role: 'supervisor', status: 'active' as const, isSystem: true,
        createdAt: '2026-01-01T00:00:00Z',
    },
];

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockImplementation((url: string) => {
            if (url.includes('agents/available')) {
                return Promise.resolve({
                    data: {
                        data: [
                            { _id: 'a2', sipNumber: '1002', displayName: 'Agent 2' },
                        ]
                    }
                });
            }
            return Promise.resolve({ data: { data: mockUsers } });
        }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        patch: vi.fn().mockResolvedValue({ data: {} }),
        put: vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue({ data: {} }),
    },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'current-user-id', role: 'platform_admin', clientId: 'c1' },
        hasPermission: () => true,
    }),
}));

vi.mock('../components/ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, disabled, ...props }: any) => (
        <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
    ),
}));

vi.mock('../components/ui/OrganicCard', () => ({
    OrganicCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('../components/ui/GlassModal', () => ({
    GlassModal: ({ open, children, title, onOpenChange }: any) =>
        open ? (
            <div data-testid="glass-modal">
                <h2>{title}</h2>
                {children}
                <button data-testid="modal-close" onClick={() => onOpenChange(false)}>Close</button>
            </div>
        ) : null,
}));

vi.mock('../components/ui/AvatarInitials', () => ({
    default: ({ name }: any) => <span data-testid="avatar">{name?.charAt(0)}</span>,
}));

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

// ── Tests ──────────────────────────────────────────────────

describe('Users Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows loading state initially', () => {
        render(<Users />, { wrapper: Wrapper });
        expect(screen.getByText(/common.loading/i)).toBeTruthy();
    });

    it('renders user table with SIP numbers after loading', async () => {
        render(<Users />, { wrapper: Wrapper });
        // SIP number from agentId.sipNumber
        await waitFor(() => {
            expect(screen.getByText('1001')).toBeTruthy();
        });
    });

    it('renders user roles', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('platform_admin')).toBeTruthy();
            expect(screen.getByText('agent')).toBeTruthy();
            expect(screen.getByText('supervisor')).toBeTruthy();
        });
    });

    it('renders status badges (ACTIVE/INACTIVE)', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('INACTIVE')).toBeTruthy();
        });
    });

    it('shows "never" for users without lastLogin', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            // u2 and u3 have no lastLogin
            const neverTexts = screen.getAllByText('usersPage.never');
            expect(neverTexts.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('renders user emails', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('admin@test.com')).toBeTruthy();
            expect(screen.getByText('agent@test.com')).toBeTruthy();
        });
    });

    it('renders user display names', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Admin User')).toBeTruthy();
            expect(screen.getByText('Test Agent')).toBeTruthy();
        });
    });

    it('renders search input', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByPlaceholderText('usersPage.searchPlaceholder')).toBeTruthy();
        });
    });

    it('filters users by search term', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('admin@test.com')).toBeTruthy();
        });

        const searchInput = screen.getByPlaceholderText('usersPage.searchPlaceholder');
        fireEvent.change(searchInput, { target: { value: 'system@' } });

        await waitFor(() => {
            expect(screen.getByText('system@test.com')).toBeTruthy();
            expect(screen.queryByText('admin@test.com')).toBeNull();
        });
    });

    it('renders Add User button', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('usersPage.addUser')).toBeTruthy();
        });
    });

    it('opens create modal when clicking Add User', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('usersPage.addUser')).toBeTruthy();
        });

        fireEvent.click(screen.getByText('usersPage.addUser'));

        await waitFor(() => {
            expect(screen.getByTestId('glass-modal')).toBeTruthy();
            expect(screen.getByText('usersPage.modal.addTitle')).toBeTruthy();
        });
    });

    it('handles API error gracefully during fetch', async () => {
        const api = await import('../services/api');
        vi.mocked(api.default.get).mockRejectedValue(new Error('Network error'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        render(<Users />, { wrapper: Wrapper });

        await waitFor(() => {
            // loading 结束 (finally 块)
            expect(screen.queryByText(/common.loading/i)).toBeNull();
        });

        consoleSpy.mockRestore();
        // 恢复原始 mock，避免泄漏到后续测试导致 Unhandled Rejection
        vi.mocked(api.default.get).mockImplementation((url: string) => {
            if (url.includes('agents/available')) {
                return Promise.resolve({
                    data: { data: [{ _id: 'a2', sipNumber: '1002', displayName: 'Agent 2' }] }
                });
            }
            return Promise.resolve({ data: { data: mockUsers } });
        });
    });

    it('renders table column headers', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('usersPage.col.user')).toBeTruthy();
            expect(screen.getByText('usersPage.col.role')).toBeTruthy();
            expect(screen.getByText('usersPage.col.status')).toBeTruthy();
        });
    });

    it('renders 6 role options in create modal', async () => {
        render(<Users />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('usersPage.addUser')).toBeTruthy();
        });

        fireEvent.click(screen.getByText('usersPage.addUser'));

        await waitFor(() => {
            expect(screen.getByText('Platform Admin')).toBeTruthy();
            expect(screen.getByText('Agent')).toBeTruthy();
            expect(screen.getByText('Supervisor')).toBeTruthy();
        });
    });
});
