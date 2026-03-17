import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

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

vi.mock('../ui/GlassModal', () => ({
    GlassModal: ({ open, title, children }: any) =>
        open ? <div data-testid="glass-modal"><h3>{title}</h3>{children}</div> : null,
}));

vi.mock('../ui/ConfirmModal', () => ({
    ConfirmModal: ({ open, onConfirm, onClose, title, description }: any) =>
        open ? <div data-testid="confirm-modal"><span>{title}</span><span>{description}</span><button onClick={onConfirm}>confirm</button></div> : null,
}));

vi.mock('../ui/MotionButton', () => ({
    MotionButton: ({ children, onClick, ...props }: any) =>
        <button onClick={onClick} {...props}>{children}</button>,
}));

const mockGroups = [
    {
        _id: 'g1', name: 'Customer Support', code: 'cs-team', type: 'inbound' as const,
        skillTags: ['billing', 'tech'], slaTarget: { maxWaitSec: 30, maxHandleSec: 300 },
        maxAgents: 10, status: 'active' as const, agentCount: 5,
        supervisors: [{ _id: 's1', displayName: 'Jane Doe', email: 'jane@test.com' }],
    },
    {
        _id: 'g2', name: 'Outbound Sales', code: 'sales', type: 'outbound' as const,
        skillTags: [], status: 'active' as const, agentCount: 3,
        supervisors: [],
    },
    {
        _id: 'g3', name: 'Legacy Team', code: 'legacy', type: 'blended' as const,
        skillTags: [], status: 'inactive' as const, agentCount: 0,
        supervisors: [],
    },
];

import GroupsPanel from './GroupsPanel';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('GroupsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { data: mockGroups } });
    });

    it('fetches groups on mount', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/groups'));
    });

    it('renders group names', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Customer Support')).toBeTruthy();
            expect(screen.getByText('Outbound Sales')).toBeTruthy();
            expect(screen.getByText('Legacy Team')).toBeTruthy();
        });
    });

    it('renders group codes', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('#cs-team')).toBeTruthy();
            expect(screen.getByText('#sales')).toBeTruthy();
        });
    });

    it('renders type badges', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            // Type badges include emoji prefix like "📞 Inbound", "📤 Outbound"
            expect(screen.getByText(/📞\s*Inbound/)).toBeTruthy();
            expect(screen.getByText(/📤\s*Outbound/)).toBeTruthy();
        });
    });

    it('renders agent count', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('5')).toBeTruthy(); // agentCount for CS team
        });
    });

    it('renders skill tags', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('billing')).toBeTruthy();
            expect(screen.getByText('tech')).toBeTruthy();
        });
    });

    it('renders SLA info', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/SLA: \{\{sec\}\}s wait/)).toBeTruthy();
        });
    });

    it('renders Inactive badge for inactive groups', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Inactive')).toBeTruthy();
        });
    });

    it('renders New Group button', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('New Group')).toBeTruthy();
        });
    });

    it('opens create modal on New Group click', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('New Group')).toBeTruthy());
        fireEvent.click(screen.getByText('New Group'));
        expect(screen.getByText('Group Name')).toBeTruthy();
        expect(screen.getByText('Code')).toBeTruthy();
    });

    it('filters groups by search term', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Customer Support')).toBeTruthy());
        const searchInput = screen.getByPlaceholderText('Search groups...');
        fireEvent.change(searchInput, { target: { value: 'sales' } });
        expect(screen.queryByText('Customer Support')).toBeNull();
        expect(screen.getByText('Outbound Sales')).toBeTruthy();
    });

    it('shows empty state when no groups match', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Customer Support')).toBeTruthy());
        const searchInput = screen.getByPlaceholderText('Search groups...');
        fireEvent.change(searchInput, { target: { value: 'zzz_nonexistent' } });
        expect(screen.getByText(/No groups yet/)).toBeTruthy();
    });

    it('renders supervisor count toggle', async () => {
        render(<GroupsPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText(/\{\{count\}\} supervisor\(s\)/)).toBeTruthy();
        });
    });

    it('assigns agents and supervisors to a group', async () => {
        mockGet.mockResolvedValueOnce({ data: { data: mockGroups } }); // Initial fetch
        mockGet.mockResolvedValueOnce({ // /client/agents
            data: { data: [{ _id: 'a1', sipNumber: '1001', displayName: 'Agent 1' }] }
        });
        mockGet.mockResolvedValueOnce({ // /platform/users
            data: { data: [{ _id: 's2', displayName: 'New Sup', email: 'sup@test.com', role: 'supervisor', groupIds: [] }] }
        });

        render(<GroupsPanel />, { wrapper: Wrapper });

        // Wait for groups to render
        await waitFor(() => expect(screen.getByText('Customer Support')).toBeTruthy());

        // Find and click the Assign button for "Customer Support"
        const assignBtns = screen.getAllByText('Assign');
        fireEvent.click(assignBtns[0]); // First group is Customer Support

        // Wait for modal to open and data to load
        await waitFor(() => {
            expect(screen.getByText('Assign to Group')).toBeTruthy();
            expect(screen.getByText('1001')).toBeTruthy(); // Agent sip
            expect(screen.getByText('New Sup')).toBeTruthy(); // Sup name
        });

        // Select the new supervisor
        const supCheckbox = screen.getAllByRole('checkbox')[1]; // Second checkbox is for supervisor in this mock
        fireEvent.click(supCheckbox);

        // Click Assign Confirm
        mockPost.mockResolvedValueOnce({}); // Mocks assign-agents
        mockPatch.mockResolvedValueOnce({}); // Mocks user groupIds patch

        fireEvent.click(screen.getByText(/Assign \{\{agents\}\} Agents/));

        await waitFor(() => {
            // Verify agents were assigned
            expect(mockPost).toHaveBeenCalledWith('/groups/g1/assign-agents', { agentIds: [] });
            // Verify supervisor was patched
            expect(mockPatch).toHaveBeenCalledWith('/platform/users/s2', { groupIds: ['g1'] });
            // Verify list was refreshed
            expect(mockGet).toHaveBeenCalledWith('/groups');
        });
    });
});
