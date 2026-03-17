import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleSwitch } from './ToggleSwitch';
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

describe('ToggleSwitch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render in unchecked state', () => {
        render(<ToggleSwitch checked={false} onCheckedChange={vi.fn()} />);
        const switchEl = screen.getByRole('switch');
        expect(switchEl).toBeInTheDocument();
        expect(switchEl).toHaveAttribute('aria-checked', 'false');
    });

    it('should render in checked state', () => {
        render(<ToggleSwitch checked={true} onCheckedChange={vi.fn()} />);
        const switchEl = screen.getByRole('switch');
        expect(switchEl).toHaveAttribute('aria-checked', 'true');
    });

    it('should call onCheckedChange when clicked', () => {
        const handleChange = vi.fn();
        render(<ToggleSwitch checked={false} onCheckedChange={handleChange} />);

        fireEvent.click(screen.getByRole('switch'));

        expect(handleChange).toHaveBeenCalledWith(true);
    });

    it('should render label when provided', () => {
        render(<ToggleSwitch checked={false} onCheckedChange={vi.fn()} label="Dark Mode" />);
        expect(screen.getByText('Dark Mode')).toBeInTheDocument();
    });

    it('should play toggle sound when clicked', () => {
        const soundService = SoundService.getInstance();
        render(<ToggleSwitch checked={false} onCheckedChange={vi.fn()} />);

        fireEvent.click(screen.getByRole('switch'));

        expect(soundService.play).toHaveBeenCalledWith('toggle');
    });

    it('should not play sound when soundEnabled is false', () => {
        const soundService = SoundService.getInstance();
        render(<ToggleSwitch checked={false} onCheckedChange={vi.fn()} soundEnabled={false} />);

        fireEvent.click(screen.getByRole('switch'));

        expect(soundService.play).not.toHaveBeenCalled();
    });
});
