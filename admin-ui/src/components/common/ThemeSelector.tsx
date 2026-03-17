import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeType } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '../ui/button';

const themes: { id: ThemeType; name: string; color: string; bg: string }[] = [
    { id: 'light', name: 'Light', color: '#6366f1', bg: '#f8fafc' },
    { id: 'dark', name: 'Dark', color: '#818cf8', bg: '#1e293b' },
    { id: 'midnight', name: 'Midnight', color: '#60a5fa', bg: '#000000' },
    { id: 'cyberpunk', name: 'Cyberpunk', color: '#f0abfc', bg: '#0f172a' },
    { id: 'forest', name: 'Forest', color: '#4ade80', bg: '#064e3b' },
];

export const ThemeSelector: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const { t } = useTranslation();

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('sidebar.theme') || 'Theme'}</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {themes.map((tConfig) => (
                    <Button
                        key={tConfig.id}
                        onClick={() => setTheme(tConfig.id)}
                        title={tConfig.name}
                        data-theme={tConfig.id}
                        style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: tConfig.bg,
                            border: `2px solid ${theme === tConfig.id ? tConfig.color : 'var(--glass-border)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            outline: 'none',
                            padding: 0
                        }}
                    >
                        {theme === tConfig.id && <Check size={12} color={tConfig.color} />}
                    </Button>
                ))}
            </div>
        </div>
    );
};
