import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { STORAGE_KEYS } from '../constants/storage-keys';

interface User {
    id: string;
    email: string;
    displayName: string;
    avatar?: string | null;
    role: string;
    clientId?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    permissions: string[];
    login: (token: string, refreshToken: string, permissions: string[], user: User, rememberMe: boolean) => void;
    logout: () => void;
    isAuthenticated: boolean;
    loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        const storedUser = localStorage.getItem(STORAGE_KEYS.AUTH_USER) || sessionStorage.getItem(STORAGE_KEYS.AUTH_USER);
        const storedPermissions = localStorage.getItem(STORAGE_KEYS.AUTH_PERMISSIONS) || sessionStorage.getItem(STORAGE_KEYS.AUTH_PERMISSIONS);
        const refreshToken = localStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);

        if (storedToken && storedUser) {
            // Case 1: Valid session in storage — restore immediately
            setToken(storedToken);
            // SEC-AU-1: 畸形 JSON 保护 (与 permissions 保持一致)
            try {
                setUser(JSON.parse(storedUser));
            } catch {
                setUser(null);
                [localStorage, sessionStorage].forEach(s => s.removeItem(STORAGE_KEYS.AUTH_USER));
            }
            if (storedPermissions) {
                try {
                    setPermissions(JSON.parse(storedPermissions));
                } catch {
                    setPermissions([]);
                }
            }
            setLoading(false);
        } else if (refreshToken) {
            // Case 2: No access token but refresh token exists — attempt silent renewal
            const apiBase = import.meta.env.VITE_API_URL || '/api';
            axios.post(`${apiBase}/auth/refresh`, { refreshToken })
                .then(rs => {
                    const { token: newToken, refreshToken: newRefreshToken, user: newUser, permissions: newPermissions } = rs.data;
                    // Persist back to the same storage type as the refresh token
                    const usesLocal = !!localStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
                    const store = usesLocal ? localStorage : sessionStorage;
                    store.setItem(STORAGE_KEYS.AUTH_TOKEN, newToken);
                    store.setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, newRefreshToken);
                    if (newUser) store.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(newUser));
                    if (newPermissions) store.setItem(STORAGE_KEYS.AUTH_PERMISSIONS, JSON.stringify(newPermissions));
                    setToken(newToken);
                    setUser(newUser ?? null);
                    setPermissions(newPermissions ?? []);
                })
                .catch(() => {
                    // Refresh token expired — clear storage, save redirect target
                    [localStorage, sessionStorage].forEach(s => {
                        s.removeItem(STORAGE_KEYS.AUTH_TOKEN);
                        s.removeItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
                        s.removeItem(STORAGE_KEYS.AUTH_USER);
                        s.removeItem(STORAGE_KEYS.AUTH_PERMISSIONS);
                    });
                    // Preserve intended URL so Login can redirect back after sign-in
                    const intendedPath = window.location.pathname + window.location.search;
                    if (intendedPath !== '/login') {
                        sessionStorage.setItem('cxmind:auth:redirect-after-login', intendedPath);
                    }
                })
                .finally(() => setLoading(false));
        } else {
            // Case 3: No tokens at all — show login page
            setLoading(false);
        }
    }, []);

    const login = useCallback((newToken: string, newRefreshToken: string, newPermissions: string[], newUser: User, rememberMe: boolean) => {
        if (rememberMe) {
            localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, newToken);
            localStorage.setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, newRefreshToken);
            localStorage.setItem(STORAGE_KEYS.AUTH_PERMISSIONS, JSON.stringify(newPermissions));
            localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(newUser));
        } else {
            sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, newToken);
            sessionStorage.setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, newRefreshToken);
            sessionStorage.setItem(STORAGE_KEYS.AUTH_PERMISSIONS, JSON.stringify(newPermissions));
            sessionStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(newUser));
        }
        setToken(newToken);
        setPermissions(newPermissions);
        setUser(newUser);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.AUTH_PERMISSIONS);
        localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_PERMISSIONS);
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_USER);
        setToken(null);
        setPermissions([]);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                permissions,
                login,
                logout,
                isAuthenticated: !!token,
                loading,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
