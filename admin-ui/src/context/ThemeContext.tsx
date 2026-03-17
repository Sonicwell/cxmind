import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeType = 'light' | 'dark' | 'midnight' | 'cyberpunk' | 'forest';

interface ThemeContextType {
    theme: ThemeType;
    setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<ThemeType>(() => {
        // Migration: check for legacy app-theme first
        const legacy = localStorage.getItem('app-theme') as ThemeType;
        if (legacy) {
            localStorage.setItem('cxmind:ui:theme', legacy);
            localStorage.removeItem('app-theme');
            return legacy;
        }

        // Check standard localStorage or fallback to system preference, default to dark
        const stored = localStorage.getItem('cxmind:ui:theme') as ThemeType;
        if (stored) return stored;
        if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
        return 'dark';
    });

    const setTheme = (newTheme: ThemeType) => {
        setThemeState(newTheme);
        localStorage.setItem('cxmind:ui:theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    useEffect(() => {
        // Initial setup on mount
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // Sync with system changes if no theme is specifically set in localStorage
    useEffect(() => {
        const handleSystemThemeChange = (e: MediaQueryListEvent) => {
            if (!localStorage.getItem('cxmind:ui:theme')) {
                const newTheme = e.matches ? 'light' : 'dark';
                setThemeState(newTheme);
                document.documentElement.setAttribute('data-theme', newTheme);
            }
        };

        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        mediaQuery.addEventListener('change', handleSystemThemeChange);
        return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
