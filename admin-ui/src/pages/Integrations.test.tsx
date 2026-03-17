import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { STORAGE_KEYS } from '../constants/storage-keys';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

// Mock fetch for integrations API
const originalFetch = global.fetch;

import Integrations from './Integrations';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('Integrations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'test-token');
        // Mock fetch to return empty integrations
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ data: [] }),
        }) as any;
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('renders page title', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        expect(screen.getByText('integrations.title')).toBeTruthy();
    });

    it('renders subtitle', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        expect(screen.getByText('integrations.subtitle')).toBeTruthy();
    });

    it('renders all integration cards', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        expect(screen.getByText('Salesforce')).toBeTruthy();
        expect(screen.getByText('Zendesk')).toBeTruthy();
        expect(screen.getByText('HubSpot')).toBeTruthy();
        expect(screen.getByText('Jira')).toBeTruthy();
        expect(screen.getByText('ServiceNow')).toBeTruthy();
        expect(screen.getByText('Intercom')).toBeTruthy();
        expect(screen.getByText('GitLab')).toBeTruthy();
    });

    it('renders tags for integrations', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        expect(screen.getByText('CRM')).toBeTruthy();
        expect(screen.getByText('Tickets')).toBeTruthy();
        expect(screen.getByText('DevOps')).toBeTruthy();
    });

    it('renders connect action text for disconnected integrations', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        // All not connected → should show "connect" text
        const connectTexts = screen.getAllByText('integrations.connect');
        expect(connectTexts.length).toBe(7);
    });

    it('filters integrations by search query', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        const searchInput = screen.getByPlaceholderText('integrations.searchPlaceholder');
        fireEvent.change(searchInput, { target: { value: 'zen' } });
        expect(screen.queryByText('Salesforce')).toBeNull();
        expect(screen.getByText('Zendesk')).toBeTruthy();
    });

    it('shows empty state when no match', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        const searchInput = screen.getByPlaceholderText('integrations.searchPlaceholder');
        fireEvent.change(searchInput, { target: { value: 'zzz_nonexistent' } });
        expect(screen.getByText('integrations.noResults')).toBeTruthy();
    });

    it('navigates to integration detail on card click', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        fireEvent.click(screen.getByText('Salesforce'));
        expect(mockNavigate).toHaveBeenCalledWith('/integrations/salesforce');
    });

    it('renders connected badge when integration is active', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ data: [{ provider: 'salesforce', status: 'active' }] }),
        }) as any;
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        await waitFor(() => {
            expect(screen.getByText('integrations.connected')).toBeTruthy();
        });
    });

    it('renders search input', async () => {
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        expect(screen.getByPlaceholderText('integrations.searchPlaceholder')).toBeTruthy();
    });

    // [guard] token-key drift regression test
    it('[guard] fetch is skipped when auth token is missing', async () => {
        localStorage.clear();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ data: [{ provider: 'salesforce', status: 'active' }] }),
        }) as any;
        await act(async () => { render(<Integrations />, { wrapper: Wrapper }); });
        // Without token, fetch should not be called for integrations status
        const fetchCalls = (global.fetch as any).mock.calls
            .filter((c: any) => c[0]?.includes?.('/api/integrations'));
        expect(fetchCalls.length).toBe(0);
    });
});
