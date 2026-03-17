import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();

vi.mock('../../services/api', () => ({
    default: { get: (...args: any[]) => mockGet(...args) },
}));

vi.mock('../../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: false }),
}));

vi.mock('../../services/mock-data', () => ({
    getMockActionHistory: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../ui/GlassModal', () => ({
    GlassModal: ({ open, title, children }: any) =>
        open ? <div data-testid="glass-modal"><h3>{title}</h3>{children}</div> : null,
}));

vi.mock('../ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, ...props }: any) =>
        <button onClick={onClick} {...props}>{children}</button>,
}));

const mockHistory = [
    {
        actionId: 'a1', callId: 'call-001', agentId: 'ag1', agentName: 'Alice',
        intentSlug: 'refund', intentName: 'Refund Request', status: 'confirmed' as const,
        deliveryStatus: 'enqueued' as const, confidence: 0.95,
        payload: { amount: 50, reason: 'defective' }, createdAt: '2025-01-15T10:30:00Z',
    },
    {
        actionId: 'a2', callId: 'call-002', agentId: 'ag2', agentName: 'Bob',
        intentSlug: 'billing', intentName: 'Billing Inquiry', status: 'rejected' as const,
        confidence: 0.72, createdAt: '2025-01-15T11:00:00Z',
    },
    {
        actionId: 'a3', callId: 'call-003', agentId: 'ag3', agentName: 'Charlie',
        intentSlug: 'transfer', intentName: 'Transfer Call', status: 'suggested' as const,
        confidence: 0.88, createdAt: '2025-01-15T12:00:00Z',
    },
];

import ActionHistoryTable from './ActionHistoryTable';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('ActionHistoryTable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: mockHistory });
    });

    it('fetches history on mount', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/platform/actions/history'));
    });

    it('renders table headers', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('actions.time')).toBeTruthy();
            expect(screen.getByText('actions.action')).toBeTruthy();
            expect(screen.getByText('actions.agent')).toBeTruthy();
            expect(screen.getByText('actions.confidence')).toBeTruthy();
            expect(screen.getByText('actions.statusCol')).toBeTruthy();
            expect(screen.getByText('actions.delivery')).toBeTruthy();
        });
    });

    it('renders agent names', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeTruthy();
            expect(screen.getByText('Bob')).toBeTruthy();
            expect(screen.getByText('Charlie')).toBeTruthy();
        });
    });

    it('renders intent names', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Refund Request')).toBeTruthy();
            expect(screen.getByText('Billing Inquiry')).toBeTruthy();
            expect(screen.getByText('Transfer Call')).toBeTruthy();
        });
    });

    it('renders status badges', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            // Status text appears in both table badges and filter dropdown options
            expect(screen.getAllByText('confirmed').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('rejected').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('suggested').length).toBeGreaterThanOrEqual(1);
        });
    });

    it('renders confidence percentages', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('95%')).toBeTruthy();
            expect(screen.getByText('72%')).toBeTruthy();
            expect(screen.getByText('88%')).toBeTruthy();
        });
    });

    it('renders delivery status for confirmed actions', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('✓ Sent')).toBeTruthy();
        });
    });

    it('filters by search term', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Alice')).toBeTruthy());
        const input = screen.getByPlaceholderText('actions.searchPlaceholder');
        fireEvent.change(input, { target: { value: 'Bob' } });
        expect(screen.queryByText('Alice')).toBeNull();
        expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('filters by status dropdown', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Alice')).toBeTruthy());
        const select = screen.getByDisplayValue('actions.allStatus');
        fireEvent.change(select, { target: { value: 'rejected' } });
        expect(screen.queryByText('Alice')).toBeNull();
        expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('renders showing records count', async () => {
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('actions.showingRecords')).toBeTruthy();
        });
    });

    it('shows empty state when no records', async () => {
        mockGet.mockResolvedValue({ data: [] });
        render(<ActionHistoryTable />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('actions.noRecords')).toBeTruthy();
        });
    });
});
