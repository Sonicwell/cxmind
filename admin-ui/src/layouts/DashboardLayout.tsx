import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModules } from '../context/ModuleContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
    LayoutDashboard,
    Users,
    Settings,
    LogOut,
    Phone,
    Activity,
    Headphones,
    Shield,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Search,
    TrendingUp,
    Coins,
    Map as MapIcon,
    ClipboardCheck,
    Webhook,
    Zap,
    MessageSquare,
    CalendarClock,
    Bell,
    BookUser,
    BookOpen,
    Sparkles, // Playground
    Blocks,
    Workflow,
    FileText,
} from 'lucide-react';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { DemoBanner } from '../components/DemoBanner';
import AvatarInitials from '../components/ui/AvatarInitials';
import { GlobalSearch } from '../components/ui/GlobalSearch';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { ThemeSelector } from '../components/common/ThemeSelector';
import { useDemoMode } from '../hooks/useDemoMode';
import { useTheme } from '../context/ThemeContext';
import AIOverlay from '../components/ui/AIOverlay';
import toast from 'react-hot-toast';
import '../styles/dashboard.css';

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

// ────────────────────────────────────────────────────────────
// NavGroup – collapsible section with a group header
// ────────────────────────────────────────────────────────────
interface NavGroupProps {
    label: string;
    isCollapsedSidebar: boolean;
    defaultOpen?: boolean;
    hasActiveChild?: boolean;
    badgeCount?: number;
    showDot?: boolean;
    children: React.ReactNode;
}

