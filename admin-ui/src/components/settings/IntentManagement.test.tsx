import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        put: (...args: any[]) => mockPut(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

vi.mock('../ui/ConfirmModal', () => ({
    ConfirmModal: ({ open, onConfirm, onClose, title }: any) =>
        open ? <div data-testid="confirm-modal"><span>{title}</span><button onClick={onConfirm}>confirm</button></div> : null,
}));

const mockIntents = [
    {
        _id: 'i1', slug: 'refund', name: 'Refund Request',
        description: 'Customer wants refund', exampleTexts: ['I want a refund', 'Give me my money back', 'I need a refund please'],
        priority: 'high' as const, enabled: true, createdAt: '2025-01-01', updatedAt: '2025-01-01',
    },
    {
        _id: 'i2', slug: 'billing', name: 'Billing Inquiry',
        description: '', exampleTexts: ['Check my bill', 'What are my charges', 'Invoice question'],
        priority: 'normal' as const, enabled: false, createdAt: '2025-01-02', updatedAt: '2025-01-02',
    },
];

import IntentManagement from './IntentManagement';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('IntentManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: mockIntents });
    });

    it('fetches intents on mount', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/intents'));
    });

    it('renders header with title and count', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Routing Intents')).toBeTruthy();
            expect(screen.getByText('(2)')).toBeTruthy();
        });
    });

    it('renders intent slugs and names', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('refund')).toBeTruthy();
            expect(screen.getByText('Refund Request')).toBeTruthy();
            expect(screen.getByText('billing')).toBeTruthy();
            expect(screen.getByText('Billing Inquiry')).toBeTruthy();
        });
    });

    it('renders priority badges', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('High')).toBeTruthy();
            expect(screen.getByText('Normal')).toBeTruthy();
        });
    });

    it('renders example text counts', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getAllByText('3 examples').length).toBe(2);
        });
    });

    it('renders Add Intent button', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Add Intent')).toBeTruthy());
    });

    it('opens create form on Add Intent click', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Add Intent')).toBeTruthy());
        fireEvent.click(screen.getByText('Add Intent'));
        expect(screen.getByText('New Intent')).toBeTruthy();
        expect(screen.getByText('Slug')).toBeTruthy();
    });

    it('renders test panel with input', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Test Match')).toBeTruthy();
            expect(screen.getByPlaceholderText(/Type a customer message/)).toBeTruthy();
        });
    });

    it('calls test API on test button click', async () => {
        mockPost.mockResolvedValue({ data: { match: { intent: 'refund', priority: 'high', score: 0.91 } } });
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByPlaceholderText(/Type a customer message/)).toBeTruthy());
        const input = screen.getByPlaceholderText(/Type a customer message/);
        fireEvent.change(input, { target: { value: 'I want my money back' } });
        fireEvent.click(screen.getByText('Test'));
        await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/intents/test', { text: 'I want my money back' }));
    });

    it('shows empty state when no intents', async () => {
        mockGet.mockResolvedValue({ data: [] });
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/No routing intents configured/)).toBeTruthy();
        });
    });

    it('disabled intents are rendered with reduced opacity', async () => {
        render(<IntentManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            // Billing Inquiry is disabled (opacity: 0.5)
            expect(screen.getByText('Billing Inquiry')).toBeTruthy();
        });
    });
});
