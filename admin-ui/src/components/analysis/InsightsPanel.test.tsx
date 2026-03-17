import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InsightsPanel from './InsightsPanel';

vi.mock('../../services/api', () => ({
    default: {
        post: vi.fn(),
    },
}));

vi.mock('../ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, disabled, ...props }: any) => (
        <button onClick={onClick} disabled={disabled}>{children}</button>
    ),
}));

import api from '../../services/api';
const mockApi = vi.mocked(api);

const fullInsights = {
    callId: 'c1', analyzedAt: '2025-01-01',
    callerTalkRatio: 0.4, calleeTalkRatio: 0.45, silenceRatio: 0.15,
    overlapRatio: 0.05, silenceEvents: [], longestSilenceSec: 3,
    interruptionCount: 2, interruptions: [],
    callerWPM: 120, calleeWPM: 95,
    callerSentiment: 'positive', calleeSentiment: 'neutral',
    agentScore: 92,
    scoreBreakdown: { talkBalance: 22, responsiveness: 23, noInterruption: 24, paceControl: 23 },
};

describe('InsightsPanel', () => {
    const onInsightsLoaded = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders "Run Analysis" button when no insights', () => {
        render(<InsightsPanel callId="call1" insights={null} onInsightsLoaded={onInsightsLoaded} />);
        // Button contains icon + text — use a flexible matcher
        const btn = screen.getByRole('button');
        expect(btn.textContent).toContain('Run Analysis');
    });

    it('renders "No analysis data yet" when no insights', () => {
        render(<InsightsPanel callId="call1" insights={null} onInsightsLoaded={onInsightsLoaded} />);
        expect(screen.getByText('No analysis data yet')).toBeTruthy();
    });

    it('calls API on analyze click', async () => {
        mockApi.post.mockResolvedValue({ data: { insights: fullInsights } } as any);

        render(<InsightsPanel callId="call1" insights={null} onInsightsLoaded={onInsightsLoaded} />);
        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
            expect(mockApi.post).toHaveBeenCalledWith('/platform/calls/call1/insights');
        });
    });

    it('renders agent score when insights available', () => {
        render(<InsightsPanel callId="c1" insights={fullInsights as any} onInsightsLoaded={onInsightsLoaded} />);
        // Score is inside ScoreRing as text
        expect(screen.getByText('Agent Score')).toBeTruthy();
    });

    it('renders score breakdown items', () => {
        render(<InsightsPanel callId="c1" insights={fullInsights as any} onInsightsLoaded={onInsightsLoaded} />);
        expect(screen.getByText('Talk Balance')).toBeTruthy();
        expect(screen.getByText('Responsiveness')).toBeTruthy();
        expect(screen.getByText('No Interruption')).toBeTruthy();
        expect(screen.getByText('Pace Control')).toBeTruthy();
    });

    it('renders talk distribution section', () => {
        render(<InsightsPanel callId="c1" insights={fullInsights as any} onInsightsLoaded={onInsightsLoaded} />);
        expect(screen.getByText('Talk Distribution')).toBeTruthy();
    });

    it('renders speech pace and sentiment section', () => {
        render(<InsightsPanel callId="c1" insights={fullInsights as any} onInsightsLoaded={onInsightsLoaded} />);
        expect(screen.getByText('Speech Pace & Sentiment')).toBeTruthy();
    });

    it('renders re-analyze button when insights exist', () => {
        render(<InsightsPanel callId="c1" insights={fullInsights as any} onInsightsLoaded={onInsightsLoaded} />);
        const buttons = screen.getAllByRole('button');
        const reAnalyze = buttons.find(b => b.textContent?.includes('Re-analyze'));
        expect(reAnalyze).toBeTruthy();
    });

    it('renders noPcap hint when hasFullPcap=false and no insights', () => {
        render(<InsightsPanel callId="call1" insights={null} onInsightsLoaded={onInsightsLoaded} hasFullPcap={false} />);
        expect(screen.getByText('PCAP recording not enabled for this call')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
