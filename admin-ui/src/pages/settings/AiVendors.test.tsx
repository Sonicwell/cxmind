import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        put: (...args: any[]) => mockPut(...args),
        patch: (...args: any[]) => mockPatch(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, options?: any) => {
            if (options && typeof options === 'object') return options.defaultValue || k;
            return options || k;
        }
    }),
}));

vi.mock('../../components/ui/ConfirmModal', () => ({
    ConfirmModal: ({ open, onConfirm, onClose, title }: any) =>
        open ? <div data-testid="confirm-modal"><span>{title}</span><button onClick={onConfirm}>confirm</button><button onClick={onClose}>cancel</button></div> : null,
}));

const mockVendors = [
    { id: 'v1', provider: 'dashscope', name: 'Prod DashScope', isBuiltIn: false, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
    { id: 'v2', provider: 'funasr', name: 'Local FunASR', isBuiltIn: true, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
];

const mockLlmVendors = [
    { id: 'l1', provider: 'openai', name: 'GPT-4o', model: 'gpt-4o-mini', isBuiltIn: false, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
];

import AiVendors from './AiVendors';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('AiVendors', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockImplementation((url: string) => {
            if (url.includes('asr-vendors')) return Promise.resolve({ data: { success: true, data: { vendors: mockVendors, activeIds: ['v1'] } } });
            if (url.includes('llm-vendors')) return Promise.resolve({ data: { success: true, data: { vendors: mockLlmVendors, primaryId: 'l1', secondaryId: '', serviceMapping: {} } } });
            if (url.includes('post-call-asr/config')) return Promise.resolve({ data: { data: { enabled: false, vendorId: '', maxConcurrent: 3 } } });
            if (url.includes('post-call-asr/status')) return Promise.resolve({ data: { data: { queue: { processing: 0, pending: 0 } } } });
            return Promise.resolve({ data: {} });
        });
        mockPost.mockResolvedValue({ data: { success: true, data: {} } });
        mockPatch.mockResolvedValue({ data: { success: true } });
        mockDelete.mockResolvedValue({ data: { success: true } });
    });

    // ── Data Fetching ─────────────────────────────────────

    it('fetches ASR vendors, LLM vendors and post-call config on mount', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(mockGet).toHaveBeenCalledWith('/platform/asr-vendors');
            expect(mockGet).toHaveBeenCalledWith('/platform/llm-vendors');
            expect(mockGet).toHaveBeenCalledWith('/platform/post-call-asr/config');
        });
    });

    // ── Page Structure ────────────────────────────────────

    it('renders page title', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('AI Vendors')).toBeTruthy();
        });
    });

    it('renders ASR Vendors section header', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.asr.title')).toBeTruthy();
        });
    });

    it('renders LLM Vendors section header', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.llm.title')).toBeTruthy();
        });
    });

    it('renders Post-Call ASR section', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.postCall.title')).toBeTruthy();
        });
    });

    // ── ASR Vendor List ───────────────────────────────────

    it('renders loaded ASR vendors', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Prod DashScope')).toBeTruthy();
            expect(screen.getByText('Local FunASR')).toBeTruthy();
        });
    });

    it('shows built-in badge for built-in vendors', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.asr.builtIn')).toBeTruthy();
        });
    });

    // ── LLM Vendor List ──────────────────────────────────

    it('renders loaded LLM vendors', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('GPT-4o')).toBeTruthy();
        });
    });

    it('shows primary badge for primary LLM vendor', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.llm.primary')).toBeTruthy();
        });
    });

    // ── Add Vendor Form ──────────────────────────────────

    it('toggles add ASR vendor form on button click', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('settingsPage.asr.addVendor')).toBeTruthy());

        fireEvent.click(screen.getByText('settingsPage.asr.addVendor'));
        await waitFor(() => {
            // Form labels are visible
            expect(screen.getByText('settingsPage.asr.provider')).toBeTruthy();
            expect(screen.getByText('settingsPage.asr.name')).toBeTruthy();
        });
    });

    // ── ASR Vendor Test ──────────────────────────────────

    it('calls test endpoint when testing existing ASR vendor', async () => {
        mockPost.mockResolvedValueOnce({ data: { data: { success: true, latencyMs: 42 } } });
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Prod DashScope')).toBeTruthy());

        // 找到第一个 test 按钮 (属于 v1 vendor)
        const testButtons = screen.getAllByText('settingsPage.asr.test');
        fireEvent.click(testButtons[0]);
        await waitFor(() => {
            expect(mockPost).toHaveBeenCalledWith('/platform/asr-vendors/v1/test');
        });
    });

    // ── Post-Call ASR ────────────────────────────────────

    it('renders post-call ASR enable checkbox', async () => {
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.postCall.enable')).toBeTruthy();
        });
    });

    // ── Empty States ─────────────────────────────────────

    it('shows empty message when no ASR vendors exist', async () => {
        mockGet.mockImplementation((url: string) => {
            if (url.includes('asr-vendors')) return Promise.resolve({ data: { success: true, data: { vendors: [], activeIds: [] } } });
            if (url.includes('llm-vendors')) return Promise.resolve({ data: { success: true, data: { vendors: [], primaryId: '', secondaryId: '', serviceMapping: {} } } });
            if (url.includes('post-call-asr/config')) return Promise.resolve({ data: { data: { enabled: false } } });
            if (url.includes('post-call-asr/status')) return Promise.resolve({ data: { data: {} } });
            return Promise.resolve({ data: {} });
        });
        render(<AiVendors />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.asr.noVendors')).toBeTruthy();
            expect(screen.getByText('settingsPage.llm.noVendors')).toBeTruthy();
        });
    });
});
