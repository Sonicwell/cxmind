import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../components/ui/OrganicCard', () => ({
    OrganicCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('date-fns', () => ({
    formatDistanceToNow: () => '5 minutes ago',
}));

const mockSessions = [
    { id: 'sess1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120', ipAddress: '192.168.1.10', lastActive: '2025-01-01T10:00:00Z', expiresAt: '2025-01-02T10:00:00Z' },
    { id: 'sess2', userAgent: 'Mozilla/5.0 (Linux; Android) Mobile Safari', ipAddress: '10.0.0.1', lastActive: '2025-01-01T08:00:00Z', expiresAt: '2025-01-02T08:00:00Z' },
];

import SessionManagement from './SessionManagement';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('SessionManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: mockSessions });
    });

    it('fetches sessions on mount', async () => {
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/auth/sessions'));
    });

    it('renders page title', async () => {
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Active Sessions')).toBeTruthy());
    });

    it('renders session entries with parsed user agent', async () => {
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            // 第一个 session: macOS Chrome
            expect(screen.getByText(/macOS - Chrome/)).toBeTruthy();
        });
    });

    it('shows Current Device badge on first session', async () => {
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Current Device')).toBeTruthy();
        });
    });

    it('displays IP addresses', async () => {
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('192.168.1.10')).toBeTruthy();
            expect(screen.getByText('10.0.0.1')).toBeTruthy();
        });
    });

    it('shows Sign Out button for non-current sessions', async () => {
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            // Only non-current sessions get Sign Out, current session (index 0) does not
            const signOutButtons = screen.getAllByText('Sign Out');
            expect(signOutButtons.length).toBe(1); // only sess2
        });
    });

    it('shows Refresh button', async () => {
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Refresh')).toBeTruthy());
    });

    it('shows empty state when no sessions', async () => {
        mockGet.mockResolvedValueOnce({ data: [] });
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('No active sessions found.')).toBeTruthy();
        });
    });

    it('shows error message on fetch failure', async () => {
        mockGet.mockRejectedValueOnce({ response: { data: { error: 'Auth error' } } });
        render(<SessionManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Auth error')).toBeTruthy();
        });
    });
});
