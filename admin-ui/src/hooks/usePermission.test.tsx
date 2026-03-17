import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { usePermission, usePermissionsAll, usePermissionsAny } from '../hooks/usePermission';
import { AuthContext } from '../context/AuthContext';

// ── Helper: wrap hooks in a custom AuthContext value ──────────────────────────
const makeUser = (role: string) => ({
    id: '1',
    email: 'test@test.com',
    displayName: 'Test',
    role,
});

const mockLogout = vi.fn();
const mockLogin = vi.fn();

const createWrapper = (overrides: {
    user?: ReturnType<typeof makeUser> | null;
    permissions?: string[];
}) => {
    const ctx = {
        user: overrides.user ?? null,
        token: overrides.user ? 'tok' : null,
        permissions: overrides.permissions ?? [],
        isAuthenticated: !!overrides.user,
        loading: false,
        login: mockLogin,
        logout: mockLogout,
    };
    return ({ children }: { children: React.ReactNode }) => (
        <AuthContext.Provider value= { ctx } > { children } </AuthContext.Provider>
    );
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('usePermission', () => {
    it('returns false when user is null', () => {
        const { result } = renderHook(() => usePermission('agents:read'), {
            wrapper: createWrapper({ user: null }),
        });
        expect(result.current).toBe(false);
    });

    it('platform_admin bypasses permission check', () => {
        const { result } = renderHook(() => usePermission('agents:delete'), {
            wrapper: createWrapper({ user: makeUser('platform_admin'), permissions: [] }),
        });
        expect(result.current).toBe(true);
    });

    it('returns true on exact permission match', () => {
        const { result } = renderHook(() => usePermission('calls:read'), {
            wrapper: createWrapper({ user: makeUser('agent'), permissions: ['calls:read'] }),
        });
        expect(result.current).toBe(true);
    });

    it('returns true on wildcard "*" permission', () => {
        const { result } = renderHook(() => usePermission('anything:write'), {
            wrapper: createWrapper({ user: makeUser('supervisor'), permissions: ['*'] }),
        });
        expect(result.current).toBe(true);
    });

    it('returns false when permission is absent', () => {
        const { result } = renderHook(() => usePermission('audit:delete'), {
            wrapper: createWrapper({ user: makeUser('agent'), permissions: ['calls:read'] }),
        });
        expect(result.current).toBe(false);
    });
});

describe('usePermissionsAll', () => {
    it('returns true only when ALL permissions are granted', () => {
        const { result } = renderHook(
            () => usePermissionsAll(['calls:read', 'calls:write']),
            { wrapper: createWrapper({ user: makeUser('supervisor'), permissions: ['calls:read', 'calls:write'] }) }
        );
        expect(result.current).toBe(true);
    });

    it('returns false when at least one permission is missing', () => {
        const { result } = renderHook(
            () => usePermissionsAll(['calls:read', 'calls:delete']),
            { wrapper: createWrapper({ user: makeUser('supervisor'), permissions: ['calls:read'] }) }
        );
        expect(result.current).toBe(false);
    });

    it('platform_admin passes all-permission check', () => {
        const { result } = renderHook(
            () => usePermissionsAll(['a', 'b', 'c']),
            { wrapper: createWrapper({ user: makeUser('platform_admin') }) }
        );
        expect(result.current).toBe(true);
    });
});

describe('usePermissionsAny', () => {
    it('returns true when at least one permission matches', () => {
        const { result } = renderHook(
            () => usePermissionsAny(['calls:write', 'audit:read']),
            { wrapper: createWrapper({ user: makeUser('supervisor'), permissions: ['audit:read'] }) }
        );
        expect(result.current).toBe(true);
    });

    it('returns false when none match', () => {
        const { result } = renderHook(
            () => usePermissionsAny(['calls:write', 'audit:delete']),
            { wrapper: createWrapper({ user: makeUser('agent'), permissions: ['calls:read'] }) }
        );
        expect(result.current).toBe(false);
    });
});
