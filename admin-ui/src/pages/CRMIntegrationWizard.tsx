import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Blocks, ArrowLeft, CheckCircle2, ChevronDown, Cloud, Database, Play, Phone, Loader2, Save, LifeBuoy, Box, MessageSquare, GitBranch } from 'lucide-react';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import api from '../services/api';
import '../styles/dashboard.css';

import { Button } from '../components/ui/button';

const PROVIDER_CONFIG: Record<string, any> = {
    salesforce: {
        name: 'Salesforce',
        icon: <Cloud size={40} />,
        contextIcon: <Cloud size={16} color="#0ea5e9" />,
        color: '#0ea5e9',
        domainPlaceholder: 'e.g., https://acme-corp.my.salesforce.com',
        fields: ['Description', 'Subject', 'Status', 'Custom_Quality_Score__c'],
        bgHighlight: 'rgba(14, 165, 233, 0.1)',
        contextCard: {
            title1: 'Opportunity', value1: 'Enterprise Plan ($50k)',
            title2: 'Stage', value2: 'Negotiation', value2Color: '#eab308',
            contextId: '00Txx00000XyZ12',
            contextType: 'Task'
        },
        logMessage: 'Transcript, summary, and intent synced to Task [00Txx...].'
    },
    zendesk: {
        name: 'Zendesk',
        icon: <LifeBuoy size={40} />,
        contextIcon: <LifeBuoy size={16} color="#03363d" />,
        color: '#03363d',
        domainPlaceholder: 'e.g., https://acme-corp.zendesk.com',
        fields: ['Comment', 'Subject', 'Status', 'Priority', 'Custom_Quality_Score'],
        bgHighlight: 'rgba(3, 54, 61, 0.1)',
        contextCard: {
            title1: 'Recent Ticket', value1: 'Login Issue (#1042)',
            title2: 'Status', value2: 'Open', value2Color: '#ef4444',
            contextId: '#1042',
            contextType: 'Ticket Note'
        },
        logMessage: 'Call notes and CSAT prediction appended to Ticket [#1042].'
    },
    hubspot: {
        name: 'HubSpot',
        icon: <Box size={40} />,
        contextIcon: <Box size={16} color="#ff7a59" />,
        color: '#ff7a59',
        domainPlaceholder: 'e.g., https://app.hubspot.com',
        fields: ['Contact_Notes', 'Deal_Stage', 'Ticket_Status', 'Call_Outcome'],
        bgHighlight: 'rgba(255, 122, 89, 0.1)',
        contextCard: {
            title1: 'Active Deal', value1: 'Q3 License Renewal',
            title2: 'Stage', value2: 'Contract Sent', value2Color: '#8b5cf6',
            contextId: 'Deal 93821',
            contextType: 'Activity'
        },
        logMessage: 'Call outcomes and extracted dates saved to Activity.'
    },
    intercom: {
        name: 'Intercom',
        icon: <MessageSquare size={40} />,
        contextIcon: <MessageSquare size={16} color="#0057ff" />,
        color: '#0057ff',
        domainPlaceholder: 'e.g., https://app.intercom.com',
        fields: ['Conversation_Summary', 'User_Sentiment', 'Tags', 'CSAT_Prediction'],
        bgHighlight: 'rgba(0, 87, 255, 0.1)',
        contextCard: {
            title1: 'Current Segment', value1: 'Premium Users',
            title2: 'Health Score', value2: '92/100', value2Color: '#10b981',
            contextId: 'Conv_#84920',
            contextType: 'Conversation'
        },
        logMessage: 'Summary, sentiment, and tags synced to Conversation.'
    },
    gitlab: {
        name: 'GitLab',
        icon: <GitBranch size={40} />,
        contextIcon: <GitBranch size={16} color="#fc6d26" />,
        color: '#fc6d26',
        domainPlaceholder: 'e.g., https://gitlab.com or self-hosted URL',
        fields: ['Issue_Description', 'Labels', 'Severity_Predict', 'Module_Mentioned'],
        bgHighlight: 'rgba(252, 109, 38, 0.1)',
        contextCard: {
            title1: 'Related Issue', value1: '#321 - API Outage',
            title2: 'Status', value2: 'In Progress', value2Color: '#eab308',
            contextId: 'Issue #322',
            contextType: 'Issue'
        },
        logMessage: 'Bug report and logs drafted into Issue [#322].'
    }
};

