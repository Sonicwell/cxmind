import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mock Data ──

const MOCK_SUPERVISORS = [
    { _id: 'sup-1', displayName: 'John', email: 'john@wcc.io', status: 'active', groupIds: ['grp-1'] },
    { _id: 'sup-2', displayName: 'Jane', email: 'jane@wcc.io', status: 'active', groupIds: [] },
];

const MOCK_GROUPS = [
    { _id: 'grp-1', name: 'Tier 1 Support', code: 'tier-1-support' },
    { _id: 'grp-2', name: 'Sales', code: 'sales' },
];

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        patch: (...args: any[]) => mockPatch(...args),
    },
}));

vi.mock('../ui/GlassModal', () => ({
    GlassModal: ({ open, children, title }: any) =>
        open ? <div data-testid={`modal-${title}`}>{children}</div> : null,
}));

vi.mock('../ui/MotionButton', () => ({
    MotionButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../ui/AvatarInitials', () => ({
    default: () => <span data-testid="avatar" />,
}));

import SupervisorsPanel from './SupervisorsPanel';

describe('SupervisorsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockImplementation((url: string) => {
            if (url.includes('/platform/users')) {
                return Promise.resolve({ data: { data: MOCK_SUPERVISORS } });
            }
            if (url.includes('/groups')) {
                return Promise.resolve({ data: { data: MOCK_GROUPS } });
            }
            return Promise.resolve({ data: { data: [] } });
        });
        mockPatch.mockResolvedValue({ data: {} });
    });

    it('should render supervisor list after loading', async () => {
        render(<SupervisorsPanel />);
        await waitFor(() => {
            expect(screen.getByText('John')).toBeInTheDocument();
            expect(screen.getByText('Jane')).toBeInTheDocument();
        });
    });

    it('should show group badges for supervisors with assigned groups', async () => {
        render(<SupervisorsPanel />);
        await waitFor(() => {
            expect(screen.getByText('Tier 1 Support')).toBeInTheDocument();
        });
    });

    // Discovery Intent: 捕获 API 路径拼写错误 (/users/ vs /platform/users/)
    it('handleSave should PATCH /platform/users/:id with correct groupIds', async () => {
        render(<SupervisorsPanel />);
        await waitFor(() => expect(screen.getByText('John')).toBeInTheDocument());

        // 打开 John 的管理分组弹窗
        const manageButtons = screen.getAllByText(/Manage Groups/);
        fireEvent.click(manageButtons[0]);

        await waitFor(() => {
            expect(screen.getByText('Sales')).toBeInTheDocument();
        });

        // 勾选 Sales 组
        const salesCheckbox = screen.getAllByRole('checkbox').find(cb => {
            const label = cb.closest('label');
            return label?.textContent?.includes('Sales');
        });
        if (salesCheckbox) fireEvent.click(salesCheckbox);

        // 点击 Save
        const saveBtn = screen.getByText(/Save/);
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(mockPatch).toHaveBeenCalledWith(
                '/platform/users/sup-1',
                { groupIds: expect.arrayContaining(['grp-1', 'grp-2']) }
            );
        });
    });

    // Discovery Intent: 捕获 removeGroup 路径错误
    it('removeGroup should PATCH /platform/users/:id (not /users/:id)', async () => {
        render(<SupervisorsPanel />);
        await waitFor(() => expect(screen.getByText('Tier 1 Support')).toBeInTheDocument());

        // 点击 Tier 1 Support 旁的 × 按钮
        const removeBtn = screen.getByTitle(/Remove from this group/);
        fireEvent.click(removeBtn);

        await waitFor(() => {
            expect(mockPatch).toHaveBeenCalledWith(
                '/platform/users/sup-1',
                { groupIds: [] }
            );
        });
    });

    // Discovery Intent: 捕获空数组场景
    it('should handle supervisor with no groups gracefully', async () => {
        render(<SupervisorsPanel />);
        await waitFor(() => {
            expect(screen.getByText('Jane')).toBeInTheDocument();
            expect(screen.getByText(/No groups assigned/)).toBeInTheDocument();
        });
    });
});
