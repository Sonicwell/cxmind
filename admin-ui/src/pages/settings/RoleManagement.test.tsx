import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        put: (...args: any[]) => mockPut(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../components/ui/OrganicCard', () => ({
    OrganicCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

const mockRoles = [
    { _id: 'r1', slug: 'platform_admin', name: 'Platform Admin', description: 'Full access', permissions: ['*'], isSystem: true },
    { _id: 'r2', slug: 'agent', name: 'Agent', description: 'Agent role', permissions: ['calls:view', 'calls:listen'], isSystem: true },
    { _id: 'r3', slug: 'custom_role', name: 'Custom Role', description: 'Custom desc', permissions: ['calls:view'], isSystem: false },
];

const mockPermissions = [
    { _id: 'p1', slug: 'calls:view', name: 'View Calls', description: 'View call list', module: 'calls' },
    { _id: 'p2', slug: 'calls:listen', name: 'Listen', description: 'Listen to recordings', module: 'calls' },
    { _id: 'p3', slug: 'settings:manage', name: 'Manage Settings', description: 'Edit settings', module: 'settings' },
];

import RoleManagement from './RoleManagement';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('RoleManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockImplementation((url: string) => {
            if (url.includes('roles')) return Promise.resolve({ data: mockRoles });
            if (url.includes('permissions')) return Promise.resolve({ data: mockPermissions });
            return Promise.resolve({ data: [] });
        });
    });

    it('fetches roles and permissions on mount', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(mockGet).toHaveBeenCalledWith('/rbac/roles');
            expect(mockGet).toHaveBeenCalledWith('/rbac/permissions');
        });
    });

    it('renders page title', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Roles & Permissions')).toBeTruthy());
    });

    it('renders all role cards', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Platform Admin')).toBeTruthy();
            expect(screen.getByText('Agent')).toBeTruthy();
            expect(screen.getByText('Custom Role')).toBeTruthy();
        });
    });

    it('shows System badge for system roles', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
        });
    });

    it('shows Superuser badge for platform_admin', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Superuser')).toBeTruthy();
        });
    });

    it('shows Root Access for wildcard permission role', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('Root Access (All Permissions)')).toBeTruthy();
        });
    });

    it('renders Create Custom Role button', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Create Custom Role')).toBeTruthy());
    });

    it('opens edit form on Create Custom Role click', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Create Custom Role')).toBeTruthy());
        fireEvent.click(screen.getByText('Create Custom Role'));
        await waitFor(() => {
            expect(screen.getByText('New Custom Role')).toBeTruthy();
            expect(screen.getByText('Role Name')).toBeTruthy();
            expect(screen.getByText('Permissions Matrix')).toBeTruthy();
        });
    });

    it('renders permission modules in matrix view', async () => {
        render(<RoleManagement />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('Create Custom Role')).toBeTruthy());
        fireEvent.click(screen.getByText('Create Custom Role'));
        await waitFor(() => {
            // Permission names shown as labels
            expect(screen.getByText('View Calls')).toBeTruthy();
            expect(screen.getByText('Listen')).toBeTruthy();
            expect(screen.getByText('Manage Settings')).toBeTruthy();
        });
    });
});
