import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AcousticEmotionTrack } from './AcousticEmotionTrack';

const baseSegments = [
    { speaker: 'caller', emotion: 'happy', confidence: 0.9, startSec: 0, endSec: 10 },
    { speaker: 'caller', emotion: 'neutral', confidence: 0.7, startSec: 10, endSec: 20 },
    { speaker: 'callee', emotion: 'angry', confidence: 0.8, startSec: 5, endSec: 15 },
];

describe('AcousticEmotionTrack', () => {
    it('returns null when no segments', () => {
        const { container } = render(<AcousticEmotionTrack segments={[]} durationSec={60} />);
        expect(container.innerHTML).toBe('');
    });

    it('returns null when durationSec is 0', () => {
        const { container } = render(<AcousticEmotionTrack segments={baseSegments} durationSec={0} />);
        expect(container.innerHTML).toBe('');
    });

    it('renders "Acoustic Emotion" header', () => {
        render(<AcousticEmotionTrack segments={baseSegments} durationSec={60} />);
        expect(screen.getByText('Acoustic Emotion')).toBeTruthy();
    });

    it('renders Caller and Callee track labels', () => {
        render(<AcousticEmotionTrack segments={baseSegments} durationSec={60} />);
        expect(screen.getByText('Caller')).toBeTruthy();
        expect(screen.getByText('Callee')).toBeTruthy();
    });

    it('renders segment title attributes with emotion info', () => {
        const { container } = render(<AcousticEmotionTrack segments={baseSegments} durationSec={60} />);
        const segments = container.querySelectorAll('[title]');
        // At least 3 segments with title attributes
        expect(segments.length).toBeGreaterThanOrEqual(3);
    });

    it('calls onSegmentClick when a segment is clicked', () => {
        const onClick = vi.fn();
        const { container } = render(
            <AcousticEmotionTrack segments={baseSegments} durationSec={60} onSegmentClick={onClick} />
        );
        const segments = container.querySelectorAll('[title]');
        if (segments.length > 0) {
            fireEvent.click(segments[0]);
            expect(onClick).toHaveBeenCalled();
        }
    });
});
