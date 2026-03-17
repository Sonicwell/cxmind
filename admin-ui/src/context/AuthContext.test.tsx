import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('axios', () => ({
    default: {
        post: vi.fn(),
    },
}));

import axios from 'axios';
const mockAxiosPost = vi.mocked(axios.post);

const STORAGE_KEYS = {
    AUTH_TOKEN: 'cxmind:auth:token',
    AUTH_REFRESH_TOKEN: 'cxmind:auth:refresh-token',
    AUTH_USER: 'cxmind:auth:user',
    AUTH_PERMISSIONS: 'cxmind:auth:permissions',
};

// ── Test helper ───────────────────────────────────────────────────────────────
const AuthConsumer: React.FC = () => {
    const { isAuthenticated, loading, user, permissions } = useAuth();
    if (loading) return <div>loading</div>;
    return (
        <div>
            <div data-testid="auth">{isAuthenticated ? 'authed' : 'guest'}</div>
            <div data-testid="user">{user?.email ?? 'none'}</div>
            <div data-testid="perms">{permissions.join(',')}</div>
        </div>
    );
};

const renderWithAuth = () =>
    render(
        <AuthProvider>
            <AuthConsumer />
        </AuthProvider>
    );

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('AuthContext', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('shows guest state when no token is stored', async () => {
        renderWithAuth();
        await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('guest'));
    });

    it('restores session from localStorage on mount', async () => {
        const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'tok');
        localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));
        localStorage.setItem(STORAGE_KEYS.AUTH_PERMISSIONS, JSON.stringify(['agents:read']));

        renderWithAuth();
        await waitFor(() => {
            expect(screen.getByTestId('auth').textContent).toBe('authed');
            expect(screen.getByTestId('user').textContent).toBe('a@b.com');
            expect(screen.getByTestId('perms').textContent).toBe('agents:read');
        });
    });

    it('[SEC-2] silently renews session via refresh token', async () => {
        const newUser = { id: '1', email: 'r@b.com', displayName: 'R', role: 'admin' };
        localStorage.setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, 'rt123');

        mockAxiosPost.mockResolvedValueOnce({
            data: {
                token: 'newTok',
                refreshToken: 'newRt',
                user: newUser,
                permissions: ['calls:read'],
            },
        });

        renderWithAuth();
        // Initially shows loading
        expect(screen.getByText('loading')).toBeTruthy();

        await waitFor(() => {
            expect(screen.getByTestId('auth').textContent).toBe('authed');
            expect(screen.getByTestId('user').textContent).toBe('r@b.com');
            expect(screen.getByTestId('perms').textContent).toBe('calls:read');
        });

        // Verify new tokens were persisted
        expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe('newTok');
        expect(localStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN)).toBe('newRt');
    });

    it('[SEC-2] saves redirect URL and shows guest when refresh token fails', async () => {
        localStorage.setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, 'expired');
        mockAxiosPost.mockRejectedValueOnce(new Error('401 Unauthorized'));

        // Simulate user being on /audit/logs
        Object.defineProperty(window, 'location', {
            value: { pathname: '/audit/logs', search: '' },
            writable: true,
        });

        renderWithAuth();
        await waitFor(() => {
            expect(screen.getByTestId('auth').textContent).toBe('guest');
        });

        expect(sessionStorage.getItem('cxmind:auth:redirect-after-login')).toBe('/audit/logs');
        // Tokens should be cleared
        expect(localStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN)).toBeNull();
    });

    it('login() persists tokens to localStorage when rememberMe=true', async () => {
        const LoginTrigger: React.FC = () => {
            const { login } = useAuth();
            return (
                <button
                    onClick={() =>
                        login('tok', 'rt', ['a:b'], { id: '1', email: 'x@y.com', displayName: 'X', role: 'admin' }, true)
                    }
                >
                    login
                </button>
            );
        };
        render(<AuthProvider><LoginTrigger /></AuthProvider>);
        await act(async () => {
            screen.getByText('login').click();
        });
        expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe('tok');
        expect(localStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN)).toBe('rt');
    });

    it('login() persists tokens to sessionStorage when rememberMe=false', async () => {
        const LoginTrigger: React.FC = () => {
            const { login } = useAuth();
            return (
                <button
                    onClick={() =>
                        login('tok2', 'rt2', [], { id: '2', email: 'y@z.com', displayName: 'Y', role: 'agent' }, false)
                    }
                >
                    login
                </button>
            );
        };
        render(<AuthProvider><LoginTrigger /></AuthProvider>);
        await act(async () => {
            screen.getByText('login').click();
        });
        expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe('tok2');
        expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
    });

    it('logout() clears all auth storage', async () => {
        const user = { id: '1', email: 'x@y.com', displayName: 'X', role: 'admin' };
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'tok');
        localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));

        const LogoutTrigger: React.FC = () => {
            const { logout } = useAuth();
            return <button onClick={logout}>logout</button>;
        };
        render(<AuthProvider><LogoutTrigger /></AuthProvider>);

        await waitFor(() => screen.getByText('logout'));
        await act(async () => {
            screen.getByText('logout').click();
        });

        expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.AUTH_USER)).toBeNull();
    });
});
