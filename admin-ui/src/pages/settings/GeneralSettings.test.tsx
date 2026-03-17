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

vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: { email: 'admin@test.com', displayName: 'Admin', role: 'platform_admin' } }),
}));

const mockSettings = {
    pcapPolicy: 'optional',
    asrPolicy: 'enforced',
    summaryPolicy: 'disabled',
    assistantPolicy: 'optional',
    piiSanitizationPolicy: 'regex',
    avatarVendor: { provider: 'none' },
};

import GeneralSettings from './GeneralSettings';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('GeneralSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { data: mockSettings } });
        mockPut.mockResolvedValue({ data: { success: true } });
    });

    // ── Data Fetching ─────────────────────────────────────

    it('fetches settings on mount', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(mockGet).toHaveBeenCalledWith('/platform/settings');
        });
    });

    it('renders page title after loading', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('General Settings')).toBeTruthy();
        });
    });

    // ── Policy Selectors ──────────────────────────────────

    it('renders 4 policy sections', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Call Packet (PCAP) Recording')).toBeTruthy();
            expect(screen.getByText('Real-time Transcription (ASR)')).toBeTruthy();
            expect(screen.getByText('Post-call Intelligence & Summary')).toBeTruthy();
            expect(screen.getByText('Agent AI Assistant (Copilot)')).toBeTruthy();
        });
    });

    it('renders 3 options per policy (Disabled/Optional/Enforced)', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => {
            const buttons = screen.getAllByText('Disabled');
            expect(buttons.length).toBe(4); // 4 policy sections × each has Disabled option
        });
    });

    // ── PII Sanitization ─────────────────────────────────

    it('renders PII sanitization options', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('PII Sanitization & Masking')).toBeTruthy();
            expect(screen.getByText('Standard Regex (Basic)')).toBeTruthy();
            expect(screen.getByText('AI NER (Advanced)')).toBeTruthy();
        });
    });

    // ── Avatar Provider ──────────────────────────────────

    it('renders avatar provider options', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Global Avatar Provider')).toBeTruthy();
            expect(screen.getByText('None')).toBeTruthy();
            expect(screen.getByText('Gravatar')).toBeTruthy();
            expect(screen.getByText('UI Avatars')).toBeTruthy();
            expect(screen.getByText('Custom Endpoint')).toBeTruthy();
        });
    });

    // ── Save ─────────────────────────────────────────────

    it('shows save button and calls API on click', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy());

        fireEvent.click(screen.getByText('Save Changes'));
        await waitFor(() => {
            expect(mockPut).toHaveBeenCalledWith('/platform/settings', expect.objectContaining({
                pcapPolicy: 'optional',
                asrPolicy: 'enforced',
            }));
        });
    });

    it('shows success message after save', async () => {
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Changes'));
        await waitFor(() => {
            expect(screen.getByText(/saved successfully/i)).toBeTruthy();
        });
    });

    // ── Error Handling ───────────────────────────────────

    it('shows error message if fetch fails', async () => {
        mockGet.mockRejectedValueOnce(new Error('Network error'));
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/Failed to load/i)).toBeTruthy();
        });
    });

    it('shows error message if save fails', async () => {
        mockPut.mockRejectedValueOnce(new Error('Server error'));
        render(<GeneralSettings />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Changes'));
        await waitFor(() => {
            expect(screen.getByText(/Failed to save/i)).toBeTruthy();
        });
    });
});
