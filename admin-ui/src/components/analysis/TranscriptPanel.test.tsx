import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TranscriptPanel from './TranscriptPanel';

import api from '../../services/api';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, d?: string | Record<string, unknown>) => (typeof d === 'string' ? d : k),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../services/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('./TranscriptBubble', () => ({
    TranscriptBubble: ({ text, speaker }: any) => <div data-testid="bubble">{speaker}: {text}</div>,
}));

vi.mock('./TranscriptDiff', () => ({
    TranscriptDiff: () => <div data-testid="transcript-diff">Diff View</div>,
}));

vi.mock('../ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
}));

vi.mock('../ui/button', () => ({
    Button: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
}));

vi.mock('../ui/ConfirmModal', () => ({
    ConfirmModal: () => null,
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../constants/storage-keys', () => ({
    STORAGE_KEYS: { SOP_CART: 'sop_cart' },
}));

vi.mock('../../context/WebSocketContext', () => ({
    useWebSocket: () => ({ subscribe: vi.fn(() => vi.fn()) }),
}));

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

const baseProps = {
    callId: 'test-call-123',
    realtimeTranscripts: [
        { timestamp: '00:01', text: 'Hello there', speaker: 'caller' },
        { timestamp: '00:05', text: 'Hi how are you', speaker: 'callee' },
    ],
};

describe('TranscriptPanel', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders tab buttons (Realtime, Post-Call, Diff)', () => {
        render(<TranscriptPanel {...baseProps} />, { wrapper: Wrapper });
        expect(screen.getByText('transcript.tabRealtime')).toBeInTheDocument();
        expect(screen.getByText('transcript.tabPostCall')).toBeInTheDocument();
        expect(screen.getByText('transcript.tabDiff')).toBeInTheDocument();
    });

    it('renders realtime transcript bubbles by default', () => {
        render(<TranscriptPanel {...baseProps} />, { wrapper: Wrapper });
        const bubbles = screen.getAllByTestId('bubble');
        expect(bubbles.length).toBe(2);
        expect(screen.getByText(/Hello there/)).toBeTruthy();
    });

    it('shows "No transcript available" when empty realtime', () => {
        render(<TranscriptPanel {...baseProps} realtimeTranscripts={[]} />, { wrapper: Wrapper });
        expect(screen.getByText('transcript.noTranscript')).toBeTruthy();
    });

    it('switches to Post-Call tab on click', async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ data: { transcriptions: [] } });
        render(<TranscriptPanel {...baseProps} />, { wrapper: Wrapper });
        fireEvent.click(screen.getByText('transcript.tabPostCall'));
        await screen.findByText(/transcript.generateNow/);
        expect(screen.getByText(/transcript.generateNow/)).toBeTruthy();
    });

    it('switches to Diff tab on click', async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ data: { transcriptions: [] } });
        render(<TranscriptPanel {...baseProps} />, { wrapper: Wrapper });
        fireEvent.click(screen.getByText('transcript.tabDiff'));
        await screen.findByTestId('transcript-diff');
        expect(screen.getByTestId('transcript-diff')).toBeTruthy();
    });

    it('shows "No post-call ASR data available" on post-call tab', async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ data: { transcriptions: [] } });
        render(<TranscriptPanel {...baseProps} />, { wrapper: Wrapper });
        fireEvent.click(screen.getByText('transcript.tabPostCall'));
        await screen.findByText('transcript.noPostCallData');
        expect(screen.getByText('transcript.noPostCallData')).toBeTruthy();
    });
});

