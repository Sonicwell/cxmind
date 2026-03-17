import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MotionIconButton } from './MotionIconButton';

describe('MotionIconButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render children correctly', () => {
        render(<MotionIconButton>✏️</MotionIconButton>);
        expect(screen.getByText('✏️')).toBeInTheDocument();
    });

    it('should call onClick when clicked', () => {
        const handler = vi.fn();
        render(<MotionIconButton onClick={handler}>✕</MotionIconButton>);
        fireEvent.click(screen.getByText('✕'));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should render tooltip as title attribute', () => {
        render(<MotionIconButton tooltip="Close panel">✕</MotionIconButton>);
        expect(screen.getByTitle('Close panel')).toBeInTheDocument();
    });

    it('should apply variant class', () => {
        const { container } = render(<MotionIconButton variant="glass">X</MotionIconButton>);
        expect(container.querySelector('.motion-icon-btn-glass')).toBeInTheDocument();
    });
});
