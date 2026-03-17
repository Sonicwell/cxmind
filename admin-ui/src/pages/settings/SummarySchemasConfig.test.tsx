import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        patch: (...args: any[]) => mockPatch(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: false }),
}));

const mockSchemas = [
    {
        _id: 's1', clientId: '000000000000000000000000', name: 'General Support',
        industry: 'General', isDefault: true,
        fields: [
            { key: 'intent', label: 'Customer Intent', fieldType: 'string', required: true },
            { key: 'outcome', label: 'Outcome', fieldType: 'string', required: true },
        ],
    },
    {
        _id: 's2', clientId: '000000000000000000000000', name: 'Insurance Claims',
        industry: 'Insurance', isDefault: false,
        fields: [
            { key: 'claim_type', label: 'Claim Type', fieldType: 'string', required: true },
        ],
    },
];

import SummarySchemasConfig from './SummarySchemasConfig';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('SummarySchemasConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { data: mockSchemas } });
        mockPost.mockResolvedValue({ data: { success: true } });
        mockPatch.mockResolvedValue({ data: { success: true } });
        mockDelete.mockResolvedValue({ data: { success: true } });
    });

    it('fetches schemas on mount', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/platform/summary-schemas'));
    });

    it('renders page title', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Summary Schemas')).toBeTruthy());
    });

    it('renders loaded schemas', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('General Support')).toBeTruthy();
            expect(screen.getByText('Insurance Claims')).toBeTruthy();
        });
    });

    it('shows Default badge on default schema', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Default')).toBeTruthy();
        });
    });

    it('shows industry labels', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            // Industry labels rendered inside spans with emoji prefix
            expect(screen.getAllByText(/General/).length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText(/Insurance/).length).toBeGreaterThanOrEqual(1);
        });
    });

    it('shows field preview tags', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Customer Intent')).toBeTruthy();
            expect(screen.getByText('Outcome')).toBeTruthy();
        });
    });

    it('renders create new schema button', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Create New Schema')).toBeTruthy());
    });

    it('toggles create form on button click', async () => {
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Create New Schema')).toBeTruthy());
        fireEvent.click(screen.getByText('Create New Schema'));
        await waitFor(() => {
            expect(screen.getByText('Create New Summary Schema')).toBeTruthy();
            expect(screen.getByText('Schema Name')).toBeTruthy();
        });
    });

    it('shows empty state when no schemas', async () => {
        mockGet.mockResolvedValueOnce({ data: { data: [] } });
        render(<SummarySchemasConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('No summary schemas defined yet.')).toBeTruthy();
        });
    });
});
