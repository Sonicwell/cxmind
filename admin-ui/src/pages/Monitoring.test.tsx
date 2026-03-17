import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { Monitoring } from './Monitoring';

// ── Mock Data ─────────────────────────────────────────────
const mockActiveCalls = [
    {
        call_id: 'call-001',
        caller_uri: 'sip:1001@pbx.local',
        callee_uri: 'sip:2001@sip.remote',
        caller_name: 'Alice',
        callee_name: 'Bob',
        start_time: new Date().toISOString(),
        status: 'in-progress',
    },
    {
        call_id: 'call-002',
        caller_uri: 'sip:1002@pbx.local',
        callee_uri: 'sip:2002@sip.remote',
        caller_name: 'Charlie',
        callee_name: 'Dave',
        start_time: new Date().toISOString(),
        status: 'in-progress',
    },
];

// ── Mocks ─────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ isDemoMode: false, demoMode: false }),
}));

const mockSubscribe = vi.fn(() => vi.fn()); // returns unsubscribe fn
const mockSend = vi.fn();

vi.mock('../context/WebSocketContext', () => ({
    useWebSocket: () => ({
        connected: true,
        send: mockSend,
        subscribe: mockSubscribe,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        unsubscribe: vi.fn(),
    }),
}));

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockImplementation((url: string) => {
            if (url.includes('active-calls')) {
                return Promise.resolve({ data: { calls: mockActiveCalls } });
            }
            if (url.includes('transcriptions')) {
                return Promise.resolve({ data: { transcriptions: [] } });
            }
            return Promise.resolve({ data: {} });
        }),
        post: vi.fn().mockResolvedValue({ data: {} }),
    },
}));

vi.mock('../services/mock-data', () => ({
    getMockCalls: () => Promise.resolve({ data: { calls: [] } }),
}));

vi.mock('../components/AudioPlayer', () => ({
    AudioPlayer: vi.fn().mockImplementation(() => ({
        play: vi.fn(),
        stop: vi.fn(),
        isPaused: () => false,
        playAudioFrame: vi.fn(),
        startNewSegment: vi.fn(),
    })),
}));

vi.mock('../components/StereoMonitoringPlayer', () => ({
    StereoMonitoringPlayer: ({ callId }: any) => (
        <div data-testid={`stereo-player-${callId}`}>Stereo Player</div>
    ),
}));

vi.mock('../components/monitoring/EmotionCurve', () => ({
    EmotionCurve: ({ callId }: any) => <div data-testid={`emotion-curve-${callId}`} />,
}));

vi.mock('../components/monitoring/ContextBriefCard', () => ({
    ContextBriefCard: ({ callId }: any) => <div data-testid={`context-brief-${callId}`} />,
}));

// ── Tests ─────────────────────────────────────────────────

describe('Monitoring Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders page with monitoring-page class', async () => {
        await act(async () => { render(<Monitoring />); });
        const page = document.querySelector('.monitoring-page');
        expect(page).toBeTruthy();
    });

    it('renders page title after loading', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            expect(screen.getByText('Real-time Monitoring')).toBeTruthy();
        });
    });

    it('renders active calls section with count', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            expect(screen.getByText(/Active Calls/)).toBeTruthy();
            expect(screen.getByText(/\(2\)/)).toBeTruthy();
        });
    });

    it('displays caller and callee names', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeTruthy();
            expect(screen.getByText('Bob')).toBeTruthy();
            expect(screen.getByText('Charlie')).toBeTruthy();
            expect(screen.getByText('Dave')).toBeTruthy();
        });
    });

    it('displays caller and callee numbers (extracted from URIs)', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            expect(screen.getByText('1001')).toBeTruthy();
            expect(screen.getByText('2001')).toBeTruthy();
        });
    });

    it('renders Monitor button for each call', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            const monitorBtns = screen.getAllByText(/🎧.*Monitor$/);
            expect(monitorBtns.length).toBe(2);
        });
    });

    it('renders View button for each call', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            const viewBtns = screen.getAllByText(/👁️.*View$/);
            expect(viewBtns.length).toBe(2);
        });
    });

    it('subscribes to WebSocket events on mount', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            expect(screen.getByText('Real-time Monitoring')).toBeTruthy();
        });

        // 应该订阅 7 个事件
        expect(mockSubscribe).toHaveBeenCalledWith('monitor:audio', expect.any(Function));
        expect(mockSubscribe).toHaveBeenCalledWith('call:transcription', expect.any(Function));
        expect(mockSubscribe).toHaveBeenCalledWith('monitor:started', expect.any(Function));
        expect(mockSubscribe).toHaveBeenCalledWith('monitor:stopped', expect.any(Function));
        expect(mockSubscribe).toHaveBeenCalledWith('monitor:error', expect.any(Function));
        expect(mockSubscribe).toHaveBeenCalledWith('call:quality', expect.any(Function));
        expect(mockSubscribe).toHaveBeenCalledWith('monitor:active_calls', expect.any(Function));
    });

    it('sends WebSocket join when clicking View button', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeTruthy();
        });

        const viewBtns = screen.getAllByText(/👁️.*View$/);
        fireEvent.click(viewBtns[0]);

        await waitFor(() => {
            expect(mockSend).toHaveBeenCalledWith({
                type: 'join',
                callId: 'call-001',
            });
        });
    });

    it('renders Caller/Callee labels', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            const callerLabels = screen.getAllByText('Caller:');
            const calleeLabels = screen.getAllByText('Callee:');
            expect(callerLabels.length).toBe(2);
            expect(calleeLabels.length).toBe(2);
        });
    });

    it('renders arrow separators between parties', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            const arrows = screen.getAllByText('→');
            expect(arrows.length).toBe(2);
        });
    });

    it('renders call cards with call-card class', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            const cards = document.querySelectorAll('.call-card');
            expect(cards.length).toBe(2);
        });
    });

    it('renders call-actions section for each call', async () => {
        render(<Monitoring />);
        await waitFor(() => {
            const actionSections = document.querySelectorAll('.call-actions');
            expect(actionSections.length).toBe(2);
        });
    });
});
