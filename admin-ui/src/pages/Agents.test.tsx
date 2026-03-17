import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Agents from './Agents';

// ── Mocks ──

const MOCK_AGENTS = [
    {
        _id: 'a1', sipNumber: '1001', sipPassword: '', status: 'active',
        boundUser: { displayName: 'Alice', email: 'alice@test.com', avatar: null },
        groupId: { _id: 'g1', name: 'Team A', code: 'ta' },
        pcapPolicy: 'disabled', asrPolicy: 'optional', summaryPolicy: 'enforced', assistantPolicy: 'disabled',
        createdAt: '2025-01-01',
    },
    {
        _id: 'a2', sipNumber: '1002', sipPassword: '', status: 'active',
        boundUser: null, groupId: null,
        pcapPolicy: 'disabled', asrPolicy: 'disabled', summaryPolicy: 'disabled', assistantPolicy: 'disabled',
        createdAt: '2025-01-02',
    },
    {
        _id: 'a3', sipNumber: '1003', sipPassword: '', status: 'active',
        boundUser: { displayName: 'Bob', email: 'bob@test.com', avatar: null },
        groupId: null,
        pcapPolicy: 'enforced', asrPolicy: 'enforced', summaryPolicy: 'enforced', assistantPolicy: 'enforced',
        createdAt: '2025-01-03',
    },
];

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        patch: (...args: any[]) => mockPatch(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: false }),
}));

vi.mock('../services/mock-data', () => ({
    getMockAgents: vi.fn(),
}));

vi.mock('../components/ui/GlassModal', () => ({
    GlassModal: ({ open, children, title }: any) =>
        open ? <div data-testid={`modal-${title}`}>{children}</div> : null,
}));

vi.mock('../components/ui/MotionButton', () => ({
    MotionButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../components/ui/AvatarInitials', () => ({
    default: () => <span data-testid="avatar" />,
}));

vi.mock('../components/ExportButton', () => ({
    default: ({ label }: any) => <button>{label}</button>,
}));

vi.mock('../utils/export-csv', () => ({
    exportToCSV: vi.fn(),
    exportFilename: vi.fn().mockReturnValue('agents.csv'),
}));

vi.mock('../components/organization/GroupsPanel', () => ({
    default: () => <div data-testid="groups-panel">Groups</div>,
}));

