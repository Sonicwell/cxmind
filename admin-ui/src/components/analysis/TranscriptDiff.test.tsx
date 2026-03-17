import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptDiff } from './TranscriptDiff';

describe('TranscriptDiff', () => {
    it('shows warning when no realtime transcripts', () => {
        render(<TranscriptDiff realtimeTexts={[]} postCallTexts={[{ text: 'hello', speaker: 'caller', timestamp: '0' }]} />);
        expect(screen.getByText('Need both realtime and post-call transcripts to show diff')).toBeTruthy();
    });

    it('shows warning when no post-call transcripts', () => {
        render(<TranscriptDiff realtimeTexts={[{ text: 'hello', speaker: 'caller', timestamp: '0' }]} postCallTexts={[]} />);
        expect(screen.getByText('Need both realtime and post-call transcripts to show diff')).toBeTruthy();
    });

    it('renders diff stats when both transcripts exist', () => {
        render(<TranscriptDiff
            realtimeTexts={[{ text: 'hello world', speaker: 'caller', timestamp: '0' }]}
            postCallTexts={[{ text: 'hello there world', speaker: 'caller', timestamp: '0' }]}
        />);
        // 组件使用 i18n fallback: "实时准确率: N%" 格式
        expect(screen.getByText(/实时准确率/)).toBeTruthy();
    });

    it('renders equal text segments', () => {
        render(<TranscriptDiff
            realtimeTexts={[{ text: 'same text here', speaker: 'caller', timestamp: '0' }]}
            postCallTexts={[{ text: 'same text here', speaker: 'caller', timestamp: '0' }]}
        />);
        // tokenizer 按词拆分后拼接不保留空格: "same text here" → "sametexthere"
        expect(screen.getByText(/sametexthere/)).toBeTruthy();
    });

    it('renders warning emoji', () => {
        render(<TranscriptDiff realtimeTexts={[]} postCallTexts={[]} />);
        expect(screen.getByText('⚠️')).toBeTruthy();
    });
});