const NavGroup: React.FC<NavGroupProps> = ({
    label,
    isCollapsedSidebar,
    defaultOpen = true,
    hasActiveChild = false,
    badgeCount,
    showDot,
    children,
}) => {
    const [open, setOpen] = React.useState(defaultOpen || hasActiveChild);

    // Auto-open when a child becomes active (e.g. direct URL navigation)
    React.useEffect(() => {
        if (hasActiveChild) setOpen(true);
    }, [hasActiveChild]);

    // In mini (collapsed) sidebar mode, always show children without header
    if (isCollapsedSidebar) {
        return (
            <div className="nav-group-collapsed">
                <div className="nav-group-divider" />
                {children}
            </div>
        );
    }

    return (
        <div className={`nav-group ${hasActiveChild ? 'nav-group--active' : ''}`}>
            <button
                className={`nav-group-header ${open ? 'open' : ''}`}
                onClick={() => setOpen(o => !o)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="nav-group-label">{label}</span>
                    {!open && badgeCount ? (
                        <span className="badge-count" style={{ position: 'static', padding: '1px 4px' }}>{badgeCount}</span>
                    ) : null}
                    {!open && showDot ? (
                        <span className="status-dot pulsing-dot" style={{ position: 'static' }}></span>
                    ) : null}
                </div>
                <ChevronDown size={12} className="nav-group-chevron" />
            </button>
            {open && (
                <div className="nav-group-items">
                    {children}
                </div>
            )}
        </div>
    );
};

// ────────────────────────────────────────────────────────────
// Main Layout
// ────────────────────────────────────────────────────────────
const DashboardLayout: React.FC = () => {
    const { t } = useTranslation();
    const [isCollapsed, setIsCollapsed] = React.useState(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
        return saved === 'true';
    });
    const [isSearchOpen, setIsSearchOpen] = React.useState(false);

    const [isAnimating, setIsAnimating] = React.useState(false);
    const animationTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const toggleCollapsed = () => {
        setIsAnimating(true);
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);

        animationTimeoutRef.current = setTimeout(() => {
            setIsAnimating(false);
            animationTimeoutRef.current = undefined;
        }, 300);

        setIsCollapsed(prev => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(next));
            return next;
        });
    };

    // 窄屏自动折叠: ≤1280px 强制收起, 宽屏恢复 localStorage 偏好
    React.useEffect(() => {
        const mql = window.matchMedia('(max-width: 1280px)');
        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
            if (e.matches) {
                setIsCollapsed(true);
            } else {
                const saved = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
                setIsCollapsed(saved === 'true');
            }
        };
        handleChange(mql);
        mql.addEventListener('change', handleChange);
        return () => mql.removeEventListener('change', handleChange);
    }, []);

    const { logout, user } = useAuth();
    const { isModuleEnabled } = useModules();
    const { connected, subscribe } = useWebSocket();
    const { demoMode } = useDemoMode();
    const { theme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const logoSrc = theme === 'light' ? '/cxmi_logo_full.svg' : '/cxmi_logo_full_dark.svg';

    // ────────────────────────────────────────────────────────────
    // Live Data & Badges
    // ────────────────────────────────────────────────────────────
    const [liveCount, setLiveCount] = React.useState(0);

    React.useEffect(() => {
        const unsubscribe = subscribe('dashboard:invalidate', (message: any) => {
            if (message?.data?.activeCallCount !== undefined) {
                setLiveCount(message.data.activeCallCount);
            }
        });
        return () => unsubscribe();
    }, [subscribe]);

    // 全局通知: post-call ASR 完成/失败
    React.useEffect(() => {
        const unsubscribe = subscribe('call:post_call_asr', (message: any) => {
            const data = message.data || message;
            const { callId, status, vendorName, segmentCount, asrDurationMs } = data;
            if (!callId) return;

            const shortId = callId.length > 12 ? callId.slice(0, 12) + '…' : callId;

            if (status === 'completed') {
                const durStr = asrDurationMs ? `${Math.round(asrDurationMs / 1000)}s` : '';
                const detail = [vendorName, segmentCount && `${segmentCount} segments`, durStr].filter(Boolean).join(' · ');
                toast(
                    (t) => (
                        <div
                            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}
                            onClick={() => { toast.dismiss(t.id); navigate(`/calls?analysisCallId=${callId}`); }}
                        >
                            <span style={{ fontWeight: 600 }}>✅ 转写完成</span>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{shortId}</span>
                            {detail && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{detail}</span>}
                            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: 2 }}>点击查看 →</span>
                        </div>
                    ),
                    { duration: 8000, id: `asr-done-${callId}` }
                );
            } else if (status === 'failed') {
                toast.error(`转写失败: ${shortId}`, { duration: 6000, id: `asr-fail-${callId}` });
            }
        });
        return () => unsubscribe();
    }, [subscribe, navigate]);

    const displayLiveCount = demoMode ? 1 : liveCount;
    // Mock 3 unread alerts in demo mode, otherwise 0 for now (to be wired up later)
    const unreadAlerts = demoMode ? 3 : 0;

    // Keyboard shortcut for search
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(open => !open);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Helper: check if any path in a list matches current location
    const isAnyActive = (paths: string[]) =>
        paths.some(p =>
            p.endsWith('*')
                ? location.pathname.startsWith(p.slice(0, -1))
                : location.pathname === p || location.pathname.startsWith(p + '/')
        );

    return (
        <div className={`dashboard-container ${isAnimating ? 'is-animating' : ''}`} style={{ flexDirection: 'column' }}>
            <DemoBanner />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <aside className={`sidebar glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
                    {/* ── Header ── */}
                    <div className="sidebar-header">
                        <img src={logoSrc} alt="CXMind" className="logo logo-full" />
                        <img src="/cxmi_icon.svg" alt="CXMind" className="logo logo-icon" />
                        <h2 className="brand-text">Admin</h2>
                        <button className="collapse-toggle" onClick={toggleCollapsed}>
                            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                        </button>
                    </div>

                    {/* ── Navigation ── */}
                    <nav className="sidebar-nav">
                        {/* Global Search */}
                        <button
                            className="nav-item search-trigger"
                            onClick={() => setIsSearchOpen(true)}
                            title={t('common.search')}
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            <Search size={20} />
                            <span className="nav-text" style={{ flex: 1 }}>{t('common.search')}</span>
                            {!isCollapsed && <span className="kbd-shortcut">⌘K</span>}
                        </button>

                        {/* ── Group 1: Operations ── */}
                        <NavGroup
                            label={t('sidebar.groupOperations')}
                            isCollapsedSidebar={isCollapsed}
                            defaultOpen={true}
                            hasActiveChild={isAnyActive(['/dashboard', '/monitoring', '/omni-monitor', '/contacts'])}
                            badgeCount={unreadAlerts}
                            showDot={displayLiveCount > 0}
                        >
                            <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.dashboard')}>
                                <LayoutDashboard size={20} />
                                <span className="nav-text">{t('sidebar.dashboard')}</span>
                            </NavLink>
                            <NavLink to="/monitoring" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.monitoring')}>
                                <div className="icon-wrapper">
                                    <Headphones size={20} />
                                    {displayLiveCount > 0 && <span className="status-dot pulsing-dot"></span>}
                                </div>
                                <span className="nav-text">{t('sidebar.monitoring')}</span>
                            </NavLink>
                            {isModuleEnabled('inbox') && <NavLink to="/omni-monitor" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.omniMonitor', 'Omni Monitor')}>
                                <Activity size={20} />
                                <span className="nav-text">{t('sidebar.omniMonitor', 'Omni Monitor')}</span>
                            </NavLink>}
                            {isModuleEnabled('contacts') && <NavLink to="/contacts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.contact360')}>
                                <BookUser size={20} />
                                <span className="nav-text">{t('sidebar.contact360')}</span>
                            </NavLink>}
                            <NavLink to="/alerts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.alerts')}>
                                <div className="icon-wrapper">
                                    <Bell size={20} />
                                    {unreadAlerts > 0 && <span className="badge-count">{unreadAlerts}</span>}
                                </div>
                                <span className="nav-text">{t('sidebar.alerts')}</span>
                            </NavLink>
                        </NavGroup>

                        {/* ── Group 2: Intelligence & Logs ── */}
                        <NavGroup
                            label={t('sidebar.groupIntelligence')}
                            isCollapsedSidebar={isCollapsed}
                            defaultOpen={true}
                            hasActiveChild={isAnyActive(['/calls', '/events', '/analytics'])}
                        >
                            <NavLink to="/calls" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.calls')}>
                                <Phone size={20} />
                                <span className="nav-text">{t('sidebar.calls')}</span>
                            </NavLink>
                            <NavLink to="/events" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.callEvents')}>
                                <Activity size={20} />
                                <span className="nav-text">{t('sidebar.callEvents')}</span>
                            </NavLink>
                            {isModuleEnabled('analytics') && <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.analytics')}>
                                <TrendingUp size={20} />
                                <span className="nav-text">{t('sidebar.analytics')}</span>
                            </NavLink>}
                            {isModuleEnabled('analytics') && <NavLink to="/roi" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.roiAnalytics')}>
                                <Coins size={20} />
                                <span className="nav-text">{t('sidebar.roiAnalytics')}</span>
                            </NavLink>}
                        </NavGroup>

                        {/* ── Group 3: Management ── */}
                        <NavGroup
                            label={t('sidebar.groupManagement')}
                            isCollapsedSidebar={isCollapsed}
                            defaultOpen={true}
                            hasActiveChild={isAnyActive(['/users', '/agents', '/wfm', '/map'])}
                        >
                            <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.userManagement')}>
                                <Users size={20} />
                                <span className="nav-text">{t('sidebar.userManagement')}</span>
                            </NavLink>
                            <NavLink to="/agents" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.agents')}>
                                <Headphones size={20} />
                                <span className="nav-text">{t('sidebar.agents')}</span>
                            </NavLink>
                            {isModuleEnabled('wfm') && <NavLink to="/wfm" className={({ isActive }) => `nav-item ${isActive || location.pathname.startsWith('/wfm') ? 'active' : ''}`} title={t('sidebar.wfm')}>
                                <CalendarClock size={20} />
                                <span className="nav-text">{t('sidebar.wfm')}</span>
                            </NavLink>}
                            <NavLink to="/map" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.agentMap')}>
                                <MapIcon size={20} />
                                <span className="nav-text">{t('sidebar.agentMap')}</span>
                            </NavLink>
                        </NavGroup>

                        {/* ── Group 4: Knowledge & Tools ── */}
                        {(isModuleEnabled('action_center') || isModuleEnabled('inbox') || isModuleEnabled('knowledge') || isModuleEnabled('sop') || isModuleEnabled('webhooks') || isModuleEnabled('qi') || isModuleEnabled('demo')) && (
                            <NavGroup
                                label={t('sidebar.groupTools', 'Knowledge & Tools')}
                                isCollapsedSidebar={isCollapsed}
                                defaultOpen={false}
                                hasActiveChild={isAnyActive(['/actions', '/inbox', '/knowledge', '/qi', '/playground', '/templates', '/sop', '/integrations'])}
                            >
                                {isModuleEnabled('action_center') && <NavLink to="/actions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.actionCenter')}>
                                    <Zap size={20} />
                                    <span className="nav-text">{t('sidebar.actionCenter')}</span>
                                </NavLink>}
                                {isModuleEnabled('inbox') && <NavLink to="/inbox" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.inbox')}>
                                    <MessageSquare size={20} />
                                    <span className="nav-text">{t('sidebar.inbox')}</span>
                                </NavLink>}
                                {isModuleEnabled('knowledge') && <NavLink to="/knowledge" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.knowledgeBase', 'Knowledge Base')}>
                                    <BookOpen size={20} />
                                    <span className="nav-text">{t('sidebar.knowledgeBase', 'Knowledge Base')}</span>
                                </NavLink>}
                                {isModuleEnabled('inbox') && <NavLink to="/templates" className={({ isActive }) => `nav-item ${isActive || location.pathname.startsWith('/templates') ? 'active' : ''}`} title={t('sidebar.templates', 'Templates')}>
                                    <FileText size={20} />
                                    <span className="nav-text">{t('sidebar.templates', 'Templates')}</span>
                                </NavLink>}
                                {isModuleEnabled('sop') && <NavLink to="/sop" className={({ isActive }) => `nav-item ${isActive || location.pathname.startsWith('/sop') ? 'active' : ''}`} title={t('sidebar.sopLibrary', 'SOP Library')}>
                                    <Workflow size={20} />
                                    <span className="nav-text">{t('sidebar.sopLibrary', 'SOP Library')}</span>
                                </NavLink>}
                                {isModuleEnabled('webhooks') && <NavLink to="/integrations" className={({ isActive }) => `nav-item ${isActive || location.pathname.startsWith('/integrations') ? 'active' : ''}`} title={t('sidebar.integrations', 'Integrations')}>
                                    <Blocks size={20} />
                                    <span className="nav-text">{t('sidebar.integrations', 'Integrations')}</span>
                                </NavLink>}
                                {isModuleEnabled('qi') && <NavLink to="/qi" className={({ isActive }) => `nav-item ${isActive && location.pathname === '/qi' ? 'active' : ''}`} title={t('sidebar.quality')} end>
                                    <ClipboardCheck size={20} />
                                    <span className="nav-text">{t('sidebar.quality')}</span>
                                </NavLink>}
                                {isModuleEnabled('demo') && <NavLink to="/playground" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.demo')}>
                                    <Sparkles size={20} />
                                    <span className="nav-text">{t('sidebar.demo')}</span>
                                </NavLink>}
                            </NavGroup>
                        )}

                        {/* ── Group 5: System & Config ── */}
                        <NavGroup
                            label={t('sidebar.groupSystemConfig', 'System & Config')}
                            isCollapsedSidebar={isCollapsed}
                            defaultOpen={false}
                            hasActiveChild={isAnyActive(['/audit', '/webhooks', '/settings'])}
                        >
                            {/* Audit with sub-nav */}
                            {isModuleEnabled('audit') && <>
                                <NavLink to="/audit" className={({ isActive }) => `nav-item ${isActive && location.pathname === '/audit' ? 'active' : ''}`} title={t('sidebar.auditLogs')} end>
                                    <Shield size={20} />
                                    <span className="nav-text">{t('sidebar.auditLogs')}</span>
                                </NavLink>
                                {location.pathname.startsWith('/audit') && !isCollapsed && (
                                    <div className="sub-nav" style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        marginLeft: '2.5rem',
                                        paddingLeft: '1rem',
                                        marginTop: '0.25rem',
                                        borderLeft: '1px solid #374151'
                                    }}>
                                        {[
                                            { to: '/audit/logs', label: t('sidebar.auditLogsSub') },
                                            { to: '/audit/alerts', label: t('audit.alertCenter', 'Alert Center') },
                                            { to: '/audit/anomalies', label: t('sidebar.auditAnomalies') },
                                            { to: '/audit/reports', label: t('sidebar.auditReports') },
                                            { to: '/audit/rules', label: t('sidebar.auditRules') },
                                        ].map(({ to, label }) => (
                                            <NavLink key={to} to={to} className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`} style={({ isActive }) => ({
                                                display: 'block',
                                                padding: '0.4rem 0 0.4rem 1rem',
                                                fontSize: '0.8rem',
                                                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                                                textDecoration: 'none',
                                                transition: 'color 0.2s',
                                            })}>
                                                {label}
                                            </NavLink>
                                        ))}
                                    </div>
                                )}
                            </>}

                            {isModuleEnabled('webhooks') && <NavLink to="/webhooks" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={t('sidebar.crmWebhooks')}>
                                <Webhook size={20} />
                                <span className="nav-text">{t('sidebar.crmWebhooks')}</span>
                            </NavLink>}
                            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive || location.pathname.startsWith('/settings') ? 'active' : ''}`} title={t('sidebar.settings')}>
                                <Settings size={20} />
                                <span className="nav-text">{t('sidebar.settings')}</span>
                            </NavLink>
                        </NavGroup>
                    </nav>

                    {/* ── Footer ── */}
                    <div className="sidebar-footer">
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button data-testid="user-avatar" className="user-profile-btn" style={{ width: '100%', padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'transparent', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s', outline: 'none' }}>
                                    <div style={{ position: 'relative' }}>
                                        <AvatarInitials name={user?.displayName || '?'} src={user?.avatar} size={36} />
                                        <span className={`status-dot ${connected ? '' : 'offline'}`} style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: connected ? 'var(--success)' : 'var(--text-muted)', border: '2px solid var(--bg-sidebar)' }}></span>
                                    </div>
                                    {!isCollapsed && (
                                        <div className="details" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                            <span className="name" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.displayName}</span>
                                            <span className="role" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.role}</span>
                                        </div>
                                    )}
                                    {!isCollapsed && <Settings size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                                </button>
                            </DropdownMenu.Trigger>

                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    side="right"
                                    align="end"
                                    sideOffset={14}
                                    className="glass-dropdown"
                                    style={{
                                        minWidth: '200px',
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: 'var(--radius-md)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                        padding: '0.5rem',
                                        zIndex: 1000
                                    }}
                                >
                                    <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', marginBottom: '0.5rem' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{user?.displayName}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                                        <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: connected ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}></span>
                                            {connected ? t('layout.platformConnected') : t('layout.disconnected')}
                                        </div>
                                    </div>

                                    <div style={{ padding: '0.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('header.language')}</span>
                                            <LanguageSwitcher collapsed={false} />
                                        </div>
                                        <ThemeSelector />
                                    </div>

                                    <DropdownMenu.Separator style={{ height: 1, background: 'var(--border-light)', margin: '0.25rem 0' }} />

                                    <DropdownMenu.Item
                                        onClick={handleLogout}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
                                            borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--danger)',
                                            fontSize: '0.85rem', fontWeight: 500, transition: 'background 0.2s', outline: 'none'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'hsla(var(--danger-hue), var(--danger-sat), 50%, 0.1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <LogOut size={16} />
                                        <span>{t('sidebar.logout')}</span>
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                        {!isCollapsed && (
                            <div
                                style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'default' }}
                                title={typeof __APP_BUILD_TIME__ !== 'undefined' ? `Built: ${__APP_BUILD_TIME__}` : ''}
                            >
                                {typeof __APP_VERSION__ !== 'undefined' ? `v${__APP_VERSION__}` : 'v0.0.0'}
                                {typeof __APP_COMMIT__ !== 'undefined' && __APP_COMMIT__ !== 'unknown' && ` (${__APP_COMMIT__})`}
                            </div>
                        )}
                    </div>
                </aside>

                <main className={`main-content ${location.pathname.startsWith('/audit') ? '!p-0' : ''}`}>
                    <div className={`content-area ${location.pathname === '/map' ? 'h-full overflow-hidden' : ''}`}>
                        <Outlet />
                    </div>
                </main>
            </div>

            <GlobalSearch open={isSearchOpen} onOpenChange={setIsSearchOpen} />
            <AIOverlay />
        </div>
    );
};

export default DashboardLayout;
