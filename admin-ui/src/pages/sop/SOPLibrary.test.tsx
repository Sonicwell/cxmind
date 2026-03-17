import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string) => k,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

const mockSOPs = [
    {
        _id: 'sop1', name: 'Flight Delay Handling', description: 'Handle flight delay scenarios',
        category: 'CUSTOMER_SERVICE', status: 'PUBLISHED',
        nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }], edges: [],
        updatedAt: '2025-01-01T00:00:00Z',
    },
    {
        _id: 'sop2', name: 'Cold Call Script', description: 'Outbound sales cold call workflow',
        category: 'SALES', status: 'DRAFT',
        nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [],
        updatedAt: '2025-01-02T00:00:00Z',
    },
    {
        _id: 'sop3', name: 'Wi-Fi Troubleshooting', description: 'Step-by-step WiFi debug',
        category: 'TECH_SUPPORT', status: 'ARCHIVED',
        nodes: [], edges: [],
        updatedAt: '2025-01-03T00:00:00Z',
    },
];

import SOPLibrary from './SOPLibrary';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('SOPLibrary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: mockSOPs });
    });

    it('fetches SOPs on mount', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/sops'));
    });

    it('renders page title', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('sopLibrary.title')).toBeTruthy());
    });

    it('renders SOP names', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Flight Delay Handling')).toBeTruthy();
            expect(screen.getByText('Cold Call Script')).toBeTruthy();
            expect(screen.getByText('Wi-Fi Troubleshooting')).toBeTruthy();
        });
    });

    it('renders SOP descriptions', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Handle flight delay scenarios')).toBeTruthy();
            expect(screen.getByText('Outbound sales cold call workflow')).toBeTruthy();
        });
    });

    it('renders category badges', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('sopLibrary.category.customerService')).toBeTruthy();
            expect(screen.getByText('sopLibrary.category.sales')).toBeTruthy();
            expect(screen.getByText('sopLibrary.category.techSupport')).toBeTruthy();
        });
    });

    it('renders status badges', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => {
            // status badges render raw status string (not i18n'd)
            expect(screen.getByText('PUBLISHED')).toBeTruthy();
            expect(screen.getByText('DRAFT')).toBeTruthy();
            expect(screen.getByText('ARCHIVED')).toBeTruthy();
        });
    });

    it('renders node count', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => {
            // "{count} {t('sopLibrary.nodes')}" renders as separate text nodes
            expect(screen.getByText(/3\s*sopLibrary\.nodes/)).toBeTruthy();
            expect(screen.getByText(/2\s*sopLibrary\.nodes/)).toBeTruthy();
            expect(screen.getByText(/0\s*sopLibrary\.nodes/)).toBeTruthy();
        });
    });

    it('renders Create New SOP button', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('sopLibrary.createNew')).toBeTruthy());
    });

    it('navigates to builder on Create button click', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('sopLibrary.createNew')).toBeTruthy());
        fireEvent.click(screen.getByText('sopLibrary.createNew'));
        expect(mockNavigate).toHaveBeenCalledWith('/sop/builder');
    });

    it('filters by search query', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Flight Delay Handling')).toBeTruthy());
        const searchInput = screen.getByPlaceholderText('sopLibrary.searchPlaceholder');
        fireEvent.change(searchInput, { target: { value: 'cold call' } });
        expect(screen.queryByText('Flight Delay Handling')).toBeNull();
        expect(screen.getByText('Cold Call Script')).toBeTruthy();
    });

    it('filters by status', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Flight Delay Handling')).toBeTruthy());
        // filter button renders t('sopLibrary.filterDraft') → 'sopLibrary.filterDraft'
        fireEvent.click(screen.getByText('sopLibrary.filterDraft'));
        expect(screen.queryByText('Flight Delay Handling')).toBeNull();
        expect(screen.getByText('Cold Call Script')).toBeTruthy();
    });

    it('shows empty state when no match', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Flight Delay Handling')).toBeTruthy());
        const searchInput = screen.getByPlaceholderText('sopLibrary.searchPlaceholder');
        fireEvent.change(searchInput, { target: { value: 'zzz_nonexistent' } });
        expect(screen.getByText('sopLibrary.noResults')).toBeTruthy();
    });

    it('renders Clone buttons for each SOP', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getAllByText('sopLibrary.clone').length).toBe(3);
        });
    });

    it('renders Edit buttons for each SOP', async () => {
        render(<SOPLibrary />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getAllByText('sopLibrary.edit').length).toBe(3);
        });
    });

    it('shows loading state', () => {
        mockGet.mockReturnValue(new Promise(() => { })); // never resolves
        render(<SOPLibrary />, { wrapper: Wrapper });
        expect(screen.getByText('sopLibrary.loading')).toBeTruthy();
    });
});
