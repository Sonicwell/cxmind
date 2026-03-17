import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MotionButton } from './MotionButton';
import { SoundService } from '../../services/audio/SoundService';

// Mock SoundService
vi.mock('../../services/audio/SoundService', () => {
    return {
        SoundService: {
            getInstance: vi.fn().mockReturnValue({
                play: vi.fn(),
            }),
        },
    };
});

describe('MotionButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render children correctly', () => {
        render(<MotionButton>Click Me</MotionButton>);
        expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('should play click sound when clicked', () => {
        const soundService = SoundService.getInstance();
        render(<MotionButton>Click Me</MotionButton>);

        fireEvent.click(screen.getByText('Click Me'));

        expect(soundService.play).toHaveBeenCalledWith('click');
    });

    it('should call onClick prop when clicked', () => {
        const handleClick = vi.fn();
        render(<MotionButton onClick={handleClick}>Click Me</MotionButton>);

        fireEvent.click(screen.getByText('Click Me'));

        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should play hover sound on mouse enter', () => {
        const soundService = SoundService.getInstance();
        render(<MotionButton>Hover Me</MotionButton>);

        fireEvent.mouseEnter(screen.getByText('Hover Me'));

        expect(soundService.play).toHaveBeenCalledWith('hover');
    });
});
