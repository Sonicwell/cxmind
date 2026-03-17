import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import RoleManagement from '../RoleManagement';
import api from '../../../services/api';

// ConfirmModal: 直接渲染 confirm/cancel 按钮用于交互
vi.mock('../../../components/ui/ConfirmModal', () => ({
    ConfirmModal: ({ open, onConfirm, onClose, title, description }: any) =>
        open ? (
            <div data-testid="confirm-modal">
                <span>{title}</span>
                <span>{description}</span>
                <button data-testid="confirm-btn" onClick={onConfirm}>Confirm</button>
                <button data-testid="cancel-btn" onClick={onClose}>Cancel</button>
            </div>
        ) : null,
}));

vi.mock('../../../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    }
}));


describe('RoleManagement Component', () => {
    const mockRoles = [
        {
            _id: 'r1',
            slug: 'platform_admin',
            name: 'Platform Admin',
            description: 'Superuser access',
            permissions: ['*'],
            isSystem: true
        },
        {
            _id: 'r2',
            slug: 'custom_role',
            name: 'Custom Team',
            description: 'A custom role',
            permissions: ['modules:read'],
            isSystem: false
        }
    ];

    const mockPermissions = [
        {
            _id: 'p1',
            slug: '*',
            name: 'All Access',
            description: 'Allows everything',
            module: 'system'
        },
        {
            _id: 'p2',
            slug: 'modules:read',
            name: 'Read Modules',
            description: 'Can read modules',
            module: 'modules'
        },
        {
            _id: 'p3',
            slug: 'modules:write',
            name: 'Write Modules',
            description: 'Can write modules',
            module: 'modules'
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url === '/rbac/roles') return Promise.resolve({ data: mockRoles });
            if (url === '/rbac/permissions') return Promise.resolve({ data: mockPermissions });
            return Promise.reject(new Error('Not found'));
        });
        (api.post as any).mockResolvedValue({ data: { _id: 'r3', name: 'New Role', slug: 'new_role', permissions: [], isSystem: false, description: '' } });
        (api.put as any).mockImplementation((url: string, data: any) => Promise.resolve({ data: { ...mockRoles[1], ...data } }));
        (api.delete as any).mockResolvedValue({ data: { success: true } });
    });



    it('fetches and renders roles and permissions on mount', async () => {
        render(<RoleManagement />);
        expect(screen.getByText('Loading...')).toBeInTheDocument();

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/rbac/roles');
            expect(api.get).toHaveBeenCalledWith('/rbac/permissions');
        });

        // t('settings.roles.list.platform_admin.name', 'Platform Admin') → defaultArg 'Platform Admin' 
        expect(screen.getByText('Platform Admin')).toBeInTheDocument();
        expect(screen.getByText('Custom Team')).toBeInTheDocument();

        // System and Superuser badges — t(key, default) returns default
        expect(screen.getByText('System')).toBeInTheDocument();
        expect(screen.getByText('Superuser')).toBeInTheDocument();
        expect(screen.getByText('Root Access (All Permissions)')).toBeInTheDocument();
        expect(screen.getByText('read')).toBeInTheDocument();
    });

    it('handles creating a new role', async () => {
        render(<RoleManagement />);
        await waitFor(() => screen.getByText('Platform Admin'));

        const createBtn = screen.getByText('Create Custom Role');
        fireEvent.click(createBtn);

        expect(screen.getByText('New Custom Role')).toBeInTheDocument();

        // Check if modules are grouped
        expect(screen.getByText('system')).toBeInTheDocument();
        expect(screen.getByText('modules')).toBeInTheDocument();

        // Fill form
        const nameInputs = screen.getAllByRole('textbox');
        // 0: Role Name, 1: Description
        fireEvent.change(nameInputs[0], { target: { value: 'New Role' } });
        fireEvent.change(nameInputs[1], { target: { value: 'Test description' } });

        // Toggle a permission
        const readCheckbox = screen.getByRole('checkbox', { name: /Read Modules/i });
        fireEvent.click(readCheckbox);

        // Save
        const saveBtn = screen.getByText('Save');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/rbac/roles', {
                name: 'New Role',
                description: 'Test description',
                permissions: ['modules:read']
            });
            // Fake test role added to list
            expect(screen.getByText('New Role')).toBeInTheDocument();
        });
    });

    it('handles editing an existing role', async () => {
        render(<RoleManagement />);
        await waitFor(() => screen.getByText('Custom Team'));

        const editBtns = screen.getAllByTitle('Edit');
        expect(editBtns.length).toBe(1); // Only for custom role
        fireEvent.click(editBtns[0]);

        expect(screen.getByText('Edit Role')).toBeInTheDocument();

        // Check prefilled data
        const nameInputs = screen.getAllByRole('textbox');
        expect((nameInputs[0] as HTMLInputElement).value).toBe('Custom Team');

        // Check prefilled permission
        const readCheckbox = screen.getByRole('checkbox', { name: /Read Modules/i }) as HTMLInputElement;
        expect(readCheckbox.checked).toBe(true);

        // Toggle off the existing permission
        fireEvent.click(readCheckbox);

        // Toggle on a new permission
        const writeCheckbox = screen.getByRole('checkbox', { name: /Write Modules/i }) as HTMLInputElement;
        fireEvent.click(writeCheckbox);

        const saveBtn = screen.getByText('Save');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith('/rbac/roles/r2', expect.objectContaining({
                permissions: ['modules:write']
            }));
        });
    });

    it('cancels editing', async () => {
        render(<RoleManagement />);
        await waitFor(() => screen.getByText('Custom Team'));

        const editBtns = screen.getAllByTitle('Edit');
        fireEvent.click(editBtns[0]);

        const cancelBtn = screen.getByText('Cancel');
        fireEvent.click(cancelBtn);

        expect(screen.queryByText('Edit Role')).not.toBeInTheDocument();
        expect(screen.getByText('Create Custom Role')).toBeInTheDocument();
    });

    it('handles deleting a role', async () => {
        render(<RoleManagement />);
        await waitFor(() => screen.getByText('Custom Team'));

        const deleteBtns = screen.getAllByTitle('Delete');
        fireEvent.click(deleteBtns[0]);

        // ConfirmModal should be open
        await waitFor(() => expect(screen.getByTestId('confirm-modal')).toBeInTheDocument());

        // Click confirm button
        fireEvent.click(screen.getByTestId('confirm-btn'));

        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith('/rbac/roles/r2');
            expect(screen.queryByText('Custom Team')).not.toBeInTheDocument();
        });
    });

    it('handles wildcard permission disabling others', async () => {
        render(<RoleManagement />);
        await waitFor(() => screen.getByText('Platform Admin'));

        const createBtn = screen.getByText('Create Custom Role');
        fireEvent.click(createBtn);

        const allAccessCheckbox = screen.getByRole('checkbox', { name: /All Access/i }) as HTMLInputElement;
        const readCheckbox = screen.getByRole('checkbox', { name: /Read Modules/i }) as HTMLInputElement;

        expect(readCheckbox.disabled).toBe(false);

        fireEvent.click(allAccessCheckbox); // Enable 'All Access' (*)

        expect(readCheckbox.disabled).toBe(true);
        expect(allAccessCheckbox.checked).toBe(true);
    });

    it('renders truncated permissions correctly', async () => {
        const manyPermsRole = {
            _id: 'r3',
            slug: 'many_perms',
            name: 'Many Perms',
            description: 'role with many perms',
            permissions: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
            isSystem: false
        };
        (api.get as any).mockImplementation((url: string) => {
            if (url === '/rbac/roles') return Promise.resolve({ data: [manyPermsRole] });
            if (url === '/rbac/permissions') return Promise.resolve({ data: [] });
            return Promise.reject(new Error('Not found'));
        });

        render(<RoleManagement />);
        await waitFor(() => {
            expect(screen.getByText('Many Perms')).toBeInTheDocument();
            expect(screen.getByText('+{{count}} more')).toBeInTheDocument();
        });
    });
});
