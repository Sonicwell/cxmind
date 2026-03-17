import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmotionTrack } from './EmotionTrack';
import type { EmotionSegmentData } from './TranscriptBubble';

describe('EmotionTrack', () => {
    const segments: EmotionSegmentData[] = [
        { startSec: 0, endSec: 10, speaker: 'caller', emotion: 'happy', confidence: 0.9, source: 'text' },
        { startSec: 10, endSec: 20, speaker: 'caller', emotion: 'angry', confidence: 0.8, source: 'acoustic' },
        { startSec: 5, endSec: 15, speaker: 'callee', emotion: 'neutral', confidence: 0.7, source: 'text' },
        { startSec: 15, endSec: 25, speaker: 'callee', emotion: 'sad', confidence: 0.6, source: 'text' },
    ];

    it('renders null when no segments', () => {
        const { container } = render(<EmotionTrack emotionSegments={[]} durationSec={60} />);
        expect(container.innerHTML).toBe('');
    });

    it('renders null when durationSec is 0', () => {
        const { container } = render(<EmotionTrack emotionSegments={segments} durationSec={0} />);
        expect(container.innerHTML).toBe('');
    });

    it('renders Caller and Callee labels', () => {
        render(<EmotionTrack emotionSegments={segments} durationSec={30} />);
        expect(screen.getByText('Caller')).toBeTruthy();
        expect(screen.getByText('Callee')).toBeTruthy();
    });

    it('renders emotion emojis for caller segments', () => {
        render(<EmotionTrack emotionSegments={segments} durationSec={30} />);
        expect(screen.getByText('😊')).toBeTruthy(); // happy
        expect(screen.getByText('😡')).toBeTruthy(); // angry
    });

    it('renders emotion emojis for callee segments', () => {
        render(<EmotionTrack emotionSegments={segments} durationSec={30} />);
        expect(screen.getByText('😐')).toBeTruthy(); // neutral
        expect(screen.getByText('😢')).toBeTruthy(); // sad
    });

    it('renders segment titles with confidence and time', () => {
        render(<EmotionTrack emotionSegments={segments} durationSec={30} />);
        expect(screen.getByTitle('happy (90%) at 0.0s')).toBeTruthy();
        expect(screen.getByTitle('angry (80%) at 10.0s')).toBeTruthy();
    });

    it('renders two tracks (caller + callee)', () => {
        const { container } = render(<EmotionTrack emotionSegments={segments} durationSec={30} />);
        // Each track has a span label + relative container, outer div has 2 children
        const tracks = container.querySelectorAll('[style*="position: relative"]');
        expect(tracks.length).toBe(2);
    });
});
