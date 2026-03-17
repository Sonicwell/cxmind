import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Must mock AuthContext before importing WebSocketContext
vi.mock('./AuthContext', () => ({
    useAuth: vi.fn().mockReturnValue({
        isAuthenticated: false,
        token: null,
        logout: vi.fn(),
    }),
}));

import { WebSocketProvider, useWebSocket } from './WebSocketContext';
import { useAuth } from './AuthContext';

const mockUseAuth = vi.mocked(useAuth);

// Test consumer component
function TestConsumer() {
    const { connected, error, send, subscribe, disconnect, reconnect } = useWebSocket();
    return (
        <div>
            <span data-testid="connected">{String(connected)}</span>
            <span data-testid="error">{error ? error.message : 'none'}</span>
            <button data-testid="send" onClick={() => send({ type: 'test' })}>Send</button>
            <button data-testid="disconnect" onClick={disconnect}>Disconnect</button>
            <button data-testid="reconnect" onClick={reconnect}>Reconnect</button>
        </div>
    );
}

describe('WebSocketContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseAuth.mockReturnValue({
            isAuthenticated: false,
            token: null,
            logout: vi.fn(),
        } as any);
    });

    it('useWebSocket throws when used outside provider', () => {
        // Swallow React error boundary logs
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => render(<TestConsumer />)).toThrow('useWebSocket must be used within WebSocketProvider');
        spy.mockRestore();
    });

    it('provides connected=false when not authenticated', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        );
        expect(screen.getByTestId('connected').textContent).toBe('false');
    });

    it('provides error=none initially', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        );
        expect(screen.getByTestId('error').textContent).toBe('none');
    });

    it('renders children correctly', () => {
        render(
            <WebSocketProvider>
                <div data-testid="child">Hello</div>
            </WebSocketProvider>
        );
        expect(screen.getByTestId('child').textContent).toBe('Hello');
    });

    it('provides send/disconnect/reconnect functions', () => {
        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        );
        expect(screen.getByTestId('send')).toBeTruthy();
        expect(screen.getByTestId('disconnect')).toBeTruthy();
        expect(screen.getByTestId('reconnect')).toBeTruthy();
    });

    it('sets connected=true in mock mode when authenticated', () => {
        // Simulate VITE_MOCK_MODE
        const origEnv = import.meta.env.VITE_MOCK_MODE;
        import.meta.env.VITE_MOCK_MODE = 'true';

        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            token: 'test-token',
            logout: vi.fn(),
        } as any);

        render(
            <WebSocketProvider>
                <TestConsumer />
            </WebSocketProvider>
        );
        expect(screen.getByTestId('connected').textContent).toBe('true');

        import.meta.env.VITE_MOCK_MODE = origEnv;
    });
});
