import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SipCalls from './SipCalls';

// ── jsdom polyfills ───────────────────────────────────────
Object.defineProperty(window, 'speechSynthesis', {
    value: { getVoices: () => [], speak: vi.fn(), cancel: vi.fn() },
    writable: true,
});

// ── Mock Data ─────────────────────────────────────────────
const mockCalls = [
    {
        call_id: 'call-001', timestamp: '2026-02-20 10:30:00',
        caller: '1001', callee: '2001', from_domain: 'pbx.local', to_domain: 'sip.remote',
        last_method: 'BYE', last_status: 200, client_id: 'c1',
        duration: 125, emotion: 'happy', direction: 'outbound',
    },
    {
        call_id: 'call-002', timestamp: '2026-02-20 10:25:00',
        caller: '1002', callee: '2002', from_domain: 'pbx.local', to_domain: 'sip.remote',
        last_method: 'CANCEL', last_status: 487, client_id: 'c1',
        duration: 0, emotion: 'angry', direction: 'inbound',
    },
    {
        call_id: 'call-003', timestamp: '2026-02-20 10:20:00',
        caller: '1003', callee: '2003', from_domain: 'gw.local', to_domain: 'trunk.remote',
        last_method: 'BYE', last_status: 503, client_id: 'c1',
        duration: 45, direction: 'outbound',
    },
];

// ── Module mocks ──────────────────────────────────────────

vi.mock('../services/mock-audio', () => ({
    demoAudioManager: { speak: vi.fn(), stop: vi.fn() },
    DemoAudioManager: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, d?: string | Record<string, unknown>) => (typeof d === 'string' ? d : k),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ isDemoMode: false, demoMode: false }),
}));

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn().mockImplementation((url: string) => {
            if (url.includes('calls/active')) {
                return Promise.resolve({ data: { data: [] } });
            }
            if (url.includes('/platform/calls')) {
                // 支持 server-side search: 如果 URL 含 search= 参数则过滤结果
                const searchMatch = url.match(/search=([^&]+)/);
                if (searchMatch) {
                    const term = decodeURIComponent(searchMatch[1]).toLowerCase();
                    const filtered = mockCalls.filter(c =>
                        c.call_id.includes(term) || c.caller.includes(term) || c.callee.includes(term)
                    );
                    return Promise.resolve({ data: { data: filtered, total: filtered.length } });
                }
                return Promise.resolve({ data: { data: mockCalls, total: mockCalls.length } });
            }
            if (url.includes('groups')) {
                return Promise.resolve({
                    data: {
                        data: [
                            { _id: 'g1', name: 'Sales', code: 'SALES' },
                            { _id: 'g2', name: 'Support', code: 'SUP' },
                        ]
                    }
                });
            }
            return Promise.resolve({ data: {} });
        }),
        post: vi.fn().mockResolvedValue({ data: {} }),
    },
}));

vi.mock('../services/mock-data', () => ({
    getMockCalls: () => Promise.resolve({ data: { calls: [] } }),
}));

vi.mock('../components/ExportButton', () => ({
    default: ({ label, disabled }: any) => (
        <button data-testid="export-btn" disabled={disabled}>{label}</button>
    ),
}));

vi.mock('../utils/export-csv', () => ({
    exportToCSV: vi.fn(),
    exportFilename: vi.fn(() => 'test.csv'),
}));

vi.mock('../components/ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, disabled, title, ...props }: any) => (
        <button onClick={onClick} disabled={disabled} title={title} {...props}>{children}</button>
    ),
}));

vi.mock('../components/ui/GlassModal', () => ({
    GlassModal: ({ open, children, title }: any) =>
        open ? <div data-testid="glass-modal"><h2>{title}</h2>{children}</div> : null,
}));

vi.mock('../components/CallDetails', () => ({
    default: ({ callId }: any) => <div data-testid="call-details">{callId}</div>,
}));

vi.mock('../components/SipDialog', () => ({
    default: ({ callId }: any) => <div data-testid="sip-dialog">{callId}</div>,
}));

vi.mock('../components/analysis/CallAnalysisModal', () => ({
    CallAnalysisModal: ({ callId }: any) => <div data-testid="call-analysis">{callId}</div>,
}));

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

// ── Tests ─────────────────────────────────────────────────

