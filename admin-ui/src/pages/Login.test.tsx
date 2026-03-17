import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from './Login';
import { STORAGE_KEYS } from '../constants/storage-keys';

// ── Mocks ──

const mockLogin = vi.fn();
const mockNavigate = vi.fn();
const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        login: mockLogin,
    }),
}));

vi.mock('../services/api', () => ({
    default: {
        post: (...args: any[]) => mockPost(...args),
        get: (...args: any[]) => mockGet(...args),
    },
    getDeviceId: () => 'test-device-id',
}));

vi.mock('../components/ui/OrganicCard', () => ({
    OrganicCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('../components/ui/MotionButton', () => ({
    MotionButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@marsidev/react-turnstile', () => ({
    Turnstile: () => null,
}));

describe('Login Page – Remember Me', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        mockGet.mockResolvedValue({ data: { setupCompleted: true } });
    });

    it('should initialize fields as empty when no saved credentials', () => {
        render(<Login />);
        const emailInput = screen.getByPlaceholderText('admin@platform.com') as HTMLInputElement;
        const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
        const rememberCheckbox = screen.getByLabelText(/remember my email/i) as HTMLInputElement;

        expect(emailInput.value).toBe('');
        expect(passwordInput.value).toBe('');
        expect(rememberCheckbox.checked).toBe(false);
    });

    it('should restore saved email (but NOT password) from localStorage', () => {
        localStorage.setItem(STORAGE_KEYS.AUTH_SAVED_EMAIL, 'admin@example.com');
        localStorage.setItem(STORAGE_KEYS.AUTH_REMEMBER_ME, 'true');

        render(<Login />);
        const emailInput = screen.getByPlaceholderText('admin@platform.com') as HTMLInputElement;
        const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
        const rememberCheckbox = screen.getByLabelText(/remember my email/i) as HTMLInputElement;

        expect(emailInput.value).toBe('admin@example.com');
        expect(passwordInput.value).toBe('');            // password is never pre-filled
        expect(rememberCheckbox.checked).toBe(true);
    });

    it('should save ONLY email (not password) to localStorage on login when rememberMe is checked', async () => {
        mockPost.mockResolvedValue({
            data: { token: 'tok123', user: { id: '1', role: 'admin', email: 'admin@example.com', displayName: 'Admin' } },
        });

        render(<Login />);
        fireEvent.change(screen.getByPlaceholderText('admin@platform.com'), { target: { value: 'admin@example.com' } });
        fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'admin123' } });
        fireEvent.click(screen.getByLabelText(/remember my email/i));
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => {
            expect(localStorage.getItem(STORAGE_KEYS.AUTH_SAVED_EMAIL)).toBe('admin@example.com');
            // [SEC-1] Password must NEVER be stored in localStorage
            expect(localStorage.getItem('cxmind:auth:saved-password')).toBeNull();
            expect(localStorage.getItem(STORAGE_KEYS.AUTH_REMEMBER_ME)).toBe('true');
        });
    });

    it('should clear saved email on login when rememberMe is unchecked', async () => {
        // Pre-set values (as old version might have stored them)
        localStorage.setItem(STORAGE_KEYS.AUTH_SAVED_EMAIL, 'old@test.com');
        localStorage.setItem(STORAGE_KEYS.AUTH_REMEMBER_ME, 'true');

        mockPost.mockResolvedValue({
            data: { token: 'tok123', user: { id: '1', role: 'admin', email: 'admin@example.com', displayName: 'Admin' } },
        });

        render(<Login />);

        // Uncheck remember me
        const checkbox = screen.getByLabelText(/remember my email/i) as HTMLInputElement;
        expect(checkbox.checked).toBe(true); // restored from localStorage
        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(false);

        fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'admin123' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => {
            expect(localStorage.getItem(STORAGE_KEYS.AUTH_SAVED_EMAIL)).toBeNull();
            // Password was never stored in this flow
            expect(localStorage.getItem('cxmind:auth:saved-password')).toBeNull();
            expect(localStorage.getItem(STORAGE_KEYS.AUTH_REMEMBER_ME)).toBeNull();
        });
    });

    it('should call login with rememberMe=true when checkbox is checked', async () => {
        mockPost.mockResolvedValue({
            data: { token: 'tok123', user: { id: '1', role: 'admin', email: 'admin@example.com', displayName: 'Admin' } },
        });

        render(<Login />);
        fireEvent.change(screen.getByPlaceholderText('admin@platform.com'), { target: { value: 'admin@example.com' } });
        fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'admin123' } });
        fireEvent.click(screen.getByLabelText(/remember my email/i));
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => {
            // login(token, refreshToken, permissions, user, rememberMe)
            // mock response has no refreshToken/permissions, so they resolve to undefined/[]
            expect(mockLogin).toHaveBeenCalledWith(
                'tok123',
                undefined,          // refreshToken not in mock
                [],                 // permissions || []
                expect.objectContaining({ id: '1' }),
                true,               // rememberMe
            );
        });
    });
});
