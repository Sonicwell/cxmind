import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { Button } from '../ui/button';

const LANGUAGES = [
    { code: 'zh', name: '简体中文', short: '中文' },
    { code: 'en', name: 'English', short: 'EN' },
    { code: 'ja', name: '日本語', short: '日本語' },
    { code: 'ko', name: '한국어', short: '한국어' },
    { code: 'es', name: 'Español', short: 'ES' },
    { code: 'ar', name: 'العربية', short: 'عربي' },
];

interface Props {
    /** collapsed: only show globe icon (for collapsed sidebar) */
    collapsed?: boolean;
}

export function LanguageSwitcher({ collapsed = false }: Props) {
    const { i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const current = LANGUAGES.find(l => i18n.language?.startsWith(l.code)) ?? LANGUAGES[0];

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            {/* ── Trigger button ── */}
            <Button
                onClick={() => setOpen(o => !o)}
                title="Change Language"
                aria-label="Change Language"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.3rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid transparent',
                    background: open ? 'var(--bg-light)' : 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-light)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--glass-border)';
                }}
                onMouseLeave={e => {
                    if (!open) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                    }
                }}
            >
                <Globe size={15} style={{ flexShrink: 0 }} />
                {!collapsed && (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '4rem' }}>
                        {current.short}
                    </span>
                )}
            </Button>

            {/* ── Dropdown panel ── */}
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 1000,
                        minWidth: '160px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        padding: '0.35rem',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {LANGUAGES.map(lang => {
                        const isActive = i18n.language?.startsWith(lang.code);
                        return (
                            <Button
                                key={lang.code}
                                onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    width: '100%',
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: 'none',
                                    background: isActive
                                        ? 'hsla(var(--primary-hue), var(--primary-sat), var(--primary-light), 0.12)'
                                        : 'transparent',
                                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: isActive ? 600 : 400,
                                    textAlign: 'left',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => {
                                    if (!isActive)
                                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-light)';
                                }}
                                onMouseLeave={e => {
                                    if (!isActive)
                                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                }}
                            >
                                <span>{lang.name}</span>
                                {isActive && <Check size={13} />}
                            </Button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
