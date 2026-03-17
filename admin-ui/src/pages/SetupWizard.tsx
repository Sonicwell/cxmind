import { Checkbox } from '../components/ui/Checkbox';
import { Select } from '../components/ui/Select';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Globe, Building2, Lock, Puzzle, Rocket,
    ChevronRight, ChevronLeft, Check, RefreshCcw,
    LayoutDashboard, Headphones, Phone, Activity,
    Users, Settings as SettingsIcon, BookUser, Bell,
    TrendingUp, Coins, CalendarClock, Map as MapIcon,
    MessageSquare, Webhook, ClipboardCheck, Zap,
    Shield, Sparkles, AlertTriangle, Mail
} from 'lucide-react';
import api from '../services/api';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import './SetupWizard.css';

import { Button } from '../components/ui/button';

const LANGUAGES = [
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'ko', label: '한국어', flag: '🇰🇷' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
];

const TIMEZONES = [
    'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Australia/Sydney', 'Asia/Dubai', 'Asia/Kolkata',
    'UTC',
];

interface ModuleDef {
    slug: string;
    tier: 'core' | 'optional';
    enabled: boolean;
    icon: React.ReactNode;
    group: string;
}

const MODULE_DEFS: ModuleDef[] = [
    { slug: 'dashboard', tier: 'core', enabled: true, icon: <LayoutDashboard size={18} />, group: 'core' },
    { slug: 'monitoring', tier: 'core', enabled: true, icon: <Headphones size={18} />, group: 'core' },
    { slug: 'calls', tier: 'core', enabled: true, icon: <Phone size={18} />, group: 'core' },
    { slug: 'call_events', tier: 'core', enabled: true, icon: <Activity size={18} />, group: 'core' },
    { slug: 'users', tier: 'core', enabled: true, icon: <Users size={18} />, group: 'core' },
    { slug: 'agents', tier: 'core', enabled: true, icon: <Headphones size={18} />, group: 'core' },
    { slug: 'settings', tier: 'core', enabled: true, icon: <SettingsIcon size={18} />, group: 'core' },
    { slug: 'contacts', tier: 'optional', enabled: true, icon: <BookUser size={18} />, group: 'operations' },
    { slug: 'alerts', tier: 'optional', enabled: true, icon: <Bell size={18} />, group: 'operations' },
    { slug: 'analytics', tier: 'optional', enabled: true, icon: <TrendingUp size={18} />, group: 'intelligence' },
    { slug: 'roi', tier: 'optional', enabled: false, icon: <Coins size={18} />, group: 'intelligence' },
    { slug: 'wfm', tier: 'optional', enabled: false, icon: <CalendarClock size={18} />, group: 'operations' },
    { slug: 'agent_map', tier: 'optional', enabled: false, icon: <MapIcon size={18} />, group: 'operations' },
    { slug: 'inbox', tier: 'optional', enabled: false, icon: <MessageSquare size={18} />, group: 'communication' },
    { slug: 'webhooks', tier: 'optional', enabled: false, icon: <Webhook size={18} />, group: 'communication' },
    { slug: 'qi', tier: 'optional', enabled: false, icon: <ClipboardCheck size={18} />, group: 'compliance' },
    { slug: 'action_center', tier: 'optional', enabled: false, icon: <Zap size={18} />, group: 'intelligence' },
    { slug: 'audit', tier: 'optional', enabled: false, icon: <Shield size={18} />, group: 'compliance' },
    { slug: 'demo', tier: 'optional', enabled: true, icon: <Sparkles size={18} />, group: 'operations' },
];

const MODULE_GROUPS = [
    { key: 'operations', label: 'Operations', icon: '📋' },
    { key: 'intelligence', label: 'Intelligence', icon: '🧠' },
    { key: 'communication', label: 'Communication', icon: '💬' },
    { key: 'compliance', label: 'Compliance', icon: '🛡️' },
];

const STEPS = ['language', 'company', 'system_email', 'modules', 'confirm'] as const;
type Step = typeof STEPS[number];

