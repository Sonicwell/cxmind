/**
 * ModuleContext
 *
 * Provides module enablement state to AU components.
 * Used by: DashboardLayout (sidebar), Dashboard (widgets), feature pages.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export interface ModuleInfo {
    slug: string;
    tier: 'core' | 'optional';
    enabled: boolean;
}

interface ModuleContextValue {
    modules: ModuleInfo[];
    loading: boolean;
    isModuleEnabled: (slug: string) => boolean;
    toggleModule: (slug: string, enabled: boolean) => Promise<void>;
    refreshModules: () => Promise<void>;
}

const ModuleContext = createContext<ModuleContextValue>({
    modules: [],
    loading: true,
    isModuleEnabled: () => true,
    toggleModule: async () => { },
    refreshModules: async () => { },
});

export const useModules = () => useContext(ModuleContext);

export const ModuleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [modules, setModules] = useState<ModuleInfo[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchModules = useCallback(async () => {
        try {
            const { data } = await api.get('/modules');
            setModules(data.modules || []);
        } catch {
            // If API fails, treat all modules as enabled (backward compat)
            setModules([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchModules();
    }, [fetchModules]);

    const isModuleEnabled = useCallback((slug: string): boolean => {
        if (modules.length === 0) return true; // No modules loaded = allow all
        const mod = modules.find(m => m.slug === slug);
        if (!mod) return true; // Unknown module = allow
        return mod.enabled;
    }, [modules]);

    const toggleModule = useCallback(async (slug: string, enabled: boolean) => {
        // 先做乐观更新，提高 UI 响应速度
        setModules(prev => prev.map(m => m.slug === slug ? { ...m, enabled } : m));
        try {
            await api.patch(`/modules/${slug}`, { enabled });
        } catch (error) {
            // 若失败则回滚状态
            setModules(prev => prev.map(m => m.slug === slug ? { ...m, enabled: !enabled } : m));
            console.error('[ModuleContext] Failed to toggle module:', error);
            throw error;
        }
    }, []);

    return (
        <ModuleContext.Provider value={{ modules, loading, isModuleEnabled, toggleModule, refreshModules: fetchModules }}>
            {children}
        </ModuleContext.Provider>
    );
};
