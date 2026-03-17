import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Blocks, Search, ArrowRight, CheckCircle2, Cloud, Database, MessageSquare, GitBranch, Bug, TicketCheck } from 'lucide-react';
import { STORAGE_KEYS } from '../constants/storage-keys';
import '../styles/dashboard.css';

interface AppCardProps {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    status: 'connected' | 'not_connected' | 'coming_soon';
    tags: string[];
    onClick: () => void;
    t: (key: string) => string;
}

const AppCard: React.FC<AppCardProps> = ({ name, description, icon, status, tags, onClick, t }) => {
    return (
        <div
            className="stat-card glass-panel"
            style={{
                cursor: status === 'coming_soon' ? 'not-allowed' : 'pointer',
                opacity: status === 'coming_soon' ? 0.7 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative',
                overflow: 'hidden'
            }}
            onClick={() => status !== 'coming_soon' && onClick()}
        >
            {status === 'connected' && (
                <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> {t('integrations.connected')}
                </div>
            )}
            {status === 'coming_soon' && (
                <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, background: 'var(--bg-highlight)', padding: '2px 8px', borderRadius: '12px' }}>
                    {t('integrations.comingSoon')}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    background: 'var(--bg-highlight)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)',
                    flexShrink: 0
                }}>
                    {icon}
                </div>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{name}</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</p>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem' }}>
                {tags.map(tag => (
                    <span key={tag} style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'var(--bg-highlight)',
                        color: 'var(--text-secondary)'
                    }}>
                        {tag}
                    </span>
                ))}
            </div>

            {status !== 'coming_soon' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 500 }}>
                    {status === 'connected' ? t('integrations.configure') : t('integrations.connect')} <ArrowRight size={16} />
                </div>
            )}
        </div>
    );
};

const Integrations: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [integrationsStatus, setIntegrationsStatus] = useState<Record<string, 'connected' | 'not_connected'>>({});

    React.useEffect(() => {
        const fetchIntegrations = async () => {
            try {
                // Fetch from the API we just created
                const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
                if (!token) return;

                const response = await fetch('/api/integrations', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    const statusMap: Record<string, 'connected' | 'not_connected'> = {};
                    data.data.forEach((intg: any) => {
                        if (intg.status === 'active') {
                            statusMap[intg.provider] = 'connected';
                        }
                    });
                    setIntegrationsStatus(statusMap);
                }
            } catch (error) {
                console.error("Failed to fetch integrations", error);
            }
        };
        fetchIntegrations();
    }, []);

    const baseApps = [
        {
            id: 'salesforce',
            name: 'Salesforce',
            description: t('integrations.salesforceDesc'),
            icon: <Cloud size={24} />,
            tags: ['CRM', 'Sync', 'Context'],
        },
        {
            id: 'zendesk',
            name: 'Zendesk',
            description: t('integrations.zendeskDesc'),
            icon: <Database size={24} />,
            tags: ['Support', 'Tickets'],
        },
        {
            id: 'hubspot',
            name: 'HubSpot',
            description: t('integrations.hubspotDesc'),
            icon: <Blocks size={24} />,
            tags: ['Marketing', 'Sales'],
        },
        {
            id: 'jira',
            name: 'Jira',
            description: t('integrations.jiraDesc'),
            icon: <Bug size={24} />,
            tags: ['Ticketing', 'ITSM', 'Tracking'],
        },
        {
            id: 'servicenow',
            name: 'ServiceNow',
            description: t('integrations.servicenowDesc'),
            icon: <TicketCheck size={24} />,
            tags: ['Ticketing', 'ITSM', 'Enterprise'],
        },
        {
            id: 'intercom',
            name: 'Intercom',
            description: t('integrations.intercomDesc'),
            icon: <MessageSquare size={24} />,
            tags: ['Chat', 'Support', 'Messaging'],
        },
        {
            id: 'gitlab',
            name: 'GitLab',
            description: t('integrations.gitlabDesc'),
            icon: <GitBranch size={24} />,
            tags: ['DevOps', 'Tracking', 'Issues'],
        }
    ];

    const apps = baseApps.map(app => ({
        ...app,
        status: integrationsStatus[app.id] || 'not_connected'
    }));

    const filteredApps = apps.filter(app => app.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="dashboard-content" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <div className="section-header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Blocks className="title-icon" />
                        {t('integrations.title')}
                    </h1>
                    <p className="page-subtitle">{t('integrations.subtitle')}</p>
                </div>
            </div>

            <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                    <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder={t('integrations.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem 1rem 0.75rem 2.5rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--glass-border)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            outline: 'none'
                        }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {filteredApps.map(app => (
                    <AppCard
                        key={app.id}
                        {...app}
                        t={t}
                        onClick={() => {
                            navigate(`/integrations/${app.id}`);
                        }}
                    />
                ))}
            </div>

            {filteredApps.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                    <Blocks size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>{t('integrations.noResults', { query: searchQuery })}</p>
                </div>
            )}
        </div>
    );
};

export default Integrations;
