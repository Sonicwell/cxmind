import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        patch: (...args: any[]) => mockPatch(...args),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../components/ui/ConfirmModal', () => ({
    ConfirmModal: ({ open, onConfirm, onClose, title }: any) =>
        open ? <div data-testid="confirm-modal"><span>{title}</span><button onClick={onConfirm}>confirm</button><button onClick={onClose}>cancel</button></div> : null,
}));

const mockOmnichannel = {
    bot: { enabled: true, maxBotTurns: 10, confidenceThreshold: 0.6, systemPrompt: 'You are AI', fallbackMessage: 'fallback', handoffKeywords: ['agent', '转人工'] },
    whatsapp: { enabled: false },
    line: { enabled: false },
    kakao: { enabled: false },
    wechat: { enabled: false },
    emailAdapters: [],
};

import OmnichannelConfig from './OmnichannelConfig';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('OmnichannelConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { data: { omnichannel: mockOmnichannel } } });
        mockPatch.mockResolvedValue({ data: { success: true } });
    });

    it('fetches settings on mount', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/platform/settings'));
    });

    it('renders page title', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Omnichannel & Bot Configuration')).toBeTruthy());
    });

    it('renders bot section header', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Omnichannel Bot (RAG + LLM)')).toBeTruthy());
    });

    it('renders bot parameters when enabled', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Max Bot Turns')).toBeTruthy();
            expect(screen.getByText('Confidence Threshold')).toBeTruthy();
            expect(screen.getByText('System Prompt')).toBeTruthy();
            expect(screen.getByText('Fallback Message')).toBeTruthy();
            expect(screen.getByText('Handoff Keywords')).toBeTruthy();
        });
    });

    it('renders handoff keyword tags', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('agent')).toBeTruthy();
            expect(screen.getByText('转人工')).toBeTruthy();
        });
    });

    it('renders omnichannel adapters section', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Omnichannel Adapters')).toBeTruthy();
        });
    });

    it('renders all 6 channel rows', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('WhatsApp Cloud API')).toBeTruthy();
            expect(screen.getByText('LINE Messaging API')).toBeTruthy();
            expect(screen.getAllByText(/KakaoTalk/).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('WeChat Official')).toBeTruthy();
            expect(screen.getByText(/Email Adapters/)).toBeTruthy();
            expect(screen.getByText('WebChat (Built-in)')).toBeTruthy();
        });
    });

    it('renders channels configured count', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/channels configured/)).toBeTruthy();
        });
    });

    it('calls save API for bot config', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Config')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Config'));
        await waitFor(() => {
            expect(mockPatch).toHaveBeenCalledWith('/platform/settings', expect.objectContaining({
                omnichannel: expect.objectContaining({ bot: expect.any(Object) }),
            }));
        });
    });

    it('shows success message after save', async () => {
        render(<OmnichannelConfig />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Save Config')).toBeTruthy());
        fireEvent.click(screen.getByText('Save Config'));
        await waitFor(() => {
            expect(screen.getByText(/saved successfully/i)).toBeTruthy();
        });
    });
});
