import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptBubble } from './TranscriptBubble';

describe('TranscriptBubble', () => {
    const baseProps = {
        text: 'Hello, how can I help you today?',
        speaker: 'Agent',
        timestamp: '2025-06-15T10:30:00Z',
    };

    it('renders the transcript text', () => {
        render(<TranscriptBubble {...baseProps} />);
        expect(screen.getByText('Hello, how can I help you today?')).toBeTruthy();
    });

    it('renders the speaker name', () => {
        render(<TranscriptBubble {...baseProps} />);
        expect(screen.getByText('Agent')).toBeTruthy();
    });

    it('renders emotion emoji when provided', () => {
        render(<TranscriptBubble {...baseProps} emotion={{
            startSec: 0, endSec: 5, speaker: 'caller',
            emotion: 'happy', confidence: 0.92, source: 'text',
        }} />);
        expect(screen.getByText('😊')).toBeTruthy();
    });

    it('renders angry emoji correctly', () => {
        render(<TranscriptBubble {...baseProps} emotion={{
            startSec: 0, endSec: 5, speaker: 'caller',
            emotion: 'angry', confidence: 0.85, source: 'acoustic',
        }} />);
        expect(screen.getByText('😡')).toBeTruthy();
    });

    it('renders without emotion emoji when not provided', () => {
        render(<TranscriptBubble {...baseProps} />);
        expect(screen.queryByText('😊')).toBeNull();
        expect(screen.queryByText('😡')).toBeNull();
    });

    it('renders sad emoji', () => {
        render(<TranscriptBubble {...baseProps} emotion={{
            startSec: 0, endSec: 3, speaker: 'callee',
            emotion: 'sad', confidence: 0.78, source: 'text',
        }} />);
        expect(screen.getByText('😢')).toBeTruthy();
    });

    it('renders frustrated emoji', () => {
        render(<TranscriptBubble {...baseProps} emotion={{
            startSec: 0, endSec: 3, speaker: 'caller',
            emotion: 'frustrated', confidence: 0.65, source: 'acoustic',
        }} />);
        expect(screen.getByText('😤')).toBeTruthy();
    });

    it('renders with isRight=true alignment', () => {
        const { container } = render(<TranscriptBubble {...baseProps} isRight />);
        const outer = container.firstChild as HTMLElement;
        expect(outer.style.justifyContent).toBe('flex-end');
    });

    it('renders with isRight=false alignment', () => {
        const { container } = render(<TranscriptBubble {...baseProps} />);
        const outer = container.firstChild as HTMLElement;
        expect(outer.style.justifyContent).toBe('flex-start');
    });
});
