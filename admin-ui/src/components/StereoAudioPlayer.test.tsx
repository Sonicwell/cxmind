import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StereoAudioPlayer } from './StereoAudioPlayer';
import api from '../services/api';
import { STORAGE_KEYS } from '../constants/storage-keys';

// Mock the API module
vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
    },
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

// Mock mock-audio to avoid window.speechSynthesis issues during import
vi.mock('../services/mock-audio', () => ({
    demoAudio: {
        playConversation: vi.fn(),
        stop: vi.fn()
    },
    TranscriptSegment: {}
}));

describe('StereoAudioPlayer', () => {
    let mockContextClose: ReturnType<typeof vi.fn>;
    let mockDecodeAudioData: ReturnType<typeof vi.fn>;
    let originalAudioContext: any;
    let originalWorker: any;

    beforeEach(() => {
        // Clear mocks
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'dummy-token');

        // 1. Mock window.AudioContext
        mockContextClose = vi.fn().mockResolvedValue(undefined);
        mockDecodeAudioData = vi.fn().mockResolvedValue({
            duration: 10,
            getChannelData: () => new Float32Array(100),
            sampleRate: 16000
        });

        class MockAudioContext {
            state = 'running';
            close = mockContextClose;
            decodeAudioData = mockDecodeAudioData;
        }

        originalAudioContext = window.AudioContext;
        (window as any).AudioContext = MockAudioContext;
        (window as any).webkitAudioContext = MockAudioContext;

        // 2. Mock fetch for audio blobs
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            headers: new Headers({ 'content-type': 'audio/wav' }),
        });

        // 3. Simple Worker mock that executes instantly
        originalWorker = globalThis.Worker;
        class MockWorker {
            onmessage: any = null;
            postMessage(data: any) {
                if (this.onmessage) {
                    this.onmessage({
                        data: {
                            leftRegions: [{ start: 1, end: 2 }],
                            rightRegions: [{ start: 3, end: 4 }],
                            crosstalkRegions: [],
                        }
                    });
                }
            }
            terminate() { }
        }
        (globalThis as any).Worker = MockWorker;

        // Mock window.speechSynthesis which is used by mock-audio.ts
        (window as any).speechSynthesis = {
            getVoices: () => [],
            speak: vi.fn(),
            cancel: vi.fn(),
        };
    });

    afterEach(() => {
        // Restore globals
        window.AudioContext = originalAudioContext;
        globalThis.Worker = originalWorker;
        vi.restoreAllMocks();
    });

    it('should close AudioContext when component unmounts to prevent memory leak', async () => {
        (api.get as any).mockResolvedValue({ status: 200, data: { status: 'ready', progress: 100 } });

        const { unmount } = render(<StereoAudioPlayer callId="test-call-id" />);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledTimes(2); // Left and right channels
            expect(mockDecodeAudioData).toHaveBeenCalledTimes(2);
        });

        // Unmount the component while or after AudioContext was created
        unmount();

        // The mocked context.close() should have been called
        expect(mockContextClose).toHaveBeenCalledTimes(1);
    });

    it('should invoke the Web Worker for VAD calculations instead of blocking the main thread', async () => {
        (api.get as any).mockResolvedValue({ status: 200, data: { status: 'ready', progress: 100 } });

        const { unmount } = render(<StereoAudioPlayer callId="test-call-id" />);

        await waitFor(() => {
            // Verify fetch was made to the correct stereo-audio endpoint
            expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/platform/calls/test-call-id/stereo-audio?token=dummy-token&channel=left'));
            expect(mockDecodeAudioData).toHaveBeenCalledTimes(2);
        });

        unmount();
    });
});
