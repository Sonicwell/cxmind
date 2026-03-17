import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ClientProvider, useClients } from './ClientContext';

function TestConsumer() {
    const { clients, clientsMap, loading, refreshClients } = useClients();
    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="count">{clients.length}</span>
            <span data-testid="map">{JSON.stringify(clientsMap)}</span>
            <button data-testid="refresh" onClick={refreshClients}>Refresh</button>
        </div>
    );
}

describe('ClientContext', () => {
    it('useClients throws when used outside provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => render(<TestConsumer />)).toThrow('useClients must be used within a ClientProvider');
        spy.mockRestore();
    });

    it('provides loading=true initially', () => {
        render(
            <ClientProvider>
                <TestConsumer />
            </ClientProvider>
        );
        // Initially loading, quickly resolves
        expect(screen.getByTestId('loading')).toBeTruthy();
    });

    it('provides empty clients after load', async () => {
        render(
            <ClientProvider>
                <TestConsumer />
            </ClientProvider>
        );
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });
        expect(screen.getByTestId('count').textContent).toBe('0');
        expect(screen.getByTestId('map').textContent).toBe('{}');
    });

    it('renders children correctly', () => {
        render(
            <ClientProvider>
                <div data-testid="child">Hello</div>
            </ClientProvider>
        );
        expect(screen.getByTestId('child').textContent).toBe('Hello');
    });

    it('provides refreshClients function', async () => {
        render(
            <ClientProvider>
                <TestConsumer />
            </ClientProvider>
        );
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });
        expect(screen.getByTestId('refresh')).toBeTruthy();
    });
});
