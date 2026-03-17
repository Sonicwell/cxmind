import { useAuth } from '../context/AuthContext';

/**
 * A hook to check if the current user has a specific permission.
 * Platform Admin automatically bypasses these checks.
 * 
 * @param requiredPermission The permission slug to check (e.g., 'agents:write')
 * @returns boolean true if the user has the permission or is a platform admin
 */
export const usePermission = (requiredPermission: string): boolean => {
    const { user, permissions } = useAuth();

    if (!user) return false;

    // Platform Admin has all permissions implicitly
    if (user.role === 'platform_admin') return true;

    // Direct match or wildcard for the module (e.g., 'agents:*')
    return permissions.includes(requiredPermission) || permissions.includes('*');
};

/**
 * A hook to check if the current user has ALL of the specified permissions.
 */
export const usePermissionsAll = (requiredPermissions: string[]): boolean => {
    const { user, permissions } = useAuth();

    if (!user) return false;
    if (user.role === 'platform_admin') return true;
    if (permissions.includes('*')) return true;

    return requiredPermissions.every(perm => permissions.includes(perm));
};

/**
 * A hook to check if the current user has ANY of the specified permissions.
 */
export const usePermissionsAny = (requiredPermissions: string[]): boolean => {
    const { user, permissions } = useAuth();

    if (!user) return false;
    if (user.role === 'platform_admin') return true;
    if (permissions.includes('*')) return true;

    return requiredPermissions.some(perm => permissions.includes(perm));
};
