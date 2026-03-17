import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Save, Loader2, Info, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

import { Button } from '../../components/ui/button';

type SettingPolicy = 'disabled' | 'optional' | 'enforced';
type AvatarVendorProvider = 'none' | 'gravatar' | 'ui-avatars' | 'custom';

interface PlatformSettings {
    pcapPolicy: SettingPolicy;
    asrPolicy: SettingPolicy;
    summaryPolicy: SettingPolicy;
    assistantPolicy: SettingPolicy;
    piiSanitizationPolicy?: 'regex' | 'ner';
    avatarVendor?: { provider: AvatarVendorProvider; customTemplate?: string };
}

export const GeneralSettings: React.FC = () => {
    const { t } = useTranslation();
    const { user: currentUser } = useAuth();

    const [settings, setSettings] = useState<PlatformSettings>({
        pcapPolicy: 'optional',
        asrPolicy: 'optional',
        summaryPolicy: 'optional',
        assistantPolicy: 'optional',
        piiSanitizationPolicy: 'regex',
        avatarVendor: { provider: 'none' },
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [nerAvailable] = useState(true);

    const policyOptions = [
        { value: 'disabled' as SettingPolicy, label: t('settingsPage.policy.disabled', 'Disabled'), description: t('settingsPage.policy.disabledDesc', 'Never automatically run this feature.'), color: 'var(--danger)' },
        { value: 'optional' as SettingPolicy, label: t('settingsPage.policy.optional', 'Optional'), description: t('settingsPage.policy.optionalDesc', 'Agents control this feature via Copilot. Requires Copilot login.'), color: 'var(--warning)' },
        { value: 'enforced' as SettingPolicy, label: t('settingsPage.policy.enforced', 'Enforced'), description: t('settingsPage.policy.enforcedDesc', 'Automatically run this feature on all applicable calls globally.'), color: 'var(--success)' }
    ];

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const response = await api.get('/platform/settings');
            if (response.data && response.data.data) {
                setSettings({
                    pcapPolicy: response.data.data.pcapPolicy || 'optional',
                    asrPolicy: response.data.data.asrPolicy || 'optional',
                    summaryPolicy: response.data.data.summaryPolicy || 'optional',
                    assistantPolicy: response.data.data.assistantPolicy || 'optional',
                    piiSanitizationPolicy: response.data.data.piiSanitizationPolicy || 'regex',
                    avatarVendor: response.data.data.avatarVendor || { provider: 'none' },
                });
            }
        } catch (error) {
            console.error('Failed to fetch general settings', error);
            setMessage({ type: 'error', text: 'Failed to load general settings' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await api.put('/platform/settings', settings);
            setMessage({ type: 'success', text: 'General Settings saved successfully. All agents will be re-synced.' });
        } catch (error) {
            console.error('Failed to save settings', error);
            setMessage({ type: 'error', text: 'Failed to save general settings' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const renderPolicySelector = (title: string, description: string, value: SettingPolicy, onChange: (val: SettingPolicy) => void) => {
        const currentOption = policyOptions.find(opt => opt.value === value);

        return (
            <div style={{
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--glass-border)',
                background: 'var(--bg-card)',
                boxShadow: 'var(--shadow-sm)'
            }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>{title}</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {description}
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    {policyOptions.map(option => (
                        <Button
                            key={option.value}
                            onClick={() => onChange(option.value)}
                            style={{
                                padding: '1.25rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                border: value === option.value
                                    ? `2px solid ${option.color}`
                                    : '2px solid var(--glass-border)',
                                background: value === option.value
                                    ? `${option.color}15`
                                    : 'var(--bg-base)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                textAlign: 'left',
                                display: 'flex', flexDirection: 'column', gap: '0.5rem'
                            }}
                        >
                            <div style={{
                                fontWeight: 700,
                                fontSize: '1rem',
                                color: value === option.value ? option.color : 'var(--text-primary)',
                            }}>
                                {option.label}
                            </div>
                            <div style={{
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.4
                            }}>
                                {option.description}
                            </div>
                        </Button>
                    ))}
                </div>

                {currentOption && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.85rem 1rem',
                        borderRadius: 'var(--radius-sm)',
                        background: `${currentOption.color}10`,
                        border: `1px solid ${currentOption.color}30`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        fontSize: '0.85rem',
                        color: currentOption.color,
                        fontWeight: 500
                    }}>
                        <Info size={18} style={{ flexShrink: 0 }} />
                        <span>
                            {value === 'disabled' && t('settingsPage.policy.disabledHint', 'This feature is completely disabled globally.')}
                            {value === 'optional' && t('settingsPage.policy.optionalHint', 'Agents control this via Copilot. Feature is active only when agent is logged in to Copilot.')}
                            {value === 'enforced' && t('settingsPage.policy.enforcedHint', 'This feature runs on all calls seamlessly without manual intervention.')}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            {message && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: message.type === 'success' ? 'hsla(var(--success-hue, 120), 40%, 90%, 1)' : 'hsla(0, 80%, 90%, 1)',
                    color: message.type === 'success' ? 'hsl(var(--success-hue, 120), 50%, 30%)' : 'hsl(0, 70%, 30%)',
                    border: `1px solid ${message.type === 'success' ? 'hsla(var(--success-hue, 120), 50%, 70%, 1)' : 'hsla(0, 70%, 70%, 1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontWeight: 500
                }}>
                    {message.text}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.75rem', background: 'hsla(var(--primary-hue, 260), 80%, 55%, 0.1)', borderRadius: 'var(--radius-md)' }}>
                        <SettingsIcon size={24} color="var(--primary)" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{t('settingsPage.tabs.general', 'General Settings')}</h2>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Configure global policies, features, and default behaviors for your deployment.
                        </p>
                    </div>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {saving ? t('settingsPage.saving', 'Saving...') : t('settingsPage.saveSettings', 'Save Changes')}
                </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* PCAP Policy */}
                {renderPolicySelector(
                    t('settingsPage.policy.pcapTitle', 'Call Packet (PCAP) Recording'),
                    t('settingsPage.policy.pcapDesc', 'Whether SIP/RTP PCAP files are generated and saved per call.'),
                    settings.pcapPolicy,
                    (value) => setSettings({ ...settings, pcapPolicy: value })
                )}

                {/* ASR Policy */}
                {renderPolicySelector(
                    t('settingsPage.policy.asrTitle', 'Real-time Transcription (ASR)'),
                    t('settingsPage.policy.asrDesc', 'Speech-to-text decoding during the active call.'),
                    settings.asrPolicy,
                    (value) => setSettings({ ...settings, asrPolicy: value })
                )}

                {/* Summary Policy */}
                {renderPolicySelector(
                    t('settingsPage.policy.summaryTitle', 'Post-call Intelligence & Summary'),
                    t('settingsPage.policy.summaryDesc', 'LLM-powered summarization, formatting, and insight extraction after the call.'),
                    settings.summaryPolicy,
                    (value) => setSettings({ ...settings, summaryPolicy: value })
                )}

                {/* Assistant Policy */}
                {renderPolicySelector(
                    t('settingsPage.policy.assistantTitle', 'Agent AI Assistant (Copilot)'),
                    t('settingsPage.policy.assistantDesc', 'Knowledge base retrieval (RAG) and intelligent suggested responses for human agents.'),
                    settings.assistantPolicy,
                    (value) => setSettings({ ...settings, assistantPolicy: value })
                )}

                {/* PII Sanitization Policy */}
                <div style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>{t('settingsPage.policy.piiTitle', 'PII Sanitization & Masking')}</h3>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {t('settingsPage.policy.piiDesc', 'How sensitive data like phone numbers, emails, and names are masked in the UI out-of-the-box.')}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                        <Button
                            onClick={() => setSettings({ ...settings, piiSanitizationPolicy: 'regex' })}
                            style={{
                                padding: '1.25rem', borderRadius: 'var(--radius-md)',
                                border: settings.piiSanitizationPolicy === 'regex' ? '2px solid var(--primary)' : '2px solid var(--glass-border)',
                                background: settings.piiSanitizationPolicy === 'regex' ? 'hsla(var(--primary-hue, 260), 80%, 55%, 0.08)' : 'var(--bg-base)',
                                cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left',
                                height: 'auto', minHeight: '100px', whiteSpace: 'normal', alignItems: 'flex-start', justifyContent: 'flex-start'
                            }}
                        >
                            <div style={{ fontWeight: 600, fontSize: '1rem', color: settings.piiSanitizationPolicy === 'regex' ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                {t('settingsPage.policy.piiRegex', 'Standard Regex (Basic)')}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {t('settingsPage.policy.piiRegexDesc', 'Uses pattern matching to hide credit cards, SSNs, and email addresses. Low CPU usage.')}
                            </div>
                        </Button>

                        <Button
                            onClick={() => nerAvailable && setSettings({ ...settings, piiSanitizationPolicy: 'ner' })}
                            disabled={!nerAvailable}
                            style={{
                                padding: '1.25rem', borderRadius: 'var(--radius-md)',
                                border: settings.piiSanitizationPolicy === 'ner' ? '2px solid var(--primary)' : '2px solid var(--glass-border)',
                                background: settings.piiSanitizationPolicy === 'ner' ? 'hsla(var(--primary-hue, 260), 80%, 55%, 0.08)' : 'var(--bg-base)',
                                cursor: nerAvailable ? 'pointer' : 'not-allowed', opacity: nerAvailable ? 1 : 0.6,
                                transition: 'all 0.2s ease', textAlign: 'left',
                                height: 'auto', minHeight: '100px', whiteSpace: 'normal', alignItems: 'flex-start', justifyContent: 'flex-start'
                            }}
                        >
                            <div style={{ fontWeight: 600, fontSize: '1rem', color: settings.piiSanitizationPolicy === 'ner' ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                {t('settingsPage.policy.piiNer', 'AI NER (Advanced)')}
                                {!nerAvailable && ' (Unavailable)'}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {t('settingsPage.policy.piiNerDesc', 'Uses NLP to contextually identify names, organizations, and locations.')}
                            </div>
                        </Button>
                    </div>
                </div>

                {/* Avatar Vendor Settings */}
                <div style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>{t('settingsPage.avatar.title', 'Global Avatar Provider')}</h3>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {t('settingsPage.avatar.desc', 'Select the service used to generate missing user avatars seamlessly across the platform.')}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        {[
                            { value: 'none', label: t('settingsPage.avatar.none', 'None'), desc: t('settingsPage.avatar.noneDesc', 'Default generic icon.') },
                            { value: 'gravatar', label: 'Gravatar', desc: t('settingsPage.avatar.gravatarDesc', 'Hash-based global avatar directory.') },
                            { value: 'ui-avatars', label: 'UI Avatars', desc: t('settingsPage.avatar.uiAvatarsDesc', 'Initials-based colored squares.') },
                            { value: 'custom', label: t('settingsPage.avatar.custom', 'Custom Endpoint'), desc: t('settingsPage.avatar.customDesc', 'Use your internal company directory.') }
                        ].map(opt => {
                            const isSelected = settings.avatarVendor?.provider === opt.value;
                            return (
                                <Button
                                    key={opt.value}
                                    onClick={() => setSettings({
                                        ...settings,
                                        avatarVendor: {
                                            ...settings.avatarVendor,
                                            provider: opt.value as AvatarVendorProvider,
                                        },
                                    })}
                                    style={{
                                        padding: '1.25rem 1rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: isSelected ? '2px solid var(--primary)' : '2px solid var(--glass-border)',
                                        background: isSelected ? 'hsla(var(--primary-hue, 260), 80%, 55%, 0.08)' : 'var(--bg-base)',
                                        cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left',
                                        height: 'auto', minHeight: '100px', whiteSpace: 'normal', alignItems: 'flex-start', justifyContent: 'flex-start'
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: isSelected ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                        {opt.label}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                        {opt.desc}
                                    </div>
                                </Button>
                            );
                        })}
                    </div>

                    {settings.avatarVendor?.provider === 'custom' && (
                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-base)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                {t('settingsPage.avatar.urlTemplate', 'Endpoint URL Template')}
                            </label>
                            <input
                                value={settings.avatarVendor.customTemplate || ''}
                                onChange={e => setSettings({
                                    ...settings,
                                    avatarVendor: { ...settings.avatarVendor!, customTemplate: e.target.value },
                                })}
                                placeholder="https://avatar.example.com/{email}?s={size}"
                                className="input"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                            />
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                {t('settingsPage.avatar.placeholders', 'Available placeholders:')} <code style={{ color: 'var(--primary)' }}>{'{email}'}</code>, <code style={{ color: 'var(--primary)' }}>{'{name}'}</code>, <code style={{ color: 'var(--primary)' }}>{'{size}'}</code>
                            </div>
                        </div>
                    )}

                    {/* Live Preview */}
                    {settings.avatarVendor?.provider && settings.avatarVendor.provider !== 'none' && (
                        <div style={{
                            marginTop: '1.5rem', padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)',
                            background: 'hsla(210, 100%, 97%, 1)', border: '1px solid hsla(210, 100%, 85%, 1)',
                            display: 'flex', alignItems: 'center', gap: '1rem',
                        }}>
                            <img
                                src={(() => {
                                    const email = currentUser?.email || 'test@example.com';
                                    const name = currentUser?.displayName || 'Test User';
                                    const p = settings.avatarVendor!.provider;
                                    if (p === 'gravatar') {
                                        return `https://www.gravatar.com/avatar/?d=identicon&s=40`;
                                    }
                                    if (p === 'ui-avatars') {
                                        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=40&background=random&bold=true`;
                                    }
                                    if (p === 'custom' && settings.avatarVendor!.customTemplate) {
                                        return settings.avatarVendor!.customTemplate
                                            .replace(/\{email\}/g, encodeURIComponent(email))
                                            .replace(/\{name\}/g, encodeURIComponent(name))
                                            .replace(/\{size\}/g, '40');
                                    }
                                    return '';
                                })()}
                                alt="Preview"
                                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', background: '#e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {t('settingsPage.avatar.preview', 'Live Preview')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                    This is how avatars will appear in headers and list views.
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default GeneralSettings;
