import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
    },
}));

vi.mock('../../../components/ui/GlassModal', () => ({
    GlassModal: ({ open, children, title, onOpenChange }: any) =>
        open ? (
            <div data-testid="glass-modal">
                <h2>{title}</h2>
                {children}
                <button aria-label="Close" onClick={() => onOpenChange(false)}>×</button>
            </div>
        ) : null,
}));

import { DistillationLogs } from '../distillation-logs/DistillationLogs';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

const MOCK_LOGS = [
    {
        timestamp: '2026-03-12T02:00:00.000Z',
        call_id: 'call-001',
        service_type: 'quality',
        model: 'gpt-4o-mini',
        prompt: '{"messages":[{"role":"user","content":"test"}]}',
        response: '{"result":"ok"}',
        tokens: 150,
        is_valid: 1,
    },
    {
        timestamp: '2026-03-12T01:00:00.000Z',
        call_id: 'call-002',
        service_type: 'summary',
        model: 'deepseek-v3',
        prompt: '{"messages":[]}',
        response: '{"summary":"test"}',
        tokens: 0,
        is_valid: 0,
    },
];

describe('DistillationLogs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({
            data: {
                data: MOCK_LOGS,
                pagination: { total: 2, limit: 50, offset: 0 },
            },
        });
        mockPost.mockResolvedValue({ data: { success: true } });
    });

    // ── Rendering ─────────────────────────────────────────
    it('renders page title and subtitle via i18n', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('LLM Distillation Logs')).toBeTruthy();
            expect(screen.getByText(/Raw LLM prompts/)).toBeTruthy();
        });
    });

    it('fetches logs on mount with correct endpoint', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(mockGet).toHaveBeenCalledWith(
                '/platform/llm-logs',
                expect.objectContaining({ params: expect.any(URLSearchParams) }),
            );
        });
    });

    // ── Table Rendering ───────────────────────────────────
    it('renders table headers via i18n keys', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Time')).toBeTruthy();
            expect(screen.getByText('Service')).toBeTruthy();
            expect(screen.getByText('Call ID')).toBeTruthy();
            expect(screen.getByText('Model')).toBeTruthy();
            expect(screen.getByText('Tokens')).toBeTruthy();
            expect(screen.getByText('Status')).toBeTruthy();
            expect(screen.getByText('Actions')).toBeTruthy();
        });
    });

    it('renders log rows with correct data', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('call-001')).toBeTruthy();
            expect(screen.getByText('call-002')).toBeTruthy();
            expect(screen.getByText('gpt-4o-mini')).toBeTruthy();
            expect(screen.getByText('deepseek-v3')).toBeTruthy();
        });
    });

    it('shows Valid/Invalid badges with i18n text', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            // "Valid" badge for call-001, "Invalid" badge for call-002
            const validBadges = screen.getAllByText('Valid');
            const invalidBadges = screen.getAllByText('Invalid');
            expect(validBadges.length).toBeGreaterThanOrEqual(1);
            expect(invalidBadges.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── Filter Controls ───────────────────────────────────
    it('renders filter dropdowns with i18n labels', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Service:')).toBeTruthy();
            expect(screen.getByText('Validity:')).toBeTruthy();
        });
    });

    // ── Empty State ───────────────────────────────────────
    it('shows empty state when no logs returned', async () => {
        mockGet.mockResolvedValueOnce({
            data: { data: [], pagination: { total: 0, limit: 50, offset: 0 } },
        });
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('No logs found')).toBeTruthy();
        });
    });

    // ── Error Handling ────────────────────────────────────
    it('shows toast error when fetch fails', async () => {
        mockGet.mockRejectedValueOnce(new Error('Network error'));
        render(<DistillationLogs />, { wrapper: Wrapper });
        // 验证组件不崩溃 — toast 错误在全局 toast 层显示
        await waitFor(() => {
            expect(screen.getByText('No logs found')).toBeTruthy();
        });
    });

    // ── Pagination ────────────────────────────────────────
    it('renders pagination controls with i18n text', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Previous')).toBeTruthy();
            expect(screen.getByText('Next')).toBeTruthy();
            expect(screen.getByText('Showing 1 to 2 of 2 entries')).toBeTruthy();
        });
    });

    // ── View Modal ────────────────────────────────────────
    it('opens prompt modal when Prompt button clicked', async () => {
        render(<DistillationLogs />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('call-001')).toBeTruthy());

        const promptButtons = screen.getAllByText('Prompt');
        fireEvent.click(promptButtons[0]);

        await waitFor(() => {
            expect(screen.getByText('Prompt JSON')).toBeTruthy();
            // GlassModal 使用 X 图标关闭按钮 (aria-label="Close")
            expect(screen.getByLabelText('Close')).toBeTruthy();
        });
    });
});
