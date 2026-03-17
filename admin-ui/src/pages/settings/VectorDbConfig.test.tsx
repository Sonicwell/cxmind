import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        patch: (...args: any[]) => mockPatch(...args),
        post: (...args: any[]) => mockPost(...args),
    },
}));

import { VectorDbConfig } from './VectorDbConfig';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('VectorDbConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { data: { vectorDb: { provider: 'system', collection: 'knowledge_base' } } } });
        mockPatch.mockResolvedValue({ data: { success: true } });
        mockPost.mockResolvedValue({ data: { ok: true, message: 'Connected' } });
    });

    it('fetches vector DB config on mount', async () => {
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/platform/settings'));
    });

    it('renders page title and description', async () => {
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Vector Database (RAG)')).toBeTruthy();
            expect(screen.getByText(/Configure the vector database/)).toBeTruthy();
        });
    });

    it('renders provider selector with options', async () => {
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Provider')).toBeTruthy();
            expect(screen.getByText('System Built-in (Qdrant)')).toBeTruthy();
        });
    });

    it('renders collection input', async () => {
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Default Collection / Index')).toBeTruthy();
        });
    });

    it('renders save button', async () => {
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Configuration')).toBeTruthy());
    });

    it('calls save API on save click', async () => {
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Configuration')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Configuration'));
        await waitFor(() => {
            expect(mockPatch).toHaveBeenCalledWith('/platform/settings', expect.objectContaining({
                vectorDb: expect.objectContaining({ provider: 'system' }),
            }));
        });
    });

    it('shows success message after save', async () => {
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Configuration')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Configuration'));
        await waitFor(() => {
            expect(screen.getByText(/saved successfully/i)).toBeTruthy();
        });
    });

    it('shows error message if save fails', async () => {
        mockPatch.mockRejectedValueOnce(new Error('fail'));
        render(<VectorDbConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Configuration')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Configuration'));
        await waitFor(() => {
            expect(screen.getByText(/Failed to save/i)).toBeTruthy();
        });
    });
});
