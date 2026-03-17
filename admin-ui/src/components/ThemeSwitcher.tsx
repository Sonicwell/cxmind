import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeType } from '../context/ThemeContext';
import { Button } from './ui/button';

const AVAILABLE_THEMES: { id: ThemeType, name: string, color: string }[] = [
    { id: 'light', name: 'Light', color: '#ffffff' },
    { id: 'dark', name: 'Dark', color: '#111827' },
    { id: 'midnight', name: 'Midnight', color: '#0f172a' },
    { id: 'cyberpunk', name: 'Cyberpunk', color: '#000000' },
    { id: 'forest', name: 'Forest', color: '#064e3b' },
];

export const ThemeSwitcher: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const getIcon = () => {
        switch (theme) {
            case 'light': return <Sun size={18} />;
            case 'dark': return <Moon size={18} />;
            case 'midnight': return <Moon size={18} />; // Or a specific icon
            default: return <Palette size={18} />;
        }
    };

    return (
        <div className="theme-switcher" ref={dropdownRef} style={{ position: 'relative' }}>
            <Button
                size="icon"
                onClick={() => setIsOpen(!isOpen)}
                title="Change Theme"
                data-testid="theme-switcher"
                style={{ position: 'relative' }}
            >
                {getIcon()}
            </Button>

            {isOpen && (
                <div className="glass-panel" style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '0',
                    marginBottom: '0.5rem',
                    minWidth: '160px',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                }}>
                    <div style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        Select Theme
                    </div>

                    {AVAILABLE_THEMES.map((t) => (
                        <Button
                            key={t.id}
                            onClick={() => {
                                setTheme(t.id);
                                setIsOpen(false);
                            }}
                            className="theme-option"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                width: '100%',
                                padding: '0.6rem 0.75rem',
                                border: 'none',
                                background: theme === t.id ? 'var(--primary-glow)' : 'transparent',
                                color: theme === t.id ? 'var(--primary)' : 'var(--text-primary)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s',
                                fontSize: '0.9rem'
                            }}
                            onMouseEnter={(e) => {
                                if (theme !== t.id) e.currentTarget.style.background = 'hsla(var(--surface-hue), 10%, 50%, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                                if (theme !== t.id) e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: t.color,
                                border: '1px solid var(--glass-border)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }} />

                            <span style={{ flex: 1 }}>{t.name}</span>

                            {theme === t.id && <Check size={14} />}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
};
