import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TopicCloudWidget } from './TopicCloudWidget';

// Mock API
vi.mock('../../services/api', () => ({
    default: {
        get: vi.fn(),
    },
}));

// Mock useDemoMode
vi.mock('../../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: false }),
}));

import api from '../../services/api';

describe('TopicCloudWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should show spinner while loading', () => {
        (api.get as any).mockReturnValue(new Promise(() => { })); // Never resolves
        const { container } = render(<TopicCloudWidget />);
        expect(container.querySelector('.spinner')).toBeInTheDocument();
        // Title should always be visible, even during loading
        expect(screen.getByText('Top Conversational Themes')).toBeInTheDocument();
    });

    it('should show empty message when no topics returned', async () => {
        (api.get as any).mockResolvedValue({ data: { data: [] } });
        render(<TopicCloudWidget />);
        await waitFor(() => {
            expect(screen.getByText('No topic data available for this period.')).toBeInTheDocument();
        });
    });

    it('should render topic words when data is available', async () => {
        (api.get as any).mockResolvedValue({
            data: {
                data: [
                    { text: 'Refund', value: 50 },
                    { text: 'Billing', value: 30 },
                    { text: 'Support', value: 20 },
                ],
            },
        });

        render(<TopicCloudWidget />);
        await waitFor(() => {
            expect(screen.getByText('Refund')).toBeInTheDocument();
            expect(screen.getByText('Billing')).toBeInTheDocument();
            expect(screen.getByText('Support')).toBeInTheDocument();
        });
    });

    it('should render title with i18n key', async () => {
        (api.get as any).mockResolvedValue({
            data: { data: [{ text: 'Test', value: 10 }] },
        });

        render(<TopicCloudWidget />);
        await waitFor(() => {
            expect(screen.getByText('Top Conversational Themes')).toBeInTheDocument();
        });
    });

    it('should call API with correct days parameter', async () => {
        (api.get as any).mockResolvedValue({ data: { data: [] } });
        render(<TopicCloudWidget days={7} />);
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/analytics/summary/topics?days=7');
        });
    });

    it('should show occurrences in title attribute', async () => {
        (api.get as any).mockResolvedValue({
            data: {
                data: [{ text: 'Refund', value: 42 }],
            },
        });

        render(<TopicCloudWidget />);
        await waitFor(() => {
            const el = screen.getByText('Refund');
            expect(el.getAttribute('title')).toBe('42 occurrences');
        });
    });

    it('should handle API error gracefully', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        (api.get as any).mockRejectedValue(new Error('Network error'));
        render(<TopicCloudWidget />);
        await waitFor(() => {
            expect(screen.getByText('No topic data available for this period.')).toBeInTheDocument();
        });

        expect(spy).toHaveBeenCalledWith('[Analytics] Failed to fetch topics:', expect.any(Error));
        spy.mockRestore();
    });
});