vi.mock('../components/organization/SupervisorsPanel', () => ({
    default: () => <div data-testid="supervisors-panel">Supervisors</div>,
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock useTabParam to avoid needing a Router
vi.mock('../hooks/useTabParam', () => {
    const { useState } = require('react');
    return {
        useTabParam: (_paramName: string, defaultValue: string) => {
            return useState(defaultValue);
        },
    };
});

// Helper to wait for data to load
const waitForDataLoaded = () => waitFor(() => {
    expect(screen.getByText('1001')).toBeInTheDocument();
});

describe('Agents Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({
            data: {
                data: MOCK_AGENTS,
                pagination: { total: 3, limit: 20, offset: 0 },
            },
        });
        mockPost.mockResolvedValue({ data: {} });
        mockPatch.mockResolvedValue({ data: {} });
        mockDelete.mockResolvedValue({ data: {} });
    });

    it('should render summary stats bar', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        expect(screen.getByText(/Total/)).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument(); // total count
    });

    it('should render filter chips (All, Bound, Unbound)', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        const allChip = screen.getByText('All');
        expect(allChip).toBeInTheDocument();
        // The chip's parent button has the filter-chip class
        expect(allChip.closest('.filter-chip') || allChip.classList.contains('filter-chip')).toBeTruthy();
    });

    it('should filter by bound status when clicking Bound chip', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();

        // Click the Bound filter chip (find by i18n key text)
        const boundChip = screen.getByText('Bound');
        expect(boundChip).toBeTruthy();
        fireEvent.click(boundChip);

        await waitFor(() => {
            // Alice and Bob should be visible, agent 1002 (unbound) should not
            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('Bob')).toBeInTheDocument();
            expect(screen.queryByText('1002')).not.toBeInTheDocument();
        });
    });

    it('should render policy toggle buttons instead of dropdowns', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        const toggles = document.querySelectorAll('.policy-toggle');
        // 3 agents * 4 policies = 12 toggles
        expect(toggles.length).toBe(12);
    });

    it('should cycle policy state on toggle click (disabled→optional)', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();

        // Find PCAP toggle for agent a1 (disabled state)
        const toggles = screen.getAllByLabelText(/PCAP: disabled/i);
        expect(toggles.length).toBeGreaterThan(0);

        fireEvent.click(toggles[0]);

        await waitFor(() => {
            expect(mockPatch).toHaveBeenCalledWith(
                '/client/agents/a1',
                { pcapPolicy: 'optional' }
            );
        });
    });

    it('should show select-all checkbox in table header', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        expect(screen.getByLabelText('Select all agents')).toBeInTheDocument();
    });

    it('should show batch action bar when agents are selected', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();

        fireEvent.click(screen.getByLabelText('Select agent 1001'));

        await waitFor(() => {
            expect(screen.getByText('Batch Policy')).toBeInTheDocument();
        });
    });

    it('should render pagination controls', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        expect(screen.getByText(/Showing/i)).toBeInTheDocument();
        expect(screen.getByText('per page')).toBeInTheDocument();
    });

    it('should apply unbound row dimming class', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();

        const rows = document.querySelectorAll('.agent-row-unbound');
        expect(rows.length).toBe(1); // Only agent a2 is unbound
    });

    it('should render loading skeleton while fetching', () => {
        mockGet.mockReturnValue(new Promise(() => { })); // never resolves
        render(<MemoryRouter><Agents /></MemoryRouter>);
        const skeletonRows = document.querySelectorAll('.agents-skeleton-row');
        expect(skeletonRows.length).toBeGreaterThan(0);
    });

    it('should show group badge for grouped agents', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();

        const badges = document.querySelectorAll('.agent-group-badge');
        expect(badges.length).toBe(1);
        expect(badges[0].textContent).toBe('Team A');
    });

    // ── New Deep Tests ──

    it('should render tab navigation (Agents/Groups/Supervisors)', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        expect(screen.getByText('Agents')).toBeInTheDocument();
        expect(screen.getByText('Groups')).toBeInTheDocument();
        expect(screen.getByText('Supervisors')).toBeInTheDocument();
    });

    it('should switch to Groups tab and render GroupsPanel', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        fireEvent.click(screen.getByText('Groups'));
        await waitFor(() => {
            expect(screen.getByTestId('groups-panel')).toBeInTheDocument();
        });
    });

    it('should switch to Supervisors tab and render SupervisorsPanel', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        fireEvent.click(screen.getByText('Supervisors'));
        await waitFor(() => {
            expect(screen.getByTestId('supervisors-panel')).toBeInTheDocument();
        });
    });

    it('should filter agents by search term (SIP number)', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        const searchInput = screen.getByPlaceholderText('Search agents...');
        fireEvent.change(searchInput, { target: { value: '1003' } });
        await waitFor(() => {
            expect(screen.getByText('1003')).toBeInTheDocument();
            expect(screen.queryByText('1001')).not.toBeInTheDocument();
        });
    });

    it('should render bound user emails', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        expect(screen.getByText('alice@test.com')).toBeInTheDocument();
        expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    });

    it('should render unbound label for agents without bound user', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        expect(screen.getAllByText('Unbound').length).toBeGreaterThan(0);
    });

    it('should render table column headers', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        const thead = document.querySelector('thead')!;
        const headerScope = within(thead);
        expect(screen.getByText('Bound User')).toBeInTheDocument();
        expect(screen.getByText('SIP Number')).toBeInTheDocument();
        expect(screen.getByText('Group')).toBeInTheDocument();
        expect(headerScope.getByText('PCAP')).toBeInTheDocument();
        expect(headerScope.getByText('ASR')).toBeInTheDocument();
    });

    it('should render Add Agent and Batch Add buttons', async () => {
        render(<MemoryRouter><Agents /></MemoryRouter>);
        await waitForDataLoaded();
        expect(screen.getByText('Add Agent')).toBeInTheDocument();
        expect(screen.getByText('Batch Add')).toBeInTheDocument();
    });
});
