import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundService } from './SoundService';

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

describe('SoundService', () => {
    let mockAudioContext: any;
    let mockOscillator: any;
    let mockGainNode: any;

    beforeEach(() => {
        // Reset singleton
        (SoundService as any).instance = null;
        localStorage.clear();

        // Mock Web Audio API
        mockOscillator = {
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            frequency: {
                value: 0,
                setValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
            },
            type: '',
        };

        mockGainNode = {
            connect: vi.fn(),
            gain: {
                setValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
            },
        };

        mockAudioContext = {
            createOscillator: vi.fn(() => mockOscillator),
            createGain: vi.fn(() => mockGainNode),
            currentTime: 0,
            destination: {},
            state: 'running',
            resume: vi.fn().mockResolvedValue(undefined),
        };

        const AudioContextMock = function () { return mockAudioContext; };
        window.AudioContext = AudioContextMock as any;
        window.webkitAudioContext = AudioContextMock as any;
    });

    it('should be a singleton', () => {
        const instance1 = SoundService.getInstance();
        const instance2 = SoundService.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should default to enabled', () => {
        const service = SoundService.getInstance();
        expect(service.isEnabled()).toBe(true);
    });

    it('should persist enabled state to localStorage', () => {
        const service = SoundService.getInstance();
        service.setEnabled(false);
        expect(localStorage.getItem('cxmind_pref_sound_enabled')).toBe('false');
        expect(service.isEnabled()).toBe(false);

        service.setEnabled(true);
        expect(localStorage.getItem('cxmind_pref_sound_enabled')).toBe('true');
        expect(service.isEnabled()).toBe(true);
    });

    it('should restore enabled state from localStorage', () => {
        localStorage.setItem('cxmind_pref_sound_enabled', 'false');
        const service = SoundService.getInstance();
        expect(service.isEnabled()).toBe(false);
    });

    it('should not play when disabled', () => {
        const service = SoundService.getInstance();
        service.setEnabled(false);
        service.play('click');
        // AudioContext should not be initialized
        expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it('should support all sound types without throwing', () => {
        const service = SoundService.getInstance();
        const types = ['click', 'hover', 'success', 'error', 'toggle', 'confirm', 'alert', 'bubble'] as const;
        for (const type of types) {
            expect(() => service.play(type)).not.toThrow();
        }
    });
});