const CRMIntegrationWizard: React.FC = () => {
    const { provider } = useParams<{ provider: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [step, setStep] = useState(1);

    const currentProvider = provider ? provider.toLowerCase() : 'salesforce';
    const config = PROVIDER_CONFIG[currentProvider] || PROVIDER_CONFIG['salesforce'];

    // Step 2 state
    const [env, setEnv] = useState('Production');
    const [customDomain, setCustomDomain] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [authMockering, setAuthMockering] = useState(false);
    const [authSuccess, setAuthSuccess] = useState(false);

    // Step 3 state
    const [mappings, setMappings] = useState([
        { cxm: 'Call Transcript (Text)', sf: config.fields[0] },
        { cxm: 'AI Summary (Text)', sf: config.fields[1] },
        { cxm: 'Call Outcome (Picker)', sf: config.fields[2] },
        { cxm: 'Call Quality Score (Number)', sf: config.fields[3] },
    ]);

    // Step 4 state
    const [simulating, setSimulating] = useState(false);
    const [simType, setSimType] = useState<'voice' | 'im'>('voice');
    const [mockContact, setMockContact] = useState('+1 (415) 555-0198');
    const [simStep, setSimStep] = useState<0 | 1 | 2 | 3>(0); // 0: idle, 1: ringing/typing, 2: active, 3: logged


    const handleConnect = async () => {
        if (env !== 'Just Demo' && (!clientId || !clientSecret)) return;
        setAuthMockering(true);

        try {
            // Step 1: Save credentials to backend (MongoDB)
            await api.post(`/integrations/${currentProvider}/credentials`, {
                clientId,
                clientSecret,
                instanceUrl: customDomain || undefined,
                subdomain: customDomain ? customDomain.replace('https://', '').replace('.zendesk.com', '') : undefined,
                environment: env,
            });

            if (env === 'Just Demo') {
                // For demo mode: mock the OAuth flow locally
                setTimeout(() => {
                    setAuthMockering(false);
                    setAuthSuccess(true);
                    setTimeout(() => setStep(3), 1500);
                }, 2000);
            } else {
                // For real environments: redirect to the OAuth authorization page
                // The backend will read clientId from MongoDB and construct the real OAuth URL
                window.location.href = `/api/integrations/${currentProvider}/auth`;
            }
        } catch (error: any) {
            console.error('Failed to save credentials:', error);
            setAuthMockering(false);
            alert(`Failed to save credentials: ${error?.response?.data?.error || error.message}`);
        }
    };

    const handleSimulateCall = () => {
        setSimulating(true);
        setSimStep(1); // Ringing
        setTimeout(() => {
            setSimStep(2); // Active (Data popup)
        }, 3000);
    };

    const handleEndCall = () => {
        setSimStep(3); // Logged
    };

    return (
        <div className="dashboard-content" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Button
                    onClick={() => navigate('/integrations')}
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}
                >
                    <ArrowLeft size={20} />
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: '12px',
                        background: config.bgHighlight, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: config.color
                    }}>
                        {React.cloneElement(config.icon as React.ReactElement<{ className?: string, size?: number }>, { size: 24 })}
                    </div>
                    <h1 className="page-title" style={{ margin: 0 }}>
                        {t('crmWizard.integration', { name: config.name })}
                    </h1>
                </div>
            </div>

            {/* Wizard Progress */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem', padding: '1.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
                {[1, 2, 3, 4].map((s, idx) => (
                    <React.Fragment key={s}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: step >= s ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: step >= s ? 600 : 400
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: step >= s ? 'var(--primary)' : 'var(--bg-sidebar)',
                                color: step >= s ? 'white' : 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.9rem'
                            }}>
                                {step > s ? <CheckCircle2 size={16} /> : s}
                            </div>
                            <span>
                                {s === 1 ? t('crmWizard.stepStart') : s === 2 ? t('crmWizard.stepAuthenticate') : s === 3 ? t('crmWizard.stepMapping') : s === 4 ? t('crmWizard.stepSimulate') : 'Complete'}
                            </span>
                        </div>
                        {idx < 4 && <div style={{ flex: 1, height: 2, background: step > s ? 'var(--primary)' : 'var(--glass-border)' }} />}
                    </React.Fragment>
                ))}
            </div>

            {/* Step 1: Start */}
            {step === 1 && (
                <div className="glass-panel" style={{ padding: '3rem', maxWidth: '900px', margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem', marginBottom: '2rem' }}>
                            <div style={{ width: 80, height: 80, borderRadius: '20px', background: 'var(--bg-sidebar)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src="/cxmi_icon.svg" alt="CXMind" width={48} />
                            </div>
                            <ArrowLeft size={32} style={{ color: 'var(--text-muted)', transform: 'rotate(180deg)' }} />
                            <div style={{ width: 80, height: 80, borderRadius: '20px', background: config.bgHighlight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: config.color }}>
                                {config.icon}
                            </div>
                        </div>
                        <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>{t('crmWizard.connectTitle', { name: config.name })}</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto 3rem auto' }}>
                            {t('crmWizard.connectDesc', { name: config.name })}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '3rem' }}>
                        <div style={{ padding: '1.5rem', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                <Phone size={20} />
                            </div>
                            <h4 style={{ margin: '0 0 0.5rem 0' }}>{t('crmWizard.unifiedContext')}</h4>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                {t('crmWizard.unifiedContextDesc', { name: config.name })}
                            </p>
                        </div>
                        <div style={{ padding: '1.5rem', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                <Save size={20} />
                            </div>
                            <h4 style={{ margin: '0 0 0.5rem 0' }}>{t('crmWizard.autoCallLogging')}</h4>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                {t('crmWizard.autoCallLoggingDesc', { name: config.name })}
                            </p>
                        </div>
                        <div style={{ padding: '1.5rem', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                <Database size={20} />
                            </div>
                            <h4 style={{ margin: '0 0 0.5rem 0' }}>{t('crmWizard.smartFieldUpdates')}</h4>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                {t('crmWizard.smartFieldUpdatesDesc', { name: config.name })}
                            </p>
                        </div>
                        <div style={{ padding: '1.5rem', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                <Blocks size={20} />
                            </div>
                            <h4 style={{ margin: '0 0 0.5rem 0' }}>{t('crmWizard.actionDrafts')}</h4>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                {t('crmWizard.actionDraftsDesc', { name: config.name })}
                            </p>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                        <Button
                            onClick={() => setStep(2)}
                            style={{ padding: '0.75rem 3rem', fontSize: '1.1rem', borderRadius: '30px' }}
                        >
                            {t('crmWizard.beginSetup')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Step 2: Authenticate */}
            {step === 2 && (
                <div className="glass-panel" style={{ padding: '3rem 2rem', maxWidth: '600px', margin: '0 auto' }}>
                    <h3 style={{ marginTop: 0 }}>{t('crmWizard.oauthTitle')}</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: 1.5 }}>
                        {t('crmWizard.oauthDesc', { name: config.name })}
                        Please configure the Callback URL to:
                        <code style={{ display: 'block', background: 'var(--bg-black)', padding: '0.5rem', borderRadius: '4px', marginTop: '0.5rem', color: 'var(--brand-cyan)', fontSize: '0.85rem' }}>
                            {window.location.origin}/api/auth/{provider}/callback
                        </code>
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                        <div className="form-group" style={{ position: 'relative', zIndex: 10 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('crmWizard.environment')}</label>
                            <DropdownMenu
                                trigger={
                                    <Button style={{ width: '100%', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-card)' }} variant="secondary">
                                        {env} <ChevronDown size={16} />
                                    </Button>
                                }
                                items={[
                                    { label: t('crmWizard.production'), onClick: () => setEnv('Production') },
                                    { label: t('crmWizard.sandbox'), onClick: () => setEnv('Sandbox') },
                                    { label: t('crmWizard.justDemo'), onClick: () => setEnv('Just Demo') }
                                ]}
                                align="start"
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {t('crmWizard.customDomain')} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>{t('crmWizard.optional')}</span>
                            </label>
                            <input
                                type="text"
                                value={customDomain}
                                onChange={e => setCustomDomain(e.target.value)}
                                placeholder={config.domainPlaceholder}
                                autoComplete="off"
                                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('crmWizard.clientId')}</label>
                            <input
                                type="text"
                                value={clientId}
                                onChange={e => setClientId(e.target.value)}
                                placeholder={t('crmWizard.clientIdPlaceholder', { name: config.name })}
                                autoComplete="off"
                                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('crmWizard.clientSecret')}</label>
                            <input
                                type="password"
                                value={clientSecret}
                                onChange={e => setClientSecret(e.target.value)}
                                placeholder="••••••••••••••••"
                                autoComplete="new-password"
                                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <Button variant="secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }} onClick={() => setStep(1)}>{t('crmWizard.back')}</Button>
                        </div>
                        <Button
                            onClick={handleConnect}
                            disabled={authMockering || authSuccess || (env !== 'Just Demo' && (!clientId || !clientSecret))}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }}
                        >
                            {authMockering ? <><Loader2 size={16} className="spin" /> {t('crmWizard.connecting')}</>
                                : authSuccess ? <><CheckCircle2 size={16} /> {t('crmWizard.connected')}</>
                                    : env === 'Just Demo' ? t('crmWizard.connectToDemo') : t('crmWizard.signInTo', { name: config.name })}
                        </Button>
                    </div>
                </div>
            )}

            {/* Step 3: Mapping */}
            {step === 3 && (
                <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
                    <h3 style={{ marginTop: 0 }}>{t('crmWizard.dataMappingTitle')}</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                        {t('crmWizard.dataMappingDesc', { name: config.name })}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {mappings.map((mapping, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('crmWizard.cxmOutput')}</span>
                                    {mapping.cxm}
                                </div>
                                <ArrowLeft size={20} style={{ color: 'var(--text-muted)', transform: 'rotate(180deg)' }} />
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('crmWizard.providerField', { name: config.name })}</span>
                                    <DropdownMenu
                                        trigger={
                                            <Button style={{ width: '100%', justifyContent: 'space-between', padding: '0.5rem 1rem', background: 'var(--bg-card)' }} variant="secondary">
                                                {mapping.sf} <ChevronDown size={16} />
                                            </Button>
                                        }
                                        items={config.fields.map((opt: string) => ({
                                            label: opt,
                                            onClick: () => {
                                                const newMappings = [...mappings];
                                                newMappings[idx].sf = opt;
                                                setMappings(newMappings);
                                            }
                                        }))}
                                        align="start"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
                        <Button variant="secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }} onClick={() => setStep(2)}>{t('crmWizard.back')}</Button>
                        <Button style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }} onClick={() => setStep(4)}>{t('crmWizard.saveContinue')}</Button>
                    </div>
                </div>
            )}

            {/* Step 4: Simulator */}
            {step === 4 && (
                <div>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ margin: '0 0 0.5rem 0' }}>{t('crmWizard.simTitle')}</h2>
                        <p style={{ color: 'var(--text-secondary)' }}>{t('crmWizard.simDesc', { name: config.name })}</p>
                    </div>

                    <div style={{ display: 'flex', gap: '2rem', height: '600px', maxWidth: '1000px', margin: '0 auto' }}>
                        {/* Simulation Controls */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="glass-panel" style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', background: 'var(--bg-black)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                                    <Button
                                        style={{
                                            flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: 'none',
                                            background: simType === 'voice' ? 'var(--brand-primary)' : 'transparent',
                                            color: simType === 'voice' ? '#ffffff' : 'var(--text-muted)',
                                            fontWeight: simType === 'voice' ? 600 : 400,
                                            boxShadow: simType === 'voice' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                            cursor: simStep === 0 ? 'pointer' : 'not-allowed'
                                        }}
                                        onClick={() => { if (simStep === 0) setSimType('voice') }}
                                        disabled={simStep !== 0}
                                    >
                                        Voice
                                    </Button>
                                    <Button
                                        style={{
                                            flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: 'none',
                                            background: simType === 'im' ? 'var(--brand-primary)' : 'transparent',
                                            color: simType === 'im' ? '#ffffff' : 'var(--text-muted)',
                                            fontWeight: simType === 'im' ? 600 : 400,
                                            boxShadow: simType === 'im' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                            cursor: simStep === 0 ? 'pointer' : 'not-allowed'
                                        }}
                                        onClick={() => { if (simStep === 0) setSimType('im') }}
                                        disabled={simStep !== 0}
                                    >
                                        {t('crmWizard.imChat')}
                                    </Button>
                                </div>

                                <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                    {simType === 'voice' ? (
                                        <Phone size={48} style={{ color: simulating ? 'var(--success)' : 'var(--text-muted)' }} />
                                    ) : (
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={simulating ? 'var(--brand-cyan)' : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                    )}
                                </div>

                                {simStep === 0 && (
                                    <div style={{ marginBottom: '1.5rem', width: '100%', maxWidth: '300px' }}>
                                        <input
                                            type={simType === 'voice' ? 'tel' : 'email'}
                                            value={mockContact}
                                            onChange={e => setMockContact(e.target.value)}
                                            placeholder={simType === 'voice' ? t('crmWizard.phonePlaceholder') : t('crmWizard.emailPlaceholder')}
                                            style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-black)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', textAlign: 'center', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                )}
                                <h3 style={{ margin: '0 0 0.5rem 0' }}>{t('crmWizard.simController')}</h3>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', minHeight: '44px' }}>
                                    {simStep === 0 ? t('crmWizard.readyToTrigger', { type: simType === 'voice' ? t('crmWizard.voice') : 'chat' })
                                        : simStep === 1 ? (simType === 'voice' ? t('crmWizard.ringingContact', { contact: mockContact }) : t('crmWizard.receivingMsg', { contact: mockContact }))
                                            : simStep === 2 ? t('crmWizard.callInProgress', { type: simType === 'voice' ? 'Call' : 'Chat' })
                                                : t('crmWizard.callEndedLogged', { type: simType === 'voice' ? 'Call' : 'Chat' })}
                                </p>

                                {simStep === 0 && (
                                    <Button style={{ padding: '1rem 3rem', borderRadius: '30px', fontSize: '1.1rem' }} onClick={handleSimulateCall}>
                                        <Play size={18} style={{ marginRight: 8, display: 'inline' }} /> {t('crmWizard.simulateCall', { type: simType === 'voice' ? 'Call' : 'Chat' })}
                                    </Button>
                                )}
                                {simStep === 1 && (
                                    <Button style={{ padding: '1rem 3rem', borderRadius: '30px', fontSize: '1.1rem', borderColor: 'var(--warning)', color: 'var(--warning)' }} variant="secondary">
                                        <Loader2 size={18} className="spin" style={{ marginRight: 8, display: 'inline' }} /> {simType === 'voice' ? t('crmWizard.ringing') : t('crmWizard.chatConnecting')}
                                    </Button>
                                )}
                                {simStep === 2 && (
                                    <Button style={{ padding: '1rem 3rem', borderRadius: '30px', fontSize: '1.1rem', background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleEndCall}>
                                        {t('crmWizard.endCall', { type: simType === 'voice' ? 'Call' : 'Chat' })}
                                    </Button>
                                )}
                                {simStep === 3 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)' }}>
                                            <CheckCircle2 size={20} /> {config.logMessage}
                                        </div>
                                        <Button variant="secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-sm)' }} onClick={() => navigate('/integrations')}>{t('crmWizard.finishWizard')}</Button>
                                    </div>
                                )}    </div>
                        </div>

                        {/* Copilot SidePanel Mock UI */}
                        <div style={{ width: '380px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', position: 'relative' }}>
                            {/* Chrome / Panel Header */}
                            <div style={{ padding: '1rem', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <img src="/cxmi_icon.svg" width={20} alt="" />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t('crmWizard.copilotTitle')}</span>
                                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-light)', padding: '2px 8px', borderRadius: '12px' }}>{t('crmWizard.live')}</span>
                            </div>

                            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {simStep === 0 && (
                                    <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                                        {t('crmWizard.waitingForCall')}
                                    </div>
                                )}
                                {simStep >= 1 && (
                                    <div style={{ background: 'var(--bg-sidebar)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)', animation: 'pulse 2s infinite' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{simType === 'voice' ? t('crmWizard.incomingCall') : t('crmWizard.incomingMessage')}</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {mockContact}
                                            {simType === 'im' && <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--brand-cyan)', marginLeft: '8px' }}>💬 Chat</span>}
                                        </div>
                                    </div>
                                )}

                                {/* CRM Context Card - DYNAMICALLY APPEARS */}
                                {simStep >= 2 && (
                                    <div style={{ background: `linear-gradient(145deg, ${config.bgHighlight} 0%, rgba(14,165,233,0) 100%)`, padding: '1rem', borderRadius: '12px', border: `1px solid ${config.bgHighlight}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                            {config.contextIcon}
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: config.color }}>{t('crmWizard.context', { name: config.name })}</span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-sidebar)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--text-primary)' }}>JD</div>
                                            <div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>John Doe</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>VP of Engineering @ Acme Corp</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                                            <div style={{ background: 'var(--bg-light)', padding: '0.5rem', borderRadius: '6px' }}>
                                                <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{config.contextCard.title1}</div>
                                                <div style={{ color: 'var(--text-primary)' }}>{config.contextCard.value1}</div>
                                            </div>
                                            <div style={{ background: 'var(--bg-light)', padding: '0.5rem', borderRadius: '6px' }}>
                                                <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{config.contextCard.title2}</div>
                                                <div style={{ color: config.contextCard.value2Color }}>{config.contextCard.value2}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {simStep === 3 && (
                                    <div style={{ background: 'rgba(16,185,129,0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem', color: '#10b981', fontSize: '0.85rem' }}>
                                            <CheckCircle2 size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                                            <div>
                                                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t('crmWizard.autoLogged', { name: config.name })}</div>
                                                <div style={{ color: 'var(--text-secondary)' }}>{config.logMessage}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CRMIntegrationWizard;
