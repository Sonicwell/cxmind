import { useState, useEffect, useCallback, useRef } from "react"
import { DEMO_ENABLED } from "~/utils/demo-flag"

interface ApiConfig {
    apiUrl: string
    token: string | null
}

export function useApi() {
    const [config, setConfig] = useState<ApiConfig>({
        apiUrl: "http://localhost:3000",
        token: null
    })

    // Use refs so fetchApi always has the latest values
    const configRef = useRef(config)
    configRef.current = config

    const [isInitialized, setIsInitialized] = useState(false)

    useEffect(() => {
        chrome.storage.sync.get(["apiUrl"], (syncResult) => {
            chrome.storage.local.get(["token"], (localResult) => {
                setConfig({
                    apiUrl: syncResult.apiUrl || "http://localhost:3000",
                    token: localResult.token || null
                })
                setIsInitialized(true)
            })
        })

        const listener = (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => {
            if (namespace === "sync" && changes.apiUrl) {
                setConfig((c) => ({ ...c, apiUrl: changes.apiUrl.newValue }))
            }
            if (namespace === "local" && changes.token) {
                setConfig((c) => ({ ...c, token: changes.token.newValue }))
            }
        }
        chrome.storage.onChanged.addListener(listener)
        return () => chrome.storage.onChanged.removeListener(listener)
    }, [])
    const fetchApi = useCallback(
        async <T = any>(path: string, options?: RequestInit): Promise<T> => {
            const { apiUrl, token } = configRef.current

            // Demo 模式: 路由到本地 mock 数据 (编译时 flag 控制)
            if (DEMO_ENABLED && token === 'demo-mode-token') {
                const { resolveDemoMock } = await import('~/mock/demo-api-responses')
                return resolveDemoMock(path, options) as T
            }

            const res = await fetch(`${apiUrl}${path}`, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
                    ...options?.headers
                }
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `Request failed (${res.status})`)
            }

            return res.json()
        },
        [] // stable reference — reads from configRef
    )

    return { fetchApi, apiUrl: config.apiUrl, hasToken: !!config.token, isInitialized }
}
