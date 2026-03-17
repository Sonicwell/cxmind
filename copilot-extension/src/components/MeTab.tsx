import { useState, useEffect } from "react"
import { useAuth } from "~/hooks/useAuth"
import { useApi } from "~/hooks/useApi"
import { useTheme } from "~/hooks/useTheme"
import { useModules } from "~/hooks/useModules"
import { CalendarClock, MessageSquare, Settings, ChevronRight, User, Sun, Moon } from "lucide-react"
import { WfmPortal } from "~/components/wfm/WfmPortal"
import { SettingsView } from "~/components/SettingsView"
import { HistoryList } from "~/components/HistoryList"
import { useTranslation } from "react-i18next"

type MeSection = 'menu' | 'schedule' | 'team-chat' | 'history' | 'settings'

interface MeTabProps {
    onTestSummary?: () => void
    initialView?: string | null
    onInitialViewConsumed?: () => void
}

export function MeTab({ onTestSummary, initialView, onInitialViewConsumed }: MeTabProps) {
    const { agentInfo } = useAuth()
    const { apiUrl } = useApi()
    const { theme, toggleTheme, isDark } = useTheme()
    const { isModuleEnabled } = useModules()
    const { t } = useTranslation()
    const [section, setSection] = useState<MeSection>('menu')
    const [imgError, setImgError] = useState(false)

    // Deep navigation: auto-open a specific section
    useEffect(() => {
        if (initialView) {
            setSection(initialView as MeSection)
            onInitialViewConsumed?.()
        }
    }, [initialView])

    // Reset imgError when avatar changes
    useEffect(() => { setImgError(false) }, [agentInfo?.avatar])

    const avatarUrl = agentInfo?.avatar
        ? agentInfo.avatar.startsWith('http') ? agentInfo.avatar : `${apiUrl}${agentInfo.avatar}`
        : null
    const showImg = avatarUrl && !imgError

    if (section === 'schedule') {
        if (!isModuleEnabled('wfm')) {
            return (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <SectionHeader title={t('me.mySchedule')} onBack={() => setSection('menu')} />
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <div>WFM module is not enabled for your account.</div>
                    </div>
                </div>
            );
        }
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <SectionHeader title={t('me.mySchedule')} onBack={() => setSection('menu')} />
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <WfmPortal />
                </div>
            </div>
        )
    }

    if (section === 'history') {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <SectionHeader title={t('me.historyLabel')} onBack={() => setSection('menu')} />
                <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
                    <HistoryList />
                </div>
            </div>
        )
    }

    if (section === 'settings') {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <SectionHeader title={t('me.settings')} onBack={() => setSection('menu')} />
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <SettingsView onTestSummary={onTestSummary} />
                </div>
            </div>
        )
    }

    // Default: menu
    return (
        <div style={{ padding: '12px 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Profile card */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: showImg ? 'transparent' : 'linear-gradient(135deg, var(--primary), #a855f7)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1rem', overflow: 'hidden', flexShrink: 0,
                }}>
                    {showImg ? (
                        <img
                            src={avatarUrl}
                            alt={agentInfo?.displayName || 'Avatar'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        agentInfo?.displayName?.charAt(0)?.toUpperCase() || 'A'
                    )}
                </div>
                <div>
                    <div className="font-semibold" style={{ fontSize: '0.9rem' }}>{agentInfo?.displayName || t('common.agent')}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {agentInfo?.role === 'admin' ? t('me.administrator') :
                            agentInfo?.role === 'supervisor' ? t('me.supervisor') :
                                t('me.agentRole')} · {t('me.ext', { number: agentInfo?.sipNumber || '—' })}
                    </div>
                </div>
            </div>

            {/* Theme toggle */}
            <div className="glass-panel" style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isDark ? <Moon size={16} style={{ color: 'var(--primary)' }} /> : <Sun size={16} style={{ color: '#f59e0b' }} />}
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{isDark ? t('me.darkMode') : t('me.lightMode')}</span>
                </div>
                <button onClick={toggleTheme} style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: isDark ? 'var(--primary)' : 'rgba(0,0,0,0.15)',
                    position: 'relative', transition: 'background 0.3s',
                }}>
                    <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'white', position: 'absolute', top: 2,
                        left: isDark ? 20 : 2, transition: 'left 0.3s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                </button>
            </div>

            {/* Menu items */}
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
                {isModuleEnabled('wfm') && <MenuItem
                    icon={<CalendarClock size={18} />}
                    label={t('me.mySchedule')}
                    subtitle={t('me.scheduleSubtitle')}
                    onClick={() => setSection('schedule')}
                />}
                <MenuItem
                    icon={<MessageSquare size={18} />}
                    label={t('me.historyLabel')}
                    subtitle={t('me.historySubtitle')}
                    onClick={() => setSection('history')}
                />
                <MenuItem
                    icon={<Settings size={18} />}
                    label={t('me.settings')}
                    subtitle={t('me.settingsSubtitle')}
                    onClick={() => setSection('settings')}
                    isLast
                />
            </div>

            {/* Role info */}
            <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {t('common.qualityAssist')}
            </div>
        </div>
    )
}

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
    const { t } = useTranslation()
    return (
        <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex', alignItems: 'center', gap: 6,
        }}>
            <button onClick={onBack} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 2,
                fontSize: '0.8rem', fontWeight: 500, fontFamily: 'inherit', padding: '4px 0',
            }}>
                ← {t('common.back').replace('← ', '')}
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{title}</span>
        </div>
    )
}

function MenuItem({ icon, label, subtitle, onClick, isLast }: {
    icon: React.ReactNode; label: string; subtitle: string;
    onClick: () => void; isLast?: boolean;
}) {
    return (
        <button onClick={onClick} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', width: '100%',
            background: 'none', border: 'none',
            borderBottom: isLast ? 'none' : '1px solid var(--glass-border)',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            transition: 'background 0.2s',
        }}>
            <div style={{ color: 'var(--primary)', flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{subtitle}</div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </button>
    )
}