describe('SipCalls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset timers so setInterval doesn't interfere
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows loading state initially', () => {
        render(<SipCalls />, { wrapper: Wrapper });
        expect(screen.getByText('sipCallsPage.loading')).toBeTruthy();
    });

    it('renders call table with caller/callee after loading', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('1001')).toBeTruthy();
            expect(screen.getByText('2001')).toBeTruthy();
        });
    });

    it('renders call IDs in the table (truncated)', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            // call_id.slice(0,8) + '…' — 'call-001' is 8 chars, shown as 'call-001…'
            expect(screen.getByText(/call-001/)).toBeTruthy();
            expect(screen.getByText(/call-002/)).toBeTruthy();
        });
    });

    it('renders semantic status labels', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            // SipCalls: last_method !== 'completed' → displayString = last_method
            // call-001 & call-003 both have 'BYE', call-002 has 'CANCEL'
            expect(screen.getAllByText('BYE').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('CANCEL').length).toBeGreaterThanOrEqual(1);
        });
    });



    it('formats duration correctly (125s → 2:05)', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('2:05')).toBeTruthy();
        });
    });

    it('shows "-" for zero duration', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            // call-002 duration=0, should show '-'
            const dashes = screen.getAllByText('-');
            expect(dashes.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('renders search input', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByPlaceholderText('sipCallsPage.searchPlaceholder')).toBeTruthy();
        });
    });

    it('filters calls by search term', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        render(<SipCalls />, { wrapper: Wrapper });

        // 先等初次加载完成
        await act(async () => { vi.advanceTimersByTime(500); });
        await waitFor(() => {
            expect(screen.getByText(/call-001/)).toBeTruthy();
        });

        const searchInput = screen.getByPlaceholderText('sipCallsPage.searchPlaceholder');
        fireEvent.change(searchInput, { target: { value: '1003' } });

        // 触发 debounce (300ms) + refetch interval
        await act(async () => { vi.advanceTimersByTime(500); });

        await waitFor(() => {
            expect(screen.getByText(/call-003/)).toBeTruthy();
            expect(screen.queryByText(/call-001/)).toBeNull();
        });
    });

    it('renders column settings button', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByTitle('Columns')).toBeTruthy();
        });
    });

    it('renders refresh button', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('sipCallsPage.refresh')).toBeTruthy();
        });
    });

    it('renders export button', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByTestId('export-btn')).toBeTruthy();
        });
    });

    it('renders filter dropdowns', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        // Filters 现在在点击展开的面板中
        await waitFor(() => {
            expect(screen.getByText('Filters')).toBeTruthy();
        });
        const filtersBtn = screen.getByText('Filters').closest('button')!;
        fireEvent.click(filtersBtn);
        await waitFor(() => {
            // 面板打开后应有多个 <select> (Groups, Status, Direction, Call Type, Hangup By)
            const selects = screen.getAllByRole('combobox');
            expect(selects.length).toBeGreaterThanOrEqual(3);
        });
    });

    it('renders group options from API', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        // 先等加载并打开 filter panel
        await waitFor(() => {
            expect(screen.getByText('Filters')).toBeTruthy();
        });
        fireEvent.click(screen.getByText('Filters'));
        // group options 在 <select> 的 <option> 中
        await waitFor(() => {
            expect(screen.getByText('Sales')).toBeTruthy();
            expect(screen.getByText('Support')).toBeTruthy();
        });
    });

    it('shows "no calls" message when filtered list is empty', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        render(<SipCalls />, { wrapper: Wrapper });

        await act(async () => { vi.advanceTimersByTime(500); });
        await waitFor(() => {
            expect(screen.getByText(/call-001/)).toBeTruthy();
        });

        const searchInput = screen.getByPlaceholderText('sipCallsPage.searchPlaceholder');
        fireEvent.change(searchInput, { target: { value: 'nonexistent-search-xyz' } });

        // 触发 debounce → server-side search 返回空结果
        await act(async () => { vi.advanceTimersByTime(500); });

        await waitFor(() => {
            expect(screen.getByText('sipCallsPage.noCalls')).toBeTruthy();
        });
    });

    it('renders table column headers', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('sipCallsPage.time')).toBeTruthy();
            expect(screen.getByText('sipCallsPage.duration')).toBeTruthy();
            expect(screen.getByText('sipCallsPage.from')).toBeTruthy();
            expect(screen.getByText('sipCallsPage.to')).toBeTruthy();
            expect(screen.getByText('sipCallsPage.status')).toBeTruthy();
        });
    });

    it('opens CallDetails modal when clicking detail button', async () => {
        vi.useRealTimers();
        render(<SipCalls />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/call-001/)).toBeTruthy();
        });

        // Info 按钮 (Call Details)
        const detailBtns = screen.getAllByTitle('sipCallsPage.callDetails');
        fireEvent.click(detailBtns[0]);

        await waitFor(() => {
            expect(screen.getByTestId('call-details')).toBeTruthy();
        });
    });
});

