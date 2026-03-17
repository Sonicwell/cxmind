import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();

vi.mock('../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
    },
}));

vi.mock('../services/mock-data', () => ({
    getMockCallDetails: () => ({
        callData: {
            callId: 'demo-call-001',
            startTime: '2025-01-01T10:00:00Z',
            endTime: '2025-01-01T10:05:00Z',
            caller: '+8613800138000',
            callee: '+8613900139000',
            lastStatus: 200,
            transcriptions: [],
            summary: 'Demo call about billing inquiry',
            quality: { mos: 4.2, jitter: 12.5, packetLoss: 0.01, codec: 'G.711' },
            hasFullPcap: false,
        },
    }),
}));

vi.mock('./QualityTimeline', () => ({
    default: () => <div data-testid="quality-timeline" />,
}));

vi.mock('./StereoAudioPlayer', () => ({
    StereoAudioPlayer: () => <div data-testid="stereo-player" />,
}));

vi.mock('./DtmfEvents', () => ({
    DtmfEvents: () => <div data-testid="dtmf-events" />,
}));

vi.mock('./ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, ...props }: any) =>
        <button onClick={onClick} {...props}>{children}</button>,
}));

const mockCallData = {
    callId: 'call-123',
    startTime: '2025-01-01T10:00:00Z',
    endTime: '2025-01-01T10:05:00Z',
    caller: '+8613800138000',
    callee: '+8613900139000',
    lastStatus: 200,
    transcriptions: [],
    summary: 'Customer asked about billing',
    quality: {
        mos: 4.2, jitter: 12.5, packetLoss: 0.01,
        codec: 'G.711', pdd_ms: 1500, r_factor: 85, rtt: 45,
        quality_grade: 'Good',
    },
    hasFullPcap: true,
};

const mockOutcome = { data: { outcome: 'success', confidence: 0.92, source: 'ai' } };
const mockSummary = {
    data: {
        intent: 'Billing inquiry',
        outcome: 'Resolved',
        nextAction: 'Send invoice',
        entities: { customer: 'John', plan: 'Premium' },
        sentiment: 'positive',
        rawSummary: '',
        llmModel: 'gpt-4o-mini',
        createdAt: '2025-01-01T10:05:00Z',
    },
};

import CallDetails from './CallDetails';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('CallDetails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockImplementation((url: string) => {
            if (url.includes('/outcome')) return Promise.resolve({ data: mockOutcome });
            if (url.includes('/summary')) return Promise.resolve({ data: mockSummary });
            return Promise.resolve({ data: mockCallData });
        });
    });

    it('returns null when no callId', () => {
        const { container } = render(
            <CallDetails callId="" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        expect(container.innerHTML).toBe('');
    });

    it('shows loading state initially', () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        expect(screen.getByText(/Loading details/)).toBeTruthy();
    });

    it('fetches call details via API', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/platform/calls/call-123'));
    });

    it('renders caller and callee after loading', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByText('+8613800138000')).toBeTruthy();
            expect(screen.getByText('+8613900139000')).toBeTruthy();
        });
    });

    it('renders MOS quality value', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByText('Quality (MOS)')).toBeTruthy();
        });
    });

    it('renders jitter value', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByText('Jitter')).toBeTruthy();
        });
    });

    it('renders action buttons (SIP PCAP, SIP Diagram)', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByText('SIP PCAP')).toBeTruthy();
            expect(screen.getByText('SIP Diagram')).toBeTruthy();
        });
    });

    it('renders Full PCAP button', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByText('Full PCAP')).toBeTruthy();
        });
    });

    it('renders quality timeline sub-component', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByTestId('quality-timeline')).toBeTruthy();
        });
    });

    it('renders stereo player sub-component', async () => {
        render(
            <CallDetails callId="call-123" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByTestId('stereo-player')).toBeTruthy();
        });
    });

    it('shows "not found" when call data is missing', async () => {
        mockGet.mockImplementation(() => Promise.resolve({ data: null }));
        render(
            <CallDetails callId="call-missing" onOpenSipDialog={() => { }} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByText('Call details not found.')).toBeTruthy();
        });
    });

    it('renders demo mode with mock data', async () => {
        render(
            <CallDetails callId="demo-001" onOpenSipDialog={() => { }} demo={true} />,
            { wrapper: Wrapper },
        );
        await waitFor(() => {
            expect(screen.getByText('+8613800138000')).toBeTruthy();
        });
    });
});
