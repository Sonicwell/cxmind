import React, { useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useModules } from '../context/ModuleContext';
import { useTranslation } from 'react-i18next';
import {
    Settings,
    Shield,
    KeySquare,
    Cpu,
    Database,
    Webhook,
    Mail,
    Server,
    Network,
    Activity,
    Layers
} from 'lucide-react';
import { SystemHealthPanel } from '../components/settings/SystemHealthPanel';
import '../styles/dashboard.css'; // Reuse basic layout styling

const SettingsLayout: React.FC = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const { isModuleEnabled } = useModules();

    // Reset scroll of the parent .main-content container when navigating between settings
    useEffect(() => {
        const scrollParent = document.querySelector('.main-content');
        if (scrollParent) {
            scrollParent.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [location.pathname]);

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
            {/* Secondary Sidebar for Settings */}
            <aside className="sidebar glass-panel" style={{ width: '240px', borderRight: '1px solid var(--glass-border)', zIndex: 10 }}>
                <div className="sidebar-header" style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>
                    <h2 className="brand-text" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>
                        <Settings size={20} />
                        {t('sidebar.settings')}
                    </h2>
                </div>

                <nav className="sidebar-nav" style={{ overflowY: 'auto', padding: '1rem 0' }}>

                    {/* Global Settings */}
                    <div style={{ paddingBottom: '0.5rem' }}>
                        <NavLink to="/settings/general" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Settings size={18} />
                            <span className="nav-text">{t('settings.nav.general')}</span>
                        </NavLink>
                    </div>

                    {/* Access & Security */}
                    <div className="nav-group" style={{ gap: '0.25rem' }}>
                        <div className="nav-group-label" style={{ padding: '0 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            {t('settings.nav.organization')}
                        </div>
                        <NavLink to="/settings/organization/roles" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Shield size={18} />
                            <span className="nav-text">{t('settings.nav.rolesPermissions')}</span>
                        </NavLink>
                        <NavLink to="/settings/organization/sessions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Activity size={18} />
                            <span className="nav-text">{t('settings.nav.activeSessions')}</span>
                        </NavLink>
                    </div>

                    {/* AI Engine */}
                    <div className="nav-group" style={{ gap: '0.25rem', marginTop: '1.5rem' }}>
                        <div className="nav-group-label" style={{ padding: '0 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            {t('settings.nav.aiEngine')}
                        </div>
                        <NavLink to="/settings/ai/vendors" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Cpu size={18} />
                            <span className="nav-text">{t('settings.nav.aiModels')}</span>
                        </NavLink>
                        <NavLink to="/settings/ai/ser" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Network size={18} />
                            <span className="nav-text">{t('settings.nav.speechEmotion')}</span>
                        </NavLink>
                        {isModuleEnabled('knowledge') && <NavLink to="/settings/ai/vector-db" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Database size={18} />
                            <span className="nav-text">{t('settings.nav.vectorDb')}</span>
                        </NavLink>}
                    </div>

                    {/* Business Logic — 情绪锚点始终可见 */}
                    <div className="nav-group" style={{ gap: '0.25rem', marginTop: '1.5rem' }}>
                        <div className="nav-group-label" style={{ padding: '0 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            {t('settings.nav.businessLogic')}
                        </div>
                        {isModuleEnabled('action_center') && <NavLink to="/settings/business/intents" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Webhook size={18} />
                            <span className="nav-text">{t('settings.nav.intentDefs')}</span>
                        </NavLink>}
                        <NavLink to="/settings/business/emotions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Activity size={18} />
                            <span className="nav-text">{t('settings.nav.emotionAnchors', 'Emotion Anchors')}</span>
                        </NavLink>
                        {isModuleEnabled('analytics') && <NavLink to="/settings/business/schemas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Server size={18} />
                            <span className="nav-text">{t('settings.nav.summarySchemas')}</span>
                        </NavLink>}
                        <NavLink to="/settings/business/llm-logs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Database size={18} />
                            <span className="nav-text">{t('settings.nav.distillationLogs')}</span>
                        </NavLink>
                        {isModuleEnabled('contacts') && <NavLink to="/settings/business/stages" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Layers size={18} />
                            <span className="nav-text">{t('settings.nav.contactStages')}</span>
                        </NavLink>}
                        <NavLink to="/settings/business/agent-statuses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Activity size={18} />
                            <span className="nav-text">{t('settings.nav.agentStatuses', 'Agent Statuses')}</span>
                        </NavLink>
                    </div>

                    {/* Channels Configuration — inbox 模块关闭时整个分组隐藏 */}
                    {isModuleEnabled('inbox') && <div className="nav-group" style={{ gap: '0.25rem', marginTop: '1.5rem' }}>
                        <div className="nav-group-label" style={{ padding: '0 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            {t('settings.nav.channels')}
                        </div>
                        <NavLink to="/settings/channels/omnichannel" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Webhook size={18} />
                            <span className="nav-text">{t('settings.nav.omnichannelBot')}</span>
                        </NavLink>
                    </div>}

                    {/* System Configuration */}
                    <div className="nav-group" style={{ gap: '0.25rem', marginTop: '1.5rem' }}>
                        <div className="nav-group-label" style={{ padding: '0 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            {t('settings.nav.system')}
                        </div>
                        <NavLink to="/settings/system/general" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Settings size={18} />
                            <span className="nav-text">{t('settings.nav.systemConfig')}</span>
                        </NavLink>
                        <NavLink to="/settings/system/license" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <KeySquare size={18} />
                            <span className="nav-text">{t('settings.nav.license')}</span>
                        </NavLink>
                        <NavLink to="/settings/system/modules" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Layers size={18} />
                            <span className="nav-text">{t('settings.nav.modules')}</span>
                        </NavLink>
                        <NavLink to="/settings/system/storage" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Database size={18} />
                            <span className="nav-text">{t('settings.nav.storage')}</span>
                        </NavLink>
                        <NavLink to="/settings/system/smtp" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Mail size={18} />
                            <span className="nav-text">{t('settings.nav.systemNotifications')}</span>
                        </NavLink>
                        <NavLink to="/settings/system/tests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Activity size={18} />
                            <span className="nav-text">{t('settings.nav.trafficReplay')}</span>
                        </NavLink>
                    </div>

                </nav>
            </aside>

            {/* Main Content Area for Settings */}
            <main style={{ flex: 1, background: 'var(--bg-card)', padding: '2rem', overflowY: 'auto' }}>
                <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Universally Visible System Health Panel */}
                    <div className="settings-section health-section" style={{ border: 'none', padding: 0, boxShadow: 'none' }}>
                        <SystemHealthPanel />
                    </div>

                    {/* Active Setting Route Content */}
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default SettingsLayout;
