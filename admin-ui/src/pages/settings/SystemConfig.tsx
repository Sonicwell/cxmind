/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from "../../components/ui/input";
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Save, Loader2, Zap, Server, Mail, Settings as SettingsIcon, BrainCircuit } from 'lucide-react';

import { Button } from '../../components/ui/button';

interface InfrastructureConfig {
    goServiceUrl: string;
    appNodeInternalUrl: string;
    serServiceUrl: string;
    hepPort: string;
    hepAuthToken: string;
}

interface PlatformSettings {
    sysConfig?: {
        maintenanceMode: boolean;
        debugLogging: boolean;
    };
    infrastructure?: InfrastructureConfig;
    smtp?: {
        enabled: boolean;
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
        from: string;
    };
    aiConfig?: {
        autoProfileGenerationThreshold: number;
    };
}

const SystemConfig: React.FC = () => {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<PlatformSettings>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Testing states
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; error?: string } | null>(null);
    const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);
    const [endpointTestResult, setEndpointTestResult] = useState<{ service: string; ok: boolean; text: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const response = await api.get('/platform/settings');
            const data = response.data.data;

            // Initialize infrastructure if missing
            if (!data.infrastructure) {
                data.infrastructure = {
                    goServiceUrl: 'http://localhost:8081',
                    appNodeInternalUrl: 'http://localhost:3000',
                    serServiceUrl: 'http://localhost:8000'
                };
            }
            if (!data.infrastructure.serServiceUrl) {
                data.infrastructure.serServiceUrl = 'http://localhost:8000';
            }
            // Initialize sysConfig if missing
            if (!data.sysConfig) {
                data.sysConfig = {
                    maintenanceMode: false,
                    debugLogging: false
                };
            }

            // Map backend's systemEmail to frontend's smtp state
            if (data.systemEmail) {
                data.smtp = {
                    enabled: data.systemEmail.provider === 'smtp',
                    host: data.systemEmail.host || '',
                    port: data.systemEmail.port || 465,
                    secure: data.systemEmail.secure ?? true,
                    user: data.systemEmail.user || '',
                    pass: data.systemEmail.pass || '',
                    from: data.systemEmail.fromAddress || ''
                };
            } else if (!data.smtp) {
                data.smtp = { enabled: false, host: '', port: 465, secure: true, user: '', pass: '', from: '' };
            }

            setSettings(data);
        } catch (error) {
            console.error('Failed to fetch settings', error);
            setMessage({ type: 'error', text: t('systemConfig.loadFailed') });
        } finally {
            setLoading(false);
        }
    };

    const handleNestedChange = (parentKey: keyof PlatformSettings, childKey: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            [parentKey]: {
                ...(prev[parentKey] as any),
                [childKey]: value,
            },
        }));
    };

    const testInternalEndpoint = async (serviceName: 'go' | 'app-node' | 'ser', urlToTest: string) => {
        if (!urlToTest) {
            setEndpointTestResult({ service: serviceName, ok: false, text: t('systemConfig.urlRequired') });
            return;
        }
        setTestingEndpoint(serviceName);
        setEndpointTestResult(null);
        try {
            const res = await api.post('/platform/settings/internal-service/test', {
                service: serviceName,
                url: urlToTest
            });
            if (res.data.ok) {
                setEndpointTestResult({ service: serviceName, ok: true, text: res.data.message || t('systemConfig.connected') });
            } else {
                setEndpointTestResult({ service: serviceName, ok: false, text: res.data.message || t('systemConfig.connectionFailed') });
            }
        } catch (error: any) {
            setEndpointTestResult({ service: serviceName, ok: false, text: error.response?.data?.message || t('systemConfig.requestFailed') });
        } finally {
            setTestingEndpoint(null);
        }
        setTimeout(() => setEndpointTestResult(null), 6000);
    };

    const handleTestSmtp = async () => {
        if (!settings.smtp?.host || !settings.smtp?.user) return;
        setTestingSmtp(true);
        setSmtpTestResult(null);
        try {
            const res = await api.post('/platform/settings/system-email/test', settings.smtp);
            if (res.data.ok) {
                setSmtpTestResult({ success: true });
            } else {
                setSmtpTestResult({ success: false, error: res.data.message || 'Connection failed' });
            }
        } catch (err: any) {
            setSmtpTestResult({ success: false, error: err.response?.data?.error || err.message });
        } finally {
            setTestingSmtp(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            // Map UI 'smtp' representation back to backend 'systemEmail' model structure
            const systemEmailPayload = settings.smtp ? {
                provider: settings.smtp.enabled ? 'smtp' : 'mock',
                host: settings.smtp.host,
                port: settings.smtp.port,
                secure: settings.smtp.secure,
                user: settings.smtp.user,
                pass: settings.smtp.pass,
                fromAddress: settings.smtp.from
            } : undefined;

            const updates: Partial<PlatformSettings> & { systemEmail?: any } = {
                sysConfig: settings.sysConfig,
                infrastructure: settings.infrastructure,
                systemEmail: systemEmailPayload,
            };

            await api.patch('/platform/settings', updates);
            setMessage({ type: 'success', text: t('systemConfig.saveSuccess') });
        } catch (error) {
            console.error('Failed to save system settings', error);
            setMessage({ type: 'error', text: t('systemConfig.saveFailed') });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500"><Loader2 className="animate-spin mx-auto mb-2" /> {t('systemConfig.loading')}</div>;
    }

    return (
        <div className="settings-page max-w-5xl mx-auto p-6 space-y-8">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold mb-2">{t('systemConfig.title')}</h1>
                    <p className="text-gray-500">{t('systemConfig.subtitle')}</p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? t('settingsPage.saving') : t('settingsPage.saveSettings')}
                </Button>
            </div>

            {message && (
                <div style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    background: message.type === 'success' ? 'hsla(150, 60%, 50%, 0.1)' : 'hsla(0, 60%, 50%, 0.1)',
                    border: `1px solid ${message.type === 'success' ? 'hsla(150, 60%, 50%, 0.3)' : 'hsla(0, 60%, 50%, 0.3)'}`,
                    color: message.type === 'success' ? 'hsl(150, 60%, 35%)' : 'hsl(0, 60%, 40%)',
                    marginBottom: '1rem',
                }}>
                    {message.text}
                </div>
            )}

            {/* Platform Settings Section */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <SettingsIcon size={24} color="var(--primary)" />
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('systemConfig.globalOptions')}</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.02)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                            <Checkbox
                                checked={settings.sysConfig?.maintenanceMode || false}
                                onChange={e => handleNestedChange('sysConfig', 'maintenanceMode', e.target.checked)}
                            />
                            <span style={{ fontWeight: 600 }}>{t('systemConfig.maintenanceMode')}</span>
                        </label>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', paddingLeft: '1.75rem' }}>
                            {t('systemConfig.maintenanceModeDesc')}
                        </p>
                    </div>

                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.02)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                            <Checkbox
                                checked={settings.sysConfig?.debugLogging || false}
                                onChange={e => handleNestedChange('sysConfig', 'debugLogging', e.target.checked)}
                            />
                            <span style={{ fontWeight: 600 }}>{t('systemConfig.debugLogging')}</span>
                        </label>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', paddingLeft: '1.75rem' }}>
                            {t('systemConfig.debugLoggingDesc')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Internal Infrastructure Configuration */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <Server size={24} color="var(--info)" />
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('systemConfig.infrastructure')}</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', position: 'relative' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>{t('systemConfig.goServiceUrl')}</label>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t('systemConfig.goServiceUrlDesc')}</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Input
                                    value={settings.infrastructure?.goServiceUrl || ''}
                                    onChange={e => handleNestedChange('infrastructure', 'goServiceUrl', e.target.value)}
                                    placeholder="http://localhost:8081"
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }}
                                />
                                <Button className="-outline" onClick={() => testInternalEndpoint('go', settings.infrastructure?.goServiceUrl || '')} disabled={testingEndpoint === 'go'}>
                                    {testingEndpoint === 'go' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}   {t('systemConfig.testBtn')}
                                </Button>
                            </div>
                            {endpointTestResult?.service === 'go' && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: endpointTestResult.ok ? 'hsl(150, 60%, 40%)' : 'var(--danger)' }}>
                                    {endpointTestResult.ok ? '✅ ' : '❌ '} {endpointTestResult.text}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', position: 'relative' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>{t('systemConfig.appNodeUrl')}</label>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t('systemConfig.appNodeUrlDesc')}</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Input
                                    value={settings.infrastructure?.appNodeInternalUrl || ''}
                                    onChange={e => handleNestedChange('infrastructure', 'appNodeInternalUrl', e.target.value)}
                                    placeholder="http://localhost:3000"
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }}
                                />
                                <Button className="-outline" onClick={() => testInternalEndpoint('app-node', settings.infrastructure?.appNodeInternalUrl || '')} disabled={testingEndpoint === 'app-node'}>
                                    {testingEndpoint === 'app-node' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}   {t('systemConfig.testBtn')}
                                </Button>
                            </div>
                            {endpointTestResult?.service === 'app-node' && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: endpointTestResult.ok ? 'hsl(150, 60%, 40%)' : 'var(--danger)' }}>
                                    {endpointTestResult.ok ? '✅ ' : '❌ '} {endpointTestResult.text}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', position: 'relative' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>{t('systemConfig.serServiceUrl')}</label>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t('systemConfig.serServiceUrlDesc')}</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Input
                                    value={settings.infrastructure?.serServiceUrl || ''}
                                    onChange={e => handleNestedChange('infrastructure', 'serServiceUrl', e.target.value)}
                                    placeholder="http://localhost:8000"
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }}
                                />
                                <Button className="-outline" onClick={() => testInternalEndpoint('ser', settings.infrastructure?.serServiceUrl || '')} disabled={testingEndpoint === 'ser'}>
                                    {testingEndpoint === 'ser' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}   {t('systemConfig.testBtn')}
                                </Button>
                            </div>
                            {endpointTestResult?.service === 'ser' && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: endpointTestResult.ok ? 'hsl(150, 60%, 40%)' : 'var(--danger)' }}>
                                    {endpointTestResult.ok ? '✅ ' : '❌ '} {endpointTestResult.text}
                                </div>
                            )}
                        </div>
                    </div>


                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem', marginTop: '1.5rem' }}>
                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>{t('systemConfig.hepPort')}</label>
                        <Input
                            type="number"
                            value={settings.infrastructure?.hepPort || ''}
                            onChange={e => handleNestedChange('infrastructure', 'hepPort', e.target.value)}
                            placeholder="9060"
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }}
                        />
                    </div>
                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>{t('systemConfig.hepAuthToken')}</label>
                        <Input
                            type="password"
                            value={settings.infrastructure?.hepAuthToken || ''}
                            onChange={e => handleNestedChange('infrastructure', 'hepAuthToken', e.target.value)}
                            placeholder="Optional authentication token"
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }}
                        />
                    </div>
                </div>
            </div>

            {/* Email Provider Section */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <Mail size={24} color="var(--primary)" />
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('settingsPage.smtp.title')}</h2>
                </div>

                <div style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', border: `1px solid ${settings.smtp?.enabled ? 'hsl(210, 60%, 50%)' : 'var(--glass-border)'}`, background: settings.smtp?.enabled ? 'hsla(210, 80%, 50%, 0.04)' : 'rgba(0,0,0,0.02)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
                        <Checkbox checked={settings.smtp?.enabled || false} onChange={e => handleNestedChange('smtp', 'enabled', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'hsl(210, 60%, 50%)' }} />
                        <span style={{ fontWeight: 600, fontSize: '1rem' }}>{t('settingsPage.smtp.enable')}</span>
                    </label>

                    {settings.smtp?.enabled && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.smtp.host')}</label>
                                <Input value={settings.smtp.host || ''} onChange={e => handleNestedChange('smtp', 'host', e.target.value)} placeholder="smtp.example.com" style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.smtp.port')}</label>
                                <Input type="number" value={settings.smtp.port || 465} onChange={e => handleNestedChange('smtp', 'port', parseInt(e.target.value))} style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <Checkbox checked={settings.smtp.secure ?? true} onChange={e => handleNestedChange('smtp', 'secure', e.target.checked)} />
                                    <span style={{ fontSize: '0.85rem' }}>{t('settingsPage.smtp.secure')}</span>
                                </label>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.smtp.user')}</label>
                                <Input value={settings.smtp.user || ''} onChange={e => handleNestedChange('smtp', 'user', e.target.value)} placeholder="user@example.com" autoComplete="off" style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.smtp.password')}</label>
                                <Input type="password" value={settings.smtp.pass || ''} onChange={e => handleNestedChange('smtp', 'pass', e.target.value)} placeholder="••••••••" autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.smtp.from')}</label>
                                <Input value={settings.smtp.from || ''} onChange={e => handleNestedChange('smtp', 'from', e.target.value)} placeholder="CXMind <noreply@example.com>" style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }} />
                            </div>

                            <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                                <Button className="-outline" onClick={handleTestSmtp} disabled={testingSmtp || !settings.smtp.host} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 1rem' }}>
                                    {testingSmtp ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} {t('settingsPage.smtp.test')}
                                </Button>
                                {smtpTestResult && (
                                    <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: smtpTestResult.success ? 'hsl(150, 60%, 40%)' : 'var(--danger)' }}>
                                        {smtpTestResult.success ? `✅ ${t('systemConfig.smtpSuccess')}` : `❌ ${smtpTestResult.error}`}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* AI Architecture Definitions & Parameters */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <BrainCircuit size={24} color="var(--primary)" />
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('systemConfig.aiArchitecture')}</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem' }}>

                    {/* Brief Explanation */}
                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Zap size={16} color="var(--warning)" />
                            {t('systemConfig.contextBrief')}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                            {t('systemConfig.contextBriefDesc')}
                        </p>
                    </div>

                    {/* Profile Explanation */}
                    <div style={{ padding: '1.25rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <SettingsIcon size={16} color="var(--success)" />
                            {t('systemConfig.aiProfile')}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '1rem' }}>
                            {t('systemConfig.aiProfileDesc')}
                        </p>
                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>{t('systemConfig.autoGenThreshold')}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Input
                                    type="number"
                                    value={settings.aiConfig?.autoProfileGenerationThreshold ?? 0}
                                    readOnly
                                    className="input" style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-card-hover)', color: 'var(--text-secondary)', cursor: 'not-allowed' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {t('systemConfig.configuredViaYaml')} {settings.aiConfig?.autoProfileGenerationThreshold === 0 ? t('systemConfig.thresholdDisabled') : t('systemConfig.thresholdActive')}
                                </span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
};

export default SystemConfig;
