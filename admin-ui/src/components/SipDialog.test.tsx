import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();

vi.mock('../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
    },
}));

vi.mock('../utils/date', () => ({
    formatToLocalTime: (ts: string) => `2025-01-01, 10:30:15 AM`,
    formatUTCToLocal: (ts: string, fmt?: string) => `10:30:15`,
}));

const mockMessages = [
    {
        timestamp: '2025-01-01T10:30:15.000Z', method: 'INVITE', status_code: 0,
        src_ip: '10.0.0.1', dst_ip: '10.0.0.2', src_port: 5060, dst_port: 5060,
        body: 'INVITE sip:callee@10.0.0.2 SIP/2.0\nVia: SIP/2.0/UDP 10.0.0.1\nCall-ID: abc123\n\nv=0\no=- 123 IN IP4 10.0.0.1',
    },
    {
        timestamp: '2025-01-01T10:30:15.100Z', method: '', status_code: 100,
        src_ip: '10.0.0.2', dst_ip: '10.0.0.1', src_port: 5060, dst_port: 5060,
        body: 'SIP/2.0 100 Trying\nVia: SIP/2.0/UDP 10.0.0.1',
    },
    {
        timestamp: '2025-01-01T10:30:15.200Z', method: '', status_code: 200,
        src_ip: '10.0.0.2', dst_ip: '10.0.0.1', src_port: 5060, dst_port: 5060,
        body: 'SIP/2.0 200 OK\nVia: SIP/2.0/UDP 10.0.0.1\n\nv=0\no=- 456 IN IP4 10.0.0.2',
    },
];

import SipDialog from './SipDialog';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('SipDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { data: mockMessages } });
    });

    it('shows loading state initially', () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        expect(screen.getByText('Loading dialog...')).toBeTruthy();
    });

    it('fetches dialog from API', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/platform/calls/call-123/dialog'));
    });

    it('renders host IP headers in SVG', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('10.0.0.1:5060')).toBeTruthy();
            expect(screen.getByText('10.0.0.2:5060')).toBeTruthy();
        });
    });

    it('renders SIP method labels (INVITE)', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('INVITE (SDP)')).toBeTruthy();
        });
    });

    it('renders response labels (100 Trying, 200 OK)', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('100 Trying')).toBeTruthy();
            expect(screen.getByText('200 OK (SDP)')).toBeTruthy();
        });
    });

    it('shows placeholder when no message is selected', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Select a message to view details')).toBeTruthy();
        });
    });

    it('renders SVG with correct dimensions', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => {
            const svg = document.querySelector('svg');
            expect(svg).toBeTruthy();
            // 2 hosts × 180 column width + 80 start padding + 20 = 460
            expect(svg?.getAttribute('width')).toBe('460');
        });
    });

    it('renders arrowheads as polygons', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => {
            const polygons = document.querySelectorAll('polygon');
            expect(polygons.length).toBe(3); // one per message
        });
    });

    it('renders delta time strings', async () => {
        render(<SipDialog callId="call-123" />, { wrapper: Wrapper });
        await waitFor(() => {
            // 100ms and 200ms deltas
            expect(screen.getAllByText('+100ms').length).toBeGreaterThanOrEqual(1);
        });
    });
});
