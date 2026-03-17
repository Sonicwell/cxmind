import { useState, useEffect, useCallback } from "react"

type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>('light')

    // Load saved preference
    useEffect(() => {
        chrome.storage.sync.get(['theme'], (result) => {
            const saved = (result.theme as Theme) || 'light'
            setThemeState(saved)
            applyTheme(saved)
        })
    }, [])

    const applyTheme = (t: Theme) => {
        const resolved = t === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : t

        if (resolved === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark')
        } else {
            document.documentElement.removeAttribute('data-theme')
        }
    }

    const setTheme = useCallback((t: Theme) => {
        setThemeState(t)
        applyTheme(t)
        chrome.storage.sync.set({ theme: t })
    }, [])

    const toggleTheme = useCallback(() => {
        const next = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
    }, [theme, setTheme])

    // Listen for system preference changes
    useEffect(() => {
        if (theme !== 'system') return
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = () => applyTheme('system')
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [theme])

    return { theme, setTheme, toggleTheme, isDark: theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) }
}
