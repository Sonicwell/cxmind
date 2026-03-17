import { Select } from '../components/ui/Select';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, CheckCircle2, Loader2, Bug, TicketCheck,
    AlertCircle, ExternalLink, HelpCircle, Info, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import api from '../services/api';
import '../styles/dashboard.css';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

/* ── Provider Config ── */

const TICKET_PROVIDERS: Record<string, {
    name: string;
    icon: React.ReactNode;
    color: string;
    bgHighlight: string;
    i18nPrefix: string;
    helpUrl: string;
}> = {
    jira: {
        name: 'Jira',
        icon: <Bug size={40} />,
        color: '#0052CC',
        bgHighlight: 'rgba(0, 82, 204, 0.1)',
        i18nPrefix: 'integrations.jiraSetup',
        helpUrl: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
    },
    servicenow: {
        name: 'ServiceNow',
        icon: <TicketCheck size={40} />,
        color: '#81b5a1',
        bgHighlight: 'rgba(129, 181, 161, 0.1)',
        i18nPrefix: 'integrations.snSetup',
        helpUrl: 'https://docs.servicenow.com/bundle/tokyo-platform-security/page/administer/users-and-groups/concept/c_Users.html',
    },
};

/* ── Confetti (reuse Webhooks pattern) ── */

function fireConfetti() {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
    document.body.appendChild(container);
    const colors = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
    for (let i = 0; i < 80; i++) {
        const p = document.createElement('div');
        p.style.cssText = `position:absolute;width:8px;height:8px;border-radius:50%;top:-10px;left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation:confetti-fall ${1.5 + Math.random() * 1.5}s ${Math.random() * 0.5}s ease-in forwards;`;
        container.appendChild(p);
    }
    // Add keyframes if not present
    if (!document.getElementById('confetti-style')) {
        const style = document.createElement('style');
        style.id = 'confetti-style';
        style.textContent = `@keyframes confetti-fall { to { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`;
        document.head.appendChild(style);
    }
    setTimeout(() => container.remove(), 3500);
}

/* ── Styles ── */

/* inputStyle removed: Input 组件自带 input-field class 提供等效样式 */

const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)',
    fontSize: '0.9rem', fontWeight: 500,
};

/* ── Main Component ── */