const SetupWizard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();

    // Step state
    const [step, setStep] = useState<Step>('language');
    const [testedSystemEmail, setTestedSystemEmail] = useState<boolean>(false);
    const stepIndex = STEPS.indexOf(step);

    // Form state
    const [locale, setLocale] = useState(i18n.language?.split('-')[0] || 'en');
    const [companyName, setCompanyName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const [modules, setModules] = useState<Record<string, boolean>>(() => {
        const m: Record<string, boolean> = {};
        MODULE_DEFS.forEach(mod => { m[mod.slug] = mod.enabled; });
        return m;
    });
    const [systemEmail, setSystemEmail] = useState({
        provider: 'mock' as 'smtp' | 'mock',
        host: '',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        fromAddress: ''
    });
    const [reimportSeedData, setReimportSeedData] = useState(true);
    const [seedDemoData, setSeedDemoData] = useState(true);

    // Status
    const [submitting, setSubmitting] = useState(false);
    const [testingEmail, setTestingEmail] = useState(false);
    const [emailTestSuccess, setEmailTestSuccess] = useState(false);
    const [error, setError] = useState('');

    // When locale changes, switch i18n language
    useEffect(() => {
        i18n.changeLanguage(locale);
    }, [locale, i18n]);

    const toggleModule = (slug: string) => {
        const def = MODULE_DEFS.find(m => m.slug === slug);
        if (def?.tier === 'core') return; // Can't toggle core
        setModules(prev => ({ ...prev, [slug]: !prev[slug] }));
    };

    const handleEmailTest = async () => {
        if (systemEmail.provider === 'mock') {
            setTestedSystemEmail(true);
            setEmailTestSuccess(true);
            return;
        }

        setTestingEmail(true);
        setError('');
        try {
            const res = await api.post('/platform/settings/system-email/test', systemEmail);
            if (res.data.ok) {
                setEmailTestSuccess(true);
                setTestedSystemEmail(true);
            } else {
                setError(res.data.message || 'Connection failed');
                setEmailTestSuccess(false);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Connection test failed');
            setEmailTestSuccess(false);
        } finally {
            setTestingEmail(false);
        }
    };

    const canProceed = () => {
        if (step === 'company') {
            if (newPassword && newPassword.length < 6) return false;
            if (newPassword && newPassword !== confirmPassword) return false;
        }
        if (step === 'system_email') {
            if (systemEmail.provider === 'smtp') {
                if (!systemEmail.host || !systemEmail.user || !systemEmail.pass || !systemEmail.fromAddress) return false;
                if (!testedSystemEmail || !emailTestSuccess) return false;
            }
        }
        return true;
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError('');
        try {
            const enabledModuleSlugs = Object.entries(modules)
                .filter(([, enabled]) => enabled)
                .map(([slug]) => slug);

            await api.post('/setup/initialize', {
                locale,
                companyName,
                newPassword: newPassword || undefined,
                timezone,
                enabledModules: enabledModuleSlugs,
                reimportSeedData,
                systemEmail,
                seedDemoData,
            });

            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Setup failed');
            setSubmitting(false);
        }
    };

    const goNext = () => {
        const next = STEPS[stepIndex + 1];
        if (next) setStep(next);
        setError('');
    };
    const goPrev = () => {
        const prev = STEPS[stepIndex - 1];
        if (prev) setStep(prev);
        setError('');
    };

    // ── Step Renderers ──

    const renderLanguageStep = () => (
        <div className="wizard-step">
            <div className="wizard-step-header">
                <Globe size={32} className="wizard-step-icon" />
                <h2>{t('setup.languageTitle', 'Select Language')}</h2>
                <p className="wizard-step-desc">{t('setup.languageDesc', 'Choose the default language for the platform and seed data')}</p>
            </div>
            <div className="wizard-lang-grid">
                {LANGUAGES.map(lang => (
                    <Button
                        key={lang.code}
                        className={`wizard-lang-card ${locale === lang.code ? 'active' : ''}`}
                        onClick={() => setLocale(lang.code)}
                    >
                        <span className="wizard-lang-flag">{lang.flag}</span>
                        <span className="wizard-lang-label">{lang.label}</span>
                        {locale === lang.code && <Check size={16} className="wizard-lang-check" />}
                    </Button>
                ))}
            </div>
        </div>
    );

    const renderCompanyStep = () => (
        <div className="wizard-step">
            <div className="wizard-step-header">
                <Building2 size={32} className="wizard-step-icon" />
                <h2>{t('setup.companyTitle', 'Company & Security')}</h2>
                <p className="wizard-step-desc">{t('setup.companyDesc', 'Set your company name, timezone, and optionally change the admin password')}</p>
            </div>
            <div className="wizard-form">
                <div className="wizard-field">
                    <label>{t('setup.companyName', 'Company Name')}</label>
                    <Input
                        type="text"
                        value={companyName}
                        onChange={(e: any) => setCompanyName(e.target.value)}
                        placeholder={t('setup.companyPlaceholder', 'e.g. Acme Corp')}
                        autoComplete="off"
                    />
                </div>
                <div className="wizard-field">
                    <label>{t('setup.timezone', 'Timezone')}</label>
                    <Select
                        value={timezone}
                        onChange={e => setTimezone(e.target.value)}
                        className="wizard-input"
                    >
                        {TIMEZONES.map(tz => (
                            <option key={tz} value={tz}>{tz}</option>
                        ))}
                    </Select>
                </div>
                <div className="wizard-divider" />
                <div className="wizard-field">
                    <label><Lock size={14} style={{ marginRight: 6 }} />{t('setup.newPassword', 'New Admin Password')} <span className="wizard-optional">({t('setup.optional', 'optional')})</span></label>
                    <Input
                        type="password"
                        value={newPassword}
                        onChange={(e: any) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                    />
                    {newPassword && newPassword.length < 6 && (
                        <span className="wizard-field-error">{t('setup.passwordTooShort', 'Minimum 6 characters')}</span>
                    )}
                </div>
                {newPassword && (
                    <div className="wizard-field">
                        <label>{t('setup.confirmPassword', 'Confirm Password')}</label>
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e: any) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />
                        {confirmPassword && newPassword !== confirmPassword && (
                            <span className="wizard-field-error">{t('setup.passwordMismatch', 'Passwords do not match')}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    const toggleGroup = (groupKey: string, enable: boolean) => {
        setModules(prev => {
            const updated = { ...prev };
            MODULE_DEFS.filter(m => m.group === groupKey && m.tier === 'optional').forEach(m => {
                updated[m.slug] = enable;
            });
            return updated;
        });
    };

    const renderModulesStep = () => {
        const coreModules = MODULE_DEFS.filter(m => m.tier === 'core');

        return (
            <div className="wizard-step">
                <div className="wizard-step-header">
                    <Puzzle size={32} className="wizard-step-icon" />
                    <h2>{t('setup.modulesTitle', 'Module Selection')}</h2>
                    <p className="wizard-step-desc">{t('setup.modulesDesc', 'Enable the modules you need. You can change this later in Settings.')}</p>
                </div>

                <div className="wizard-modules">
                    <h4 className="wizard-modules-section">{t('setup.coreModules', 'Core Modules')} <Badge style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', border: '1px solid hsla(var(--primary-hue), 50%, 50%, 0.2)', backgroundColor: 'transparent' }}>{t('setup.alwaysOn', 'Always On')}</Badge></h4>
                    <div className="wizard-module-grid">
                        {coreModules.map(mod => (
                            <div key={mod.slug} className="wizard-module-card core">
                                <span className="wizard-module-icon">{mod.icon}</span>
                                <span className="wizard-module-name">{t(`setup.module_${mod.slug}`, mod.slug)}</span>
                                <Check size={14} className="wizard-module-check" />
                            </div>
                        ))}
                    </div>

                    {MODULE_GROUPS.map(group => {
                        const groupModules = MODULE_DEFS.filter(m => m.group === group.key && m.tier === 'optional');
                        if (groupModules.length === 0) return null;
                        const allEnabled = groupModules.every(m => modules[m.slug]);
                        const noneEnabled = groupModules.every(m => !modules[m.slug]);
                        return (
                            <div key={group.key}>
                                <h4 className="wizard-modules-section">
                                    <span>{group.icon} {t(`setup.group_${group.key}`, group.label)}</span>
                                    <Button
                                        className={`wizard-group-toggle ${allEnabled ? 'deselect' : 'select'}`}
                                        onClick={() => toggleGroup(group.key, !allEnabled)}
                                    >
                                        {allEnabled
                                            ? t('setup.deselectAll', 'Deselect All')
                                            : noneEnabled
                                                ? t('setup.selectAll', 'Select All')
                                                : t('setup.selectAll', 'Select All')}
                                    </Button>
                                </h4>
                                <div className="wizard-module-grid">
                                    {groupModules.map(mod => (
                                        <div
                                            key={mod.slug}
                                            className={`wizard-module-card optional ${modules[mod.slug] ? 'enabled' : ''}`}
                                            onClick={() => toggleModule(mod.slug)}
                                        >
                                            <span className="wizard-module-icon">{mod.icon}</span>
                                            <span className="wizard-module-name">{t(`setup.module_${mod.slug}`, mod.slug)}</span>
                                            <div className={`wizard-toggle ${modules[mod.slug] ? 'on' : 'off'}`}>
                                                <div className="wizard-toggle-thumb" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    <div className="wizard-seed-option">
                        <label className="wizard-checkbox-label">
                            <Checkbox
                                checked={reimportSeedData}
                                onChange={e => setReimportSeedData(e.target.checked)}
                            />
                            <RefreshCcw size={14} />
                            <span>{t('setup.reimportSeed', 'Import default data (Action Templates) for selected language')}</span>
                        </label>
                        {reimportSeedData && (
                            <div className="wizard-seed-warning">
                                <AlertTriangle size={14} />
                                <span>{t('setup.seedWarning', 'This will overwrite existing Action Templates with defaults.')}</span>
                            </div>
                        )}
                    </div>

                    <div className="wizard-seed-option" style={{ marginTop: '0.75rem' }}>
                        <label className="wizard-checkbox-label">
                            <Checkbox
                                checked={seedDemoData}
                                onChange={e => setSeedDemoData(e.target.checked)}
                            />
                            <Sparkles size={14} />
                            <span>{t('setup.seedDemo', 'Seed demo call data')}</span>
                        </label>
                        {seedDemoData && (
                            <div className="wizard-seed-warning" style={{ background: 'hsla(var(--primary-hue, 220), 80%, 60%, 0.1)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>
                                <Sparkles size={14} className="wizard-step-icon" style={{ margin: 0 }} />
                                <span>{t('setup.seedDemoDesc', 'Dashboard will be populated with simulated SIP calls and quality metrics.')}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderConfirmStep = () => {
        const enabledCount = Object.values(modules).filter(Boolean).length;
        return (
            <div className="wizard-step">
                <div className="wizard-step-header">
                    <Rocket size={32} className="wizard-step-icon" />
                    <h2>{t('setup.confirmTitle', 'Ready to Launch')}</h2>
                    <p className="wizard-step-desc">{t('setup.confirmDesc', 'Review your settings and launch CXMind')}</p>
                </div>

                <div className="wizard-summary">
                    <div className="wizard-summary-row">
                        <span className="wizard-summary-label"><Globe size={14} /> {t('setup.language', 'Language')}</span>
                        <span className="wizard-summary-value">{LANGUAGES.find(l => l.code === locale)?.label || locale}</span>
                    </div>
                    <div className="wizard-summary-row">
                        <span className="wizard-summary-label"><Building2 size={14} /> {t('setup.companyName', 'Company')}</span>
                        <span className="wizard-summary-value">{companyName || '—'}</span>
                    </div>
                    <div className="wizard-summary-row">
                        <span className="wizard-summary-label">🕐 {t('setup.timezone', 'Timezone')}</span>
                        <span className="wizard-summary-value">{timezone}</span>
                    </div>
                    <div className="wizard-summary-row">
                        <span className="wizard-summary-label"><Lock size={14} /> {t('setup.password', 'Password')}</span>
                        <span className="wizard-summary-value">{newPassword ? t('setup.willChange', 'Will be changed') : t('setup.unchanged', 'Unchanged')}</span>
                    </div>
                    <div className="wizard-summary-row">
                        <span className="wizard-summary-label"><Puzzle size={14} /> {t('setup.modules', 'Modules')}</span>
                        <span className="wizard-summary-value">{enabledCount} / {MODULE_DEFS.length} {t('setup.enabled', 'enabled')}</span>
                    </div>
                    <div className="wizard-summary-row">
                        <span className="wizard-summary-label"><RefreshCcw size={14} /> {t('setup.seedData', 'Seed Data')}</span>
                        <span className="wizard-summary-value">{reimportSeedData ? t('setup.willImport', 'Will import') : t('setup.skip', 'Skip')}</span>
                    </div>
                </div>

                {error && (
                    <div className="wizard-error">
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        );
    };

    const renderSystemEmailStep = () => {
        const applyTemplate = (provider: string) => {
            let host = '';
            let port = 587;
            let secure = false;
            if (provider === 'gmail') {
                host = 'smtp.gmail.com';
                port = 465;
                secure = true;
            } else if (provider === 'outlook') {
                host = 'smtp-mail.outlook.com';
                port = 587;
                secure = false;
            } else if (provider === 'sendgrid') {
                host = 'smtp.sendgrid.net';
                port = 587;
                secure = false;
            }
            setSystemEmail({ ...systemEmail, provider: 'smtp', host, port, secure });
            setTestedSystemEmail(false);
            setEmailTestSuccess(false);
            setError('');
        };

        return (
            <div className="wizard-step">
                <div className="wizard-step-header">
                    <Mail size={32} className="wizard-step-icon" />
                    <h2>{t('setup.emailTitle', 'System Notifications (Optional)')}</h2>
                    <p className="wizard-step-desc">{t('setup.emailDesc', 'Configure SMTP so CXMind can send reports, alerts, and password resets.')}</p>
                </div>

                <div className="wizard-form">
                    <div className="wizard-field">
                        <label>{t('setup.emailMode', 'Email Provider Mode')}</label>
                        <Select
                            value={systemEmail.provider}
                            onChange={(e) => {
                                setSystemEmail({ ...systemEmail, provider: e.target.value as any });
                                setTestedSystemEmail(false);
                            }}
                            className="wizard-input"
                        >
                            <option value="mock">{t('setup.mockProvider', 'Skip / Use Mock Console Logger')}</option>
                            <option value="smtp">{t('setup.smtpProvider', 'Real SMTP Server')}</option>
                        </Select>
                    </div>

                    {systemEmail.provider === 'smtp' && (
                        <>
                            <div className="wizard-divider" />
                            <div className="wizard-field" style={{ marginBottom: 12 }}>
                                <label style={{ marginBottom: 8 }}>{t('setup.quickTemplates', 'Quick Templates')}</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Button variant="secondary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => applyTemplate('gmail')}>Gmail / Workspace</Button>
                                    <Button variant="secondary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => applyTemplate('outlook')}>Outlook / O365</Button>
                                    <Button variant="secondary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => applyTemplate('sendgrid')}>SendGrid</Button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 16 }}>
                                <div className="wizard-field" style={{ flex: 2 }}>
                                    <label>{t('setup.smtpHost', 'SMTP Host')}</label>
                                    <Input value={systemEmail.host} onChange={(e: any) => { setSystemEmail({ ...systemEmail, host: e.target.value }); setTestedSystemEmail(false); }} placeholder="e.g. smtp.gmail.com" />
                                </div>
                                <div className="wizard-field" style={{ flex: 1 }}>
                                    <label>{t('setup.smtpPort', 'Port')}</label>
                                    <Input type="number" value={systemEmail.port} onChange={(e: any) => { setSystemEmail({ ...systemEmail, port: parseInt(e.target.value) || 587 }); setTestedSystemEmail(false); }} />
                                </div>
                            </div>

                            <div className="wizard-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Checkbox id="smtp_secure" checked={systemEmail.secure} onChange={e => { setSystemEmail({ ...systemEmail, secure: e.target.checked }); setTestedSystemEmail(false); }} />
                                <label htmlFor="smtp_secure" style={{ margin: 0, fontWeight: 'normal' }}>{t('setup.smtpSecure', 'Use Secure (TLS/SSL) — Often port 465 requires true, 587 requires false')}</label>
                            </div>

                            <div className="wizard-field">
                                <label>{t('setup.smtpFromAddress', 'From Address')}</label>
                                <Input value={systemEmail.fromAddress} onChange={(e: any) => { setSystemEmail({ ...systemEmail, fromAddress: e.target.value }); setTestedSystemEmail(false); }} placeholder="e.g. cxmind@acme.com" />
                            </div>

                            <div className="wizard-field">
                                <label>{t('setup.smtpUsername', 'Username / Email')}</label>
                                <Input value={systemEmail.user} onChange={(e: any) => { setSystemEmail({ ...systemEmail, user: e.target.value }); setTestedSystemEmail(false); }} placeholder="e.g. user@acme.com" />
                            </div>

                            <div className="wizard-field">
                                <label>{t('setup.smtpPassword', 'Password')}
                                    <span className="wizard-optional" style={{ marginLeft: 6 }}>
                                        ({t('setup.smtpAppPasswordHint', 'If using Google/M365, use an App Password')})
                                    </span>
                                </label>
                                <Input type="password" placeholder="••••••••" value={systemEmail.pass} onChange={(e: any) => { setSystemEmail({ ...systemEmail, pass: e.target.value }); setTestedSystemEmail(false); }} autoComplete="new-password" />
                            </div>

                            {error && !emailTestSuccess && (
                                <div className="wizard-field-error" style={{ marginTop: 8 }}>{error}</div>
                            )}

                            <div style={{ marginTop: 16 }}>
                                <Button
                                    className={`wizard-btn ${emailTestSuccess ? 'secondary' : 'primary'}`}
                                    onClick={handleEmailTest}
                                    disabled={testingEmail || !systemEmail.host || !systemEmail.user || !systemEmail.pass}
                                >
                                    {testingEmail ? t('setup.testingConnection', 'Testing Connection...') : emailTestSuccess ? t('setup.connectionSuccessful', 'Connection Successful ✓') : t('setup.testConnection', 'Test Connection')}
                                </Button>
                                {testedSystemEmail && !emailTestSuccess && (
                                    <span style={{ marginLeft: 12, color: '#e53e3e', fontSize: 13 }}>{t('setup.testFailed', 'Failed. Adjust settings and try again.')}</span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const STEP_RENDERERS: Record<Step, () => React.ReactNode> = {
        language: renderLanguageStep,
        company: renderCompanyStep,
        system_email: renderSystemEmailStep,
        modules: renderModulesStep,
        confirm: renderConfirmStep,
    };

    return (
        <div className="wizard-container">
            {/* Progress bar */}
            <div className="wizard-progress">
                {STEPS.map((s, i) => (
                    <div
                        key={s}
                        className={`wizard-progress-step ${i <= stepIndex ? 'active' : ''} ${i < stepIndex ? 'completed' : ''}`}
                    >
                        <div className="wizard-progress-dot">
                            {i < stepIndex ? <Check size={12} /> : i + 1}
                        </div>
                        <span className="wizard-progress-label">{t(`setup.step_${s}`, s)}</span>
                    </div>
                ))}
                <div className="wizard-progress-line" style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }} />
            </div>

            {/* Step content */}
            <div className="wizard-content">
                <div className="wizard-card glass-panel">
                    {STEP_RENDERERS[step]()}

                    {/* Navigation */}
                    <div className="wizard-nav">
                        {stepIndex > 0 && (
                            <Button onClick={goPrev} variant="secondary">
                                <ChevronLeft size={16} />
                                {t('setup.back', 'Back')}
                            </Button>
                        )}
                        <div style={{ flex: 1 }} />
                        {step !== 'confirm' ? (
                            <Button
                                onClick={goNext}
                                disabled={!canProceed()}
                            >
                                {t('setup.next', 'Next')}
                                <ChevronRight size={16} />
                            </Button>
                        ) : (
                            <Button className="launch"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <>{t('setup.launching', 'Launching...')}</>
                                ) : (
                                    <><Rocket size={16} /> {t('setup.launch', 'Launch CXMind')}</>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SetupWizard;
