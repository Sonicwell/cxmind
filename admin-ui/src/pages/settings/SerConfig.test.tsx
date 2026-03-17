import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────

const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('../../services/api', () => ({
    default: { get: (...args: any[]) => mockGet(...args), put: (...args: any[]) => mockPut(...args) },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

const mockSerConfig = {
    enabled: true,
    realtimeEnabled: true,
    postCallEnabled: false,
    maxConcurrent: 4,
    cpuThreshold: 80,
    fusionWeight: 0.5,
    minDuration: 3,
    confidenceThreshold: 0.6,
    silenceThreshold: 0.03,
    scheduleEnabled: false,
    scheduleStart: '09:00',
    scheduleEnd: '18:00',
};

import SerConfig from './SerConfig';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('SerConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: mockSerConfig });
        mockPut.mockResolvedValue({ data: { success: true } });
    });

    // ── Data Fetching ─────────────────────────────────────

    it('fetches SER config on mount', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(mockGet).toHaveBeenCalledWith('/speech-emotion/config');
        });
    });

    // ── Page Structure ────────────────────────────────────

    it('renders page title', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Speech Emotion Recognition')).toBeTruthy();
        });
    });

    // ── Mode Switches ────────────────────────────────────

    it('renders realtime and post call switches', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Realtime')).toBeTruthy();
            expect(screen.getByText('Post Call')).toBeTruthy();
        });
    });

    // ── Backward Compatibility ───────────────────────────

    it('migrates legacy mode field to independent switches', async () => {
        mockGet.mockResolvedValueOnce({ data: { enabled: true, mode: 'auto', maxConcurrent: 2 } });
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Active')).toBeTruthy());

        fireEvent.click(screen.getByText('Save Configuration'));
        await waitFor(() => {
            expect(mockPut).toHaveBeenCalledWith('/speech-emotion/config', expect.objectContaining({
                realtimeEnabled: true,
                postCallEnabled: true,
            }));
        });
    });

    // ── Parameter Controls ───────────────────────────────

    it('renders max concurrent slider', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Max Concurrent Streams')).toBeTruthy();
        });
    });

    it('renders fusion weight slider', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Acoustic / Lexical Fusion Weight')).toBeTruthy();
        });
    });

    it('renders confidence threshold slider', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Confidence Acceptance Threshold')).toBeTruthy();
        });
    });

    it('renders VAD silence threshold slider', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('VAD Silence Threshold')).toBeTruthy();
        });
    });

    it('renders minimum audio duration control', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Minimum Audio Duration (s)')).toBeTruthy();
        });
    });

    // ── Schedule ─────────────────────────────────────────

    it('renders schedule toggle', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Limit Processing to specific hours')).toBeTruthy();
        });
    });

    // ── Save ─────────────────────────────────────────────

    it('calls save API on save button click', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Active')).toBeTruthy());

        fireEvent.click(screen.getByText('Save Configuration'));
        await waitFor(() => {
            expect(mockPut).toHaveBeenCalledWith('/speech-emotion/config', expect.objectContaining({
                enabled: true,
                realtimeEnabled: true,
                postCallEnabled: false,
            }));
        });
    });

    it('shows success message after save', async () => {
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Configuration')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Configuration'));
        await waitFor(() => {
            expect(screen.getByText(/SER configuration saved/i)).toBeTruthy();
        });
    });

    it('shows error message if save fails', async () => {
        mockPut.mockRejectedValueOnce(new Error('fail'));
        render(<SerConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Configuration')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Configuration'));
        await waitFor(() => {
            expect(screen.getByText(/Failed to save/i)).toBeTruthy();
        });
    });
});