const TicketSetup: React.FC = () => {
    const { provider } = useParams<{ provider: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const provKey = provider?.toLowerCase() || 'jira';
    const config = TICKET_PROVIDERS[provKey];
    if (!config) {
        navigate('/integrations');
        return null;
    }

    const isJira = provKey === 'jira';
    const tp = config.i18nPrefix;

    // Step state
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);

    // Auth state
    const [authMode, setAuthMode] = useState<'token' | 'oauth'>('token');
    const [instanceUrl, setInstanceUrl] = useState('');
    const [email, setEmail] = useState('');
    const [apiToken, setApiToken] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [projectKey, setProjectKey] = useState('');
    const [tableName, setTableName] = useState('incident');
    const [issueType, setIssueType] = useState('Task');

    // Field mapping state
    const [showMappings, setShowMappings] = useState(false);
    const [fieldMappings, setFieldMappings] = useState<{ source: string; target: string; isDefault?: boolean }[]>([]);

    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionResult, setConnectionResult] = useState<{ success: boolean; error?: string } | null>(null);

    // Test ticket state
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        success: boolean; ticketId?: string; ticketUrl?: string; error?: string;
    } | null>(null);

    // #5 UX: Load existing configuration on mount
    useEffect(() => {
        const loadExisting = async () => {
            try {
                const res = await api.get(`/integrations/${provKey}`);
                const data = res.data;
                if (data?.status === 'active' || data?.credentials?.instanceUrl) {
                    setInstanceUrl(data.credentials?.instanceUrl || '');
                    setProjectKey(data.credentials?.projectKey || '');
                    setTableName(data.credentials?.tableName || 'incident');
                    if (isJira) {
                        setEmail(data.credentials?.email || '');
                    } else {
                        setUsername(data.credentials?.username || '');
                    }
                    if (data.status === 'active') {
                        setIsConnected(true);
                    }
                }
            } catch {
                // No existing config — fresh setup
            } finally {
                setLoading(false);
            }
        };
        loadExisting();
    }, [provKey, isJira]);

    // Init default field mappings
    useEffect(() => {
        const defaults = isJira
            ? [
                { source: 'callId', target: 'customfield_10001', isDefault: true },
                { source: 'agentId', target: 'customfield_10002', isDefault: true },
                { source: 'event', target: 'labels', isDefault: true },
            ]
            : [
                { source: 'callId', target: 'u_call_id', isDefault: true },
                { source: 'agentId', target: 'u_agent_id', isDefault: true },
                { source: 'event', target: 'u_event_type', isDefault: true },
            ];
        setFieldMappings(defaults);
    }, [isJira]);

    const canSave = instanceUrl && (
        authMode === 'token'
            ? (isJira ? email && apiToken : username && password)
            : (clientId && clientSecret)
    );

    // #2 UX: Separate Save and Test Connection
    const handleSaveCredentials = async () => {
        setSaving(true);
        setSaveError('');
        setSaveSuccess(false);
        setConnectionResult(null);
        try {
            const body: any = {
                instanceUrl,
                environment: instanceUrl.includes('demo') ? 'Just Demo' : 'Production',
            };
            if (authMode === 'oauth') {
                body.clientId = clientId;
                body.clientSecret = clientSecret;
            } else if (isJira) {
                body.email = email;
                body.apiToken = apiToken;
                body.projectKey = projectKey;
            } else {
                body.username = username;
                body.apiToken = password;
                body.tableName = tableName;
            }
            await api.post(`/integrations/${provKey}/credentials`, body);
            setSaveSuccess(true);
            setIsConnected(true);

            // OAuth mode: redirect to provider auth
            if (authMode === 'oauth') {
                window.location.href = `/api/integrations/${provKey}/auth`;
                return;
            }
        } catch (err: any) {
            setSaveError(err?.response?.data?.error || err.message);
        } finally {
            setSaving(false);
        }
    };

    // #2 UX: Dedicated test connection
    const handleTestConnection = async () => {
        setTestingConnection(true);
        setConnectionResult(null);
        try {
            await api.post(`/integrations/${provKey}/test-ticket`);
            setConnectionResult({ success: true });
            // Auto-advance to step 2 after successful test
            setTimeout(() => setStep(2), 1200);
        } catch (err: any) {
            setConnectionResult({
                success: false,
                error: err?.response?.data?.error || err.message,
            });
        } finally {
            setTestingConnection(false);
        }
    };

    // #3 UX: Step 2 saves projectKey/tableName to backend
    const handleSaveConfig = async () => {
        try {
            const body: any = { instanceUrl };
            if (isJira) {
                body.projectKey = projectKey;
            } else {
                body.tableName = tableName;
            }
            // Include field mappings
            if (fieldMappings.length > 0) {
                body.fieldMappings = fieldMappings.filter(m => m.target);
            }
            await api.post(`/integrations/${provKey}/credentials`, body);
            setStep(3);
        } catch (err: any) {
            setSaveError(err?.response?.data?.error || err.message);
        }
    };

    const handleTestTicket = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await api.post(`/integrations/${provKey}/test-ticket`);
            setTestResult(res.data);
            if (res.data.success) fireConfetti(); // #10 UX: Confetti on success
        } catch (err: any) {
            setTestResult({
                success: false,
                error: err?.response?.data?.error || err.message,
            });
        } finally {
            setTesting(false);
        }
    };

    const isDemo = instanceUrl.includes('demo');

    const stepLabels = isJira
        ? [t(`${tp}.stepAuth`), t(`${tp}.stepProject`), t(`${tp}.stepTest`)]
        : [t(`${tp}.stepAuth`), t(`${tp}.stepTable`), t(`${tp}.stepTest`)];

    if (loading) {
        return (
            <div className="dashboard-content" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                <Loader2 size={24} className="spin" style={{ color: 'var(--text-muted)' }} />
            </div>
        );
    }

    return (
        <div className="dashboard-content" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Button
                    onClick={() => navigate('/integrations')}
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}
                >
                    <ArrowLeft size={20} />
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: '12px',
                        background: config.bgHighlight, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: config.color
                    }}>
                        {React.cloneElement(config.icon as React.ReactElement<{ size?: number }>, { size: 24 })}
                    </div>
                    <div>
                        <h1 className="page-title" style={{ margin: 0 }}>{t(`${tp}.title`)}</h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t(`${tp}.subtitle`)}</p>
                    </div>
                </div>

                {/* #5 UX: Connection status badge */}
                {isConnected && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.35rem 0.75rem', borderRadius: '20px',
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        color: '#10b981', fontSize: '0.8rem', fontWeight: 600,
                    }}>
                        <CheckCircle2 size={14} /> {t(`${tp}.connected`)}
                    </div>
                )}
            </div>

            {/* Progress — #11 UX: responsive overflow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
                {stepLabels.map((label, idx) => {
                    const s = idx + 1;
                    return (
                        <React.Fragment key={s}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                color: step >= s ? 'var(--primary)' : 'var(--text-muted)',
                                fontWeight: step >= s ? 600 : 400,
                                whiteSpace: 'nowrap', minWidth: 0,
                            }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                    background: step >= s ? 'var(--primary)' : 'var(--bg-sidebar)',
                                    color: step >= s ? 'white' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.85rem'
                                }}>
                                    {step > s ? <CheckCircle2 size={16} /> : s}
                                </div>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                            </div>
                            {idx < stepLabels.length - 1 && (
                                <div style={{ flex: 1, height: 2, background: step > s ? 'var(--primary)' : 'var(--glass-border)', minWidth: '20px' }} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* ═══ Step 1: Authentication ═══ */}
            {step === 1 && (
                <div className="glass-panel" style={{ padding: '2.5rem', margin: '0 auto' }}>
                    <h3 style={{ marginTop: 0 }}>{t(`${tp}.authMode`)}</h3>

                    {/* Auth mode selector — both modes now available */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
                        <Button
                            className={authMode === 'token' ? 'btn-primary' : 'btn-secondary'}
                            onClick={() => setAuthMode('token')}
                            style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}
                        >
                            {isJira ? t(`${tp}.apiToken`) : t(`${tp}.basicAuth`)}
                        </Button>
                        <Button
                            className={authMode === 'oauth' ? 'btn-primary' : 'btn-secondary'}
                            onClick={() => setAuthMode('oauth')}
                            style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-sm)', position: 'relative' }}
                        >
                            {t(`${tp}.oauth`)}
                        </Button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                        <div className="form-group">
                            <label style={labelStyle}>{t(`${tp}.instanceUrl`)}</label>
                            <Input
                                type="url" value={instanceUrl} onChange={e => setInstanceUrl(e.target.value)}
                                placeholder={t(`${tp}.instanceUrlPlaceholder`)}
                                autoComplete="off"
                            />
                        </div>

                        {authMode === 'token' && isJira && (
                            <>
                                <div className="form-group">
                                    <label style={labelStyle}>{t(`${tp}.email`)}</label>
                                    <Input
                                        type="email" value={email} onChange={e => setEmail(e.target.value)}
                                        placeholder={t(`${tp}.emailPlaceholder`)}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={labelStyle}>
                                        {t(`${tp}.apiTokenLabel`)}
                                        {/* #8 UX: Help link */}
                                        <a
                                            href={config.helpUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ marginLeft: '0.5rem', color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'none' }}
                                        >
                                            <HelpCircle size={14} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                                            {t(`${tp}.howToGenerate`)}
                                        </a>
                                    </label>
                                    <Input
                                        type="password" value={apiToken} onChange={e => setApiToken(e.target.value)}
                                        placeholder={t(`${tp}.apiTokenPlaceholder`)}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </>
                        )}

                        {authMode === 'token' && !isJira && (
                            <>
                                <div className="form-group">
                                    <label style={labelStyle}>{t(`${tp}.username`)}</label>
                                    <Input
                                        type="text" value={username} onChange={e => setUsername(e.target.value)}
                                        placeholder={t(`${tp}.usernamePlaceholder`)}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={labelStyle}>
                                        {t(`${tp}.password`)}
                                        <a
                                            href={config.helpUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ marginLeft: '0.5rem', color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'none' }}
                                        >
                                            <HelpCircle size={14} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                                            {t(`${tp}.howToGenerate`)}
                                        </a>
                                    </label>
                                    <Input
                                        type="password" value={password} onChange={e => setPassword(e.target.value)}
                                        placeholder={t(`${tp}.passwordPlaceholder`)}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </>
                        )}

                        {authMode === 'oauth' && (
                            <>
                                <div className="form-group">
                                    <label style={labelStyle}>{t('crmWizard.clientId')}</label>
                                    <Input
                                        type="text" value={clientId} onChange={e => setClientId(e.target.value)}
                                        placeholder={t('crmWizard.clientIdPlaceholder', { name: config.name })}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={labelStyle}>{t('crmWizard.clientSecret')}</label>
                                    <Input
                                        type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Error display */}
                    {saveError && (
                        <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-sm)', color: '#ef4444', marginBottom: '1.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertCircle size={16} /> {saveError}
                        </div>
                    )}

                    {/* Connection test result */}
                    {connectionResult && (
                        <div style={{
                            padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', fontSize: '0.9rem',
                            background: connectionResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: connectionResult.success ? '#10b981' : '#ef4444',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}>
                            {connectionResult.success
                                ? <><CheckCircle2 size={16} /> {t(`${tp}.connectionSuccess`)}</>
                                : <><AlertCircle size={16} /> {connectionResult.error}</>
                            }
                        </div>
                    )}

                    {/* #2 UX: Separated Save + Test buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        {!saveSuccess ? (
                            <Button
                                onClick={handleSaveCredentials}
                                disabled={!canSave || saving}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', borderRadius: 'var(--radius-sm)' }}
                            >
                                {saving
                                    ? <><Loader2 size={16} className="spin" /> {t(`${tp}.saving`)}...</>
                                    : t(`${tp}.saveCredentials`)}
                            </Button>
                        ) : (
                            <Button
                                onClick={handleTestConnection}
                                disabled={testingConnection}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', borderRadius: 'var(--radius-sm)' }}
                            >
                                {testingConnection
                                    ? <><Loader2 size={16} className="spin" /> {t(`${tp}.testing`)}...</>
                                    : connectionResult?.success
                                        ? <><CheckCircle2 size={16} /> {t(`${tp}.connected`)}</>
                                        : t(`${tp}.testConnection`)}
                            </Button>
                        )}
                    </div>
                </div>
            )
            }

            {/* ═══ Step 2: Project / Table Config ═══ */}
            {
                step === 2 && (
                    <div className="glass-panel" style={{ padding: '2.5rem', margin: '0 auto' }}>
                        <h3 style={{ marginTop: 0 }}>{isJira ? t(`${tp}.projectConfig`) : t(`${tp}.tableConfig`)}</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                            {isJira ? (
                                <>
                                    <div className="form-group">
                                        <label style={labelStyle}>
                                            {t(`${tp}.projectKey`)}
                                            {/* #9 UX: Tooltip for projectKey */}
                                            <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>
                                                <Info size={13} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                                                {t(`${tp}.projectKeyHint`)}
                                            </span>
                                        </label>
                                        <Input
                                            type="text" value={projectKey} onChange={e => setProjectKey(e.target.value.toUpperCase())}
                                            placeholder={t(`${tp}.projectKeyPlaceholder`)}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label style={labelStyle}>{t(`${tp}.issueType`)}</label>
                                        <Select
                                            value={issueType}
                                            onChange={e => setIssueType(e.target.value)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <option value="Task">Task</option>
                                            <option value="Bug">Bug</option>
                                            <option value="Story">Story</option>
                                            <option value="Epic">Epic</option>
                                        </Select>
                                    </div>
                                </>
                            ) : (
                                <div className="form-group">
                                    <label style={labelStyle}>{t(`${tp}.tableName`)}</label>
                                    <Select
                                        value={tableName}
                                        onChange={e => setTableName(e.target.value)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <option value="incident">Incident</option>
                                        <option value="sc_request">Service Request</option>
                                        <option value="problem">Problem</option>
                                        <option value="change_request">Change Request</option>
                                    </Select>
                                </div>
                            )}
                        </div>

                        {/* Phase 4: Field Mapping — collapsible panel */}
                        <div style={{
                            marginTop: '1.5rem', border: '1px solid var(--glass-border)',
                            borderRadius: 'var(--radius-md)', overflow: 'hidden',
                        }}>
                            <Button
                                onClick={() => setShowMappings(!showMappings)}
                                style={{
                                    width: '100%', padding: '0.85rem 1.25rem', background: 'var(--bg-sidebar)',
                                    border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    fontSize: '0.9rem', fontWeight: 500,
                                }}
                            >
                                <span>⚙️ Advanced: Field Mapping</span>
                                {showMappings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </Button>
                            {showMappings && (
                                <div style={{ padding: '1.25rem', background: 'var(--bg-card)' }}>
                                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Map CXMind fields to {config.name} fields. Default mappings are pre-configured.
                                    </p>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <div style={{ flex: 1 }}>CXMind Field</div>
                                        <div style={{ width: 20 }} />
                                        <div style={{ flex: 1 }}>{config.name} Field</div>
                                        <div style={{ width: 28 }} />
                                    </div>
                                    {fieldMappings.map((m, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <Select
                                                value={m.source}
                                                onChange={e => {
                                                    const updated = [...fieldMappings];
                                                    updated[idx] = { ...updated[idx], source: e.target.value };
                                                    setFieldMappings(updated);
                                                }}
                                                style={{ flex: 1, padding: '0.5rem' }}
                                            >
                                                <option value="callId">Call ID</option>
                                                <option value="agentId">Agent ID</option>
                                                <option value="event">Event Type</option>
                                                <option value="summary">Summary</option>
                                                <option value="priority">Priority</option>
                                                <option value="description">Description</option>
                                            </Select>
                                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                                            <Input
                                                type="text"
                                                value={m.target}
                                                onChange={e => {
                                                    const updated = [...fieldMappings];
                                                    updated[idx] = { ...updated[idx], target: e.target.value, isDefault: false };
                                                    setFieldMappings(updated);
                                                }}
                                                placeholder={isJira ? 'customfield_10001' : 'u_field_name'}
                                                style={{ flex: 1, padding: '0.5rem' }}
                                            />
                                            <Button
                                                onClick={() => setFieldMappings(fieldMappings.filter((_, i) => i !== idx))}
                                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        onClick={() => setFieldMappings([...fieldMappings, { source: 'callId', target: '' }])}
                                        className="btn-secondary"
                                        style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', marginTop: '0.5rem' }}
                                    >
                                        + Add Mapping
                                    </Button>
                                </div>
                            )}
                        </div>

                        {saveError && (
                            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-sm)', color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                {saveError}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                            <Button variant="secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }} onClick={() => { setStep(1); setSaveError(''); }}>
                                {t('crmWizard.back')}
                            </Button>
                            {/* #3 UX: Actually save config to backend */}
                            <Button style={{ padding: '0.75rem 2rem', borderRadius: 'var(--radius-sm)' }} onClick={handleSaveConfig}>
                                {t('crmWizard.saveContinue')}
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* ═══ Step 3: Test Ticket ═══ */}
            {
                step === 3 && (
                    <div className="glass-panel" style={{ padding: '2.5rem', margin: '0 auto', textAlign: 'center' }}>
                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: config.bgHighlight, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 1.5rem auto', color: config.color
                            }}>
                                {config.icon}
                            </div>
                            <h3 style={{ margin: '0 0 0.5rem 0' }}>{t(`${tp}.createTestTicket`)}</h3>
                            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                                {isJira
                                    ? `Project: ${projectKey || 'default'} · Issue Type: ${issueType}`
                                    : `Table: ${tableName} · Instance: ${instanceUrl}`
                                }
                            </p>
                        </div>

                        <Button
                            onClick={handleTestTicket}
                            disabled={testing}
                            style={{ padding: '1rem 3rem', borderRadius: '30px', fontSize: '1.05rem', marginBottom: '2rem' }}
                        >
                            {testing ? <><Loader2 size={16} className="spin" /> {t(`${tp}.testing`)}</>
                                : t(`${tp}.createTestTicket`)}
                        </Button>

                        {testResult && (
                            <div style={{
                                padding: '1.25rem', borderRadius: 'var(--radius-md)',
                                background: testResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                textAlign: 'left', marginBottom: '1.5rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    {testResult.success
                                        ? <><CheckCircle2 size={18} color="#10b981" /> <strong style={{ color: '#10b981' }}>{t(`${tp}.connected`)}</strong></>
                                        : <><AlertCircle size={18} color="#ef4444" /> <strong style={{ color: '#ef4444' }}>Error</strong></>
                                    }
                                </div>
                                {testResult.success ? (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        {t(`${tp}.testTicketCreated`, { ticketId: testResult.ticketId })}
                                        {/* #4 UX: Hide external link in demo mode */}
                                        {testResult.ticketUrl && !isDemo && (
                                            <a
                                                href={testResult.ticketUrl} target="_blank" rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '0.5rem', color: config.color }}
                                            >
                                                <ExternalLink size={14} /> Open
                                            </a>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>{testResult.error}</div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                            <Button variant="secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }} onClick={() => setStep(2)}>
                                {t('crmWizard.back')}
                            </Button>
                            <Button variant="secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }} onClick={() => navigate('/integrations')}>
                                {t('crmWizard.finishWizard')}
                            </Button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default TicketSetup;
