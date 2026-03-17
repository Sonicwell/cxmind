import { useState, useEffect, useCallback } from "react"
import { useApi } from "./useApi"
import { useAuth } from "./useAuth"

export interface ModuleInfo {
    slug: string
    tier: 'core' | 'optional'
    enabled: boolean
}

export function useModules() {
    const { fetchApi, isInitialized: apiInitialized } = useApi()
    const { isAuthenticated } = useAuth()

    // We start with raw array. If empty, it's either uninitialized or actually empty (failsafe: allow all)
    const [modules, setModules] = useState<ModuleInfo[]>([])
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        if (!apiInitialized || !isAuthenticated) return

        let cancelled = false;

        // 1. First load from local cache for instant UI
        chrome.storage.local.get(['cxmi_modules'], (res) => {
            if (!cancelled && res.cxmi_modules) {
                setModules(res.cxmi_modules)
                setIsLoaded(true)
            }
        })

        // 2. Then fetch fresh from API
        const fetchModules = async () => {
            try {
                const res = await fetchApi<{ modules: ModuleInfo[] }>('/api/modules')
                if (!cancelled && res && Array.isArray(res.modules)) {
                    setModules(res.modules)
                    setIsLoaded(true)
                    chrome.storage.local.set({ cxmi_modules: res.modules })
                }
            } catch (error) {
                console.error('[useModules] Failed to fetch modules', error)
                // If API fails and we don't have cache, we just leave it as [] (which defaults to allow)
                if (!cancelled) setIsLoaded(true)
            }
        }

        fetchModules()

        // 定期刷新 (5 分钟)，管理员后台变更后 Copilot 可感知
        const interval = setInterval(fetchModules, 5 * 60 * 1000)

        return () => { cancelled = true; clearInterval(interval) }
    }, [apiInitialized, isAuthenticated, fetchApi])

    const isModuleEnabled = useCallback((slug: string) => {
        // Safe default: if not loaded or empty array, fallback to enabled
        // (to avoid blocking UI immediately or during API failure)
        if (!isLoaded || modules.length === 0) return true

        const mod = modules.find(m => m.slug === slug)
        if (!mod) return true // Unknown module = allow
        return mod.enabled
    }, [modules, isLoaded])

    return { modules, isLoaded, isModuleEnabled }
}
