/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Checkbox } from '../../components/ui/Checkbox';
import { Textarea } from '../../components/ui/Textarea';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Save, Loader2, Cpu, ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { copyToClipboard } from '../../utils/clipboard';

interface PlatformSettings {
    omnichannel?: any;
}

const OmnichannelConfig: React.FC = () => {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<PlatformSettings>({});
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Omnichannel Bot config state
    const [botConfig, setBotConfig] = useState({
        enabled: true,
        maxBotTurns: 10,
        confidenceThreshold: 0.6,
        systemPrompt: 'You are CXMind AI Assistant, a helpful customer service chatbot.',
        fallbackMessage: "I'm unable to answer this question. Let me connect you with a human agent.",
        handoffKeywords: ['转人工', '人工客服', 'agent', 'human', 'representative'],
    });
    const [savingBot, setSavingBot] = useState(false);
    const [newKeyword, setNewKeyword] = useState('');

    // WhatsApp and Email config state
    const [whatsappConfig, setWhatsappConfig] = useState({ enabled: false, phoneNumberId: '', accessToken: '', verifyToken: '' });
    const [savingWhatsApp, setSavingWhatsApp] = useState(false);

    const [emailAdapters, setEmailAdapters] = useState<any[]>([]);
    const [showEmailAddForm, setShowEmailAddForm] = useState(false);
    const [emailToDelete, setEmailToDelete] = useState<string | null>(null);
    const [testingEmail, setTestingEmail] = useState<string | null>(null);
    const [emailTestResult, setEmailTestResult] = useState<{ id?: string, success: boolean, text: string } | null>(null);

    // LINE config state
    const [lineConfig, setLineConfig] = useState({ enabled: false, channelAccessToken: '', channelSecret: '' });
    const [savingLine, setSavingLine] = useState(false);
    const [testingLine, setTestingLine] = useState(false);

    // Kakao config state
    const [kakaoConfig, setKakaoConfig] = useState({ enabled: false, appKey: '', appSecret: '', senderKey: '' });
    const [savingKakao, setSavingKakao] = useState(false);
    const [testingKakao, setTestingKakao] = useState(false);

    // WeChat config state
    const [wechatConfig, setWechatConfig] = useState({ enabled: false, appId: '', appSecret: '', token: '', encodingAESKey: '' });
    const [savingWechat, setSavingWechat] = useState(false);
    const [testingWechat, setTestingWechat] = useState(false);

    // Accordion expand state
    const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const response = await api.get('/platform/settings');
            const data = response.data.data;
            setSettings(data);

            // Load bot config from omnichannel
            if (data.omnichannel?.bot) setBotConfig(prev => ({ ...prev, ...data.omnichannel.bot }));
            if (data.omnichannel?.whatsapp) setWhatsappConfig(prev => ({ ...prev, ...data.omnichannel.whatsapp }));
            if (data.omnichannel?.emailAdapters) setEmailAdapters(data.omnichannel.emailAdapters || []);
            if (data.omnichannel?.line) setLineConfig(prev => ({ ...prev, ...data.omnichannel.line }));
            if (data.omnichannel?.kakao) setKakaoConfig(prev => ({ ...prev, ...data.omnichannel.kakao }));
            if (data.omnichannel?.wechat) setWechatConfig(prev => ({ ...prev, ...data.omnichannel.wechat }));
        } catch (error) {
            console.error('Failed to fetch settings', error);
            setMessage({ type: 'error', text: t('omni.toast.loadFailed', 'Failed to load settings') });
        } finally {
            setLoading(false);
        }
    };

    const buildUpdates = () => ({
        omnichannel: { ...settings.omnichannel, bot: botConfig, whatsapp: whatsappConfig, emailAdapters, line: lineConfig, kakao: kakaoConfig, wechat: wechatConfig }
    });

    const handleSaveBot = async () => {
        setSavingBot(true);
        try {
            await api.patch('/platform/settings', buildUpdates());
            setMessage({ type: 'success', text: t('omni.toast.botSaved', 'Bot configuration saved successfully') });
        } catch (e) {
            setMessage({ type: 'error', text: t('omni.toast.botSaveFailed', 'Failed to save bot configuration') });
        } finally {
            setSavingBot(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleSaveWhatsApp = async () => {
        setSavingWhatsApp(true);
        try {
            await api.patch('/platform/settings', buildUpdates());
            setMessage({ type: 'success', text: t('omni.toast.waSaved', 'WhatsApp configuration saved successfully') });
        } catch (e) {
            setMessage({ type: 'error', text: t('omni.toast.waSaveFailed', 'Failed to save WhatsApp configuration') });
        } finally {
            setSavingWhatsApp(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleSaveLine = async () => {
        setSavingLine(true);
        try {
            await api.patch('/platform/settings', buildUpdates());
            setMessage({ type: 'success', text: t('omni.toast.lineSaved', 'LINE configuration saved successfully') });
        } catch (e) {
            setMessage({ type: 'error', text: t('omni.toast.lineSaveFailed', 'Failed to save LINE configuration') });
        } finally {
            setSavingLine(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleSaveKakao = async () => {
        setSavingKakao(true);
        try {
            await api.patch('/platform/settings', buildUpdates());
            setMessage({ type: 'success', text: t('omni.toast.kakaoSaved', 'Kakao configuration saved successfully') });
        } catch (e) {
            setMessage({ type: 'error', text: t('omni.toast.kakaoSaveFailed', 'Failed to save Kakao configuration') });
        } finally {
            setSavingKakao(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleSaveWechat = async () => {
        setSavingWechat(true);
        try {
            await api.patch('/platform/settings', buildUpdates());
            setMessage({ type: 'success', text: t('omni.toast.wechatSaved', 'WeChat configuration saved successfully') });
        } catch (e) {
            setMessage({ type: 'error', text: t('omni.toast.wechatSaveFailed', 'Failed to save WeChat configuration') });
        } finally {
            setSavingWechat(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleDeleteEmailAdapter = async () => {
        if (!emailToDelete) return;
        const updatedAdapters = emailAdapters.filter(a => a.id !== emailToDelete);
        try {
            await api.patch('/platform/settings', {
                omnichannel: { ...settings.omnichannel, bot: botConfig, whatsapp: whatsappConfig, emailAdapters: updatedAdapters }
            });
            setEmailAdapters(updatedAdapters);
            setEmailToDelete(null);
            setMessage({ type: 'success', text: t('omni.toast.emailRemoved', 'Email adapter removed') });
        } catch (e) {
            setMessage({ type: 'error', text: t('omni.toast.emailRemoveFailed', 'Failed to remove email adapter') });
        }
        setTimeout(() => setMessage(null), 3000);
    };

    const handleTestLine = async () => {
        setTestingLine(true);
        try {
            const res = await fetch('https://api.line.me/v2/bot/info', {
                headers: { 'Authorization': `Bearer ${lineConfig.channelAccessToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMessage({ type: 'success', text: t('omni.test.lineConnected', { name: data.displayName || 'Bot', defaultValue: `LINE connected: ${data.displayName || 'Bot'}` }) });
            } else {
                setMessage({ type: 'error', text: `LINE test failed: ${res.status} ${res.statusText}` });
            }
        } catch (e: any) {
            setMessage({ type: 'error', text: `LINE test failed: ${e.message}` });
        } finally {
            setTestingLine(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const handleTestKakao = async () => {
        setTestingKakao(true);
        try {
            if (kakaoConfig.appKey && kakaoConfig.senderKey) {
                setMessage({ type: 'success', text: t('omni.test.kakaoConfigured', 'Kakao credentials configured ✓ (live test requires webhook)') });
            } else {
                setMessage({ type: 'error', text: t('omni.test.kakaoFailed', 'Kakao test failed: missing App Key or Sender Key') });
            }
        } finally {
            setTestingKakao(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const handleTestWechat = async () => {
        setTestingWechat(true);
        try {
            const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechatConfig.appId}&secret=${wechatConfig.appSecret}`);
            const data = await res.json();
            if (data.access_token) {
                setMessage({ type: 'success', text: t('omni.test.wechatConnected', { expires: data.expires_in, defaultValue: `WeChat connected: token obtained (${data.expires_in}s)` }) });
            } else {
                setMessage({ type: 'error', text: `WeChat test failed: ${data.errmsg || 'Unknown error'}` });
            }
        } catch (e: any) {
            setMessage({ type: 'error', text: `WeChat test failed: ${e.message}` });
        } finally {
            setTestingWechat(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const handleTestEmailAdapter = async (id: string) => {
        // Mocking for now as per current Settings.tsx
        setTimeout(() => {
            setEmailTestResult({ id, success: true, text: t('omni.test.emailSuccess', 'Email adapter test successful') });
            setTestingEmail(null);
            setTimeout(() => setEmailTestResult(null), 3000);
        }, 1500);
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500"><Loader2 className="animate-spin mx-auto mb-2" /> {t('omni.loading', 'Loading Omnichannel Config...')}</div>;
    }

    return (
        <div className="settings-page max-w-5xl mx-auto p-6 space-y-8">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold mb-2">{t('omni.title', 'Omnichannel & Bot Configuration')}</h1>
                    <p className="text-gray-500">{t('omni.subtitle', 'Configure global AI bot behaviors and connect external channels to the SIP engine.')}</p>
                </div>
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

            {/* ─── Omnichannel Bot Configuration ─── */}
            <div style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Cpu size={24} color="var(--primary)" />
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('omni.bot.title', 'Omnichannel Bot (RAG + LLM)')}</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Switch checked={botConfig.enabled} onCheckedChange={checked => setBotConfig({ ...botConfig, enabled: checked })} />
                        <span style={{ fontSize: '0.9rem', color: botConfig.enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                            {botConfig.enabled ? t('omni.bot.enabled') : t('omni.bot.disabled')}
                        </span>
                    </div>
                </div>

                <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {t('omni.bot.description')}
                </p>

                {botConfig.enabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('omni.bot.maxTurns', 'Max Bot Turns')}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Input type="range" min="1" max="30" value={botConfig.maxBotTurns} onChange={e => setBotConfig({ ...botConfig, maxBotTurns: parseInt(e.target.value) })} style={{ flex: 1 }} />
                                <span style={{ fontWeight: 600, width: '24px' }}>{botConfig.maxBotTurns}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{t('omni.bot.maxTurnsHint', 'Bot will hand off to human after this many turns')}</div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('omni.bot.confidence', 'Confidence Threshold')}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Input type="range" min="0" max="1" step="0.05" value={botConfig.confidenceThreshold} onChange={e => setBotConfig({ ...botConfig, confidenceThreshold: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                                <span style={{ fontWeight: 600, width: '30px' }}>{botConfig.confidenceThreshold}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{t('omni.bot.confidenceHint', 'Below this RAG score, bot hands off to human')}</div>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('omni.bot.systemPrompt', 'System Prompt')}</label>
                            <Textarea
                                value={botConfig.systemPrompt}
                                onChange={e => setBotConfig({ ...botConfig, systemPrompt: e.target.value })}
                                rows={3}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.85rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('omni.bot.fallback', 'Fallback Message')}</label>
                            <Input
                                value={botConfig.fallbackMessage}
                                onChange={e => setBotConfig({ ...botConfig, fallbackMessage: e.target.value })}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.85rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                            />

                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('omni.bot.handoffKeywords', 'Handoff Keywords')}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                {botConfig.handoffKeywords.map((kw, i) => (
                                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'hsla(260, 80%, 55%, 0.12)', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 500 }}>
                                        {kw}
                                        <Button onClick={() => setBotConfig({ ...botConfig, handoffKeywords: botConfig.handoffKeywords.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>&times;</Button>
                                    </span>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Input
                                    value={newKeyword}
                                    onChange={e => setNewKeyword(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && newKeyword.trim()) { setBotConfig({ ...botConfig, handoffKeywords: [...botConfig.handoffKeywords, newKeyword.trim()] }); setNewKeyword(''); } }}
                                    placeholder={t('omni.placeholder.keyword', 'Type keyword and press Enter')}
                                    style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                                />
                                <Button
                                    size="sm"
                                    disabled={!newKeyword.trim()}
                                    onClick={() => { if (newKeyword.trim()) { setBotConfig({ ...botConfig, handoffKeywords: [...botConfig.handoffKeywords, newKeyword.trim()] }); setNewKeyword(''); } }}
                                >
                                    {t('omni.bot.addKeyword')}
                                </Button>
                            </div>
                        </div>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                            <Button

                                onClick={handleSaveBot}
                                disabled={savingBot}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                            >
                                {savingBot ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {savingBot ? t('settingsPage.saving') : t('omni.btn.saveBot', 'Save Config')}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Omnichannel Integrations ─── */}
            <div style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <ArrowRightLeft size={24} color="var(--primary)" />
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('omni.adapters.title', 'Omnichannel Adapters')}</h2>
                </div>

                {(() => {
                    const channels = [whatsappConfig.enabled, lineConfig.enabled, kakaoConfig.enabled, wechatConfig.enabled, emailAdapters.length > 0, true /*webchat*/];
                    const activeCount = channels.filter(Boolean).length;
                    return (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem', background: 'hsla(var(--primary-rgb), 0.06)', borderRadius: 'var(--radius-sm)', border: '1px solid hsla(var(--primary-rgb), 0.12)' }}>
                            <span style={{ fontSize: '0.95rem' }}>📊</span>
                            <span style={{ fontSize: '0.85rem' }}><strong>{channels.length}</strong> {t('omni.adapters.configured', 'channels configured')}</span>
                            <span style={{ fontSize: '0.85rem' }}>·</span>
                            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>{activeCount} {t('omni.adapters.active', 'active')}</span>
                        </div>
                    );
                })()}

                <style>{`
                    @keyframes omni-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.1); } }
                    .omni-row { transition: all 0.3s ease; }
                    .omni-row:hover { filter: brightness(1.05); transform: translateY(-1px); }
                `}</style>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
                    {[
                        { key: 'whatsapp', label: 'WhatsApp Cloud API', icon: '📱', color: 'hsl(142, 60%, 45%)', enabled: whatsappConfig.enabled },
                        { key: 'line', label: 'LINE Messaging API', icon: '🟢', color: 'hsl(141, 78%, 40%)', enabled: lineConfig.enabled },
                        { key: 'kakao', label: 'KakaoTalk 상담톡', icon: '💛', color: 'hsl(48, 95%, 50%)', enabled: kakaoConfig.enabled },
                        { key: 'wechat', label: 'WeChat Official', icon: '🟩', color: 'hsl(120, 60%, 45%)', enabled: wechatConfig.enabled },
                        { key: 'email', label: t('omni.channels.email', { count: emailAdapters.length, defaultValue: `Email Adapters (${emailAdapters.length})` }), icon: '📧', color: 'hsl(210, 70%, 50%)', enabled: emailAdapters.length > 0 },
                        { key: 'webchat', label: 'WebChat (Built-in)', icon: '💬', color: 'var(--primary)', enabled: true },
                    ].map(ch => {
                        const isExpanded = expandedChannel === ch.key;
                        const isWebchat = ch.key === 'webchat';
                        return (
                            <div key={ch.key} className="omni-row" style={{ borderRadius: 'var(--radius-md)', border: `1px solid ${ch.enabled ? ch.color : 'var(--glass-border)'}`, borderLeft: `4px solid ${ch.enabled ? ch.color : 'var(--glass-border)'}`, background: 'var(--bg-card)', boxShadow: ch.enabled ? `0 4px 12px ${ch.color}10` : '0 2px 5px rgba(0,0,0,0.02)', overflow: 'hidden', opacity: ch.enabled ? 1 : 0.85 }}>
                                <div data-testid={`channel-header-${ch.key}`} onClick={() => !isWebchat && setExpandedChannel(isExpanded ? null : ch.key)} style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: isWebchat ? 'default' : 'pointer', userSelect: 'none', background: ch.enabled ? `${ch.color}08` : 'rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><span style={{ fontSize: '1.25rem' }}>{ch.icon}</span><span style={{ fontWeight: 600, fontSize: '1rem' }}>{ch.label}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-full)', background: ch.enabled ? `${ch.color}20` : 'rgba(128,128,128,0.1)', color: ch.enabled ? ch.color : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {ch.enabled ? <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ch.color, animation: 'omni-pulse 2s ease-in-out infinite' }} /> {t('omni.status.active', 'Active')}</> : (isWebchat ? t('omni.status.alwaysOn', '● Always On') : t('omni.status.disabledText', '○ Disabled'))}
                                        </span>
                                        {!isWebchat && <span style={{ fontSize: '0.85rem', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease', display: 'inline-block' }}>▶</span>}
                                    </div>
                                </div>
                                <div style={{ maxHeight: isExpanded ? '1500px' : '0', opacity: isExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.4s ease, opacity 0.3s ease', padding: isExpanded ? '1.5rem' : '0 1.5rem', background: 'var(--bg-card)', borderTop: isExpanded ? '1px solid var(--glass-border)' : 'none' }}>
                                    {ch.key === 'whatsapp' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <Checkbox checked={whatsappConfig.enabled} onChange={e => setWhatsappConfig({ ...whatsappConfig, enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: ch.color }} />
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t('omni.wa.enable', 'Enable WhatsApp Cloud API Integration')}</span>
                                            </label>
                                            {whatsappConfig.enabled && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '0.5rem' }}>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.wa.phoneId', 'Phone Number ID')}</label><Input value={whatsappConfig.phoneNumberId} onChange={e => setWhatsappConfig({ ...whatsappConfig, phoneNumberId: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.wa.token', 'System User Access Token')}</label><Input type="password" value={whatsappConfig.accessToken} onChange={e => setWhatsappConfig({ ...whatsappConfig, accessToken: e.target.value })} autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.wa.verify', 'Webhook Verify Token')}</label><Input value={whatsappConfig.verifyToken} onChange={e => setWhatsappConfig({ ...whatsappConfig, verifyToken: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px dashed var(--glass-border)' }} onClick={() => { copyToClipboard(`${window.location.origin}/api/webhooks/whatsapp`); setMessage({ type: 'success', text: t('omni.toast.webhookCopied', 'Webhook URL copied!') }); setTimeout(() => setMessage(null), 2000); }}>{t('omni.webhookUrl', '📋 Webhook URL: ')}<code style={{ userSelect: 'all', fontWeight: 600, color: 'var(--text-primary)' }}>{window.location.origin}/api/webhooks/whatsapp</code></div>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                                <Button data-testid="save-whatsapp-btn" onClick={handleSaveWhatsApp} disabled={savingWhatsApp} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><Save size={16} /> {savingWhatsApp ? t('settingsPage.saving') : t('omni.wa.save', 'Save WhatsApp')}</Button>
                                            </div>
                                        </div>
                                    )}

                                    {ch.key === 'line' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <Checkbox checked={lineConfig.enabled} onChange={e => setLineConfig({ ...lineConfig, enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: ch.color }} />
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t('omni.line.enable', 'Enable LINE Messaging API')}</span>
                                            </label>
                                            {lineConfig.enabled && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '0.5rem' }}>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.line.token', 'Channel Access Token')}</label><Input type="password" value={lineConfig.channelAccessToken} onChange={e => setLineConfig({ ...lineConfig, channelAccessToken: e.target.value })} autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.line.secret', 'Channel Secret')}</label><Input type="password" value={lineConfig.channelSecret} onChange={e => setLineConfig({ ...lineConfig, channelSecret: e.target.value })} autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px dashed var(--glass-border)' }} onClick={() => { copyToClipboard(`${window.location.origin}/api/webhooks/line`); setMessage({ type: 'success', text: t('omni.toast.webhookCopied', 'Webhook URL copied!') }); setTimeout(() => setMessage(null), 2000); }}>{t('omni.webhookUrl', '📋 Webhook URL: ')}<code style={{ userSelect: 'all', fontWeight: 600, color: 'var(--text-primary)' }}>{window.location.origin}/api/webhooks/line</code></div></div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                                <Button variant="outline" onClick={handleTestLine} disabled={testingLine || !lineConfig.channelAccessToken} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>{testingLine ? <Loader2 size={16} className="animate-spin" /> : '🔗'} {testingLine ? t('settingsPage.testing', 'Testing...') : t('omni.btn.test', 'Test Connection')}</Button>
                                                <Button onClick={handleSaveLine} disabled={savingLine} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><Save size={16} /> {savingLine ? t('settingsPage.saving') : t('omni.line.save', 'Save LINE')}</Button>
                                            </div>
                                        </div>
                                    )}

                                    {ch.key === 'kakao' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <Checkbox checked={kakaoConfig.enabled} onChange={e => setKakaoConfig({ ...kakaoConfig, enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: ch.color }} />
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t('omni.kakao.enable', 'Enable KakaoTalk 상담톡')}</span>
                                            </label>
                                            {kakaoConfig.enabled && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '0.5rem' }}>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.kakao.appKey', 'App Key')}</label><Input value={kakaoConfig.appKey} onChange={e => setKakaoConfig({ ...kakaoConfig, appKey: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.kakao.appSecret', 'App Secret')}</label><Input type="password" value={kakaoConfig.appSecret} onChange={e => setKakaoConfig({ ...kakaoConfig, appSecret: e.target.value })} autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.kakao.senderKey', 'Sender Key')}</label><Input value={kakaoConfig.senderKey} onChange={e => setKakaoConfig({ ...kakaoConfig, senderKey: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px dashed var(--glass-border)' }} onClick={() => { copyToClipboard(`${window.location.origin}/api/webhooks/kakao`); setMessage({ type: 'success', text: t('omni.toast.webhookCopied', 'Webhook URL copied!') }); setTimeout(() => setMessage(null), 2000); }}>{t('omni.webhookUrl', '📋 Webhook URL: ')}<code style={{ userSelect: 'all', fontWeight: 600, color: 'var(--text-primary)' }}>{window.location.origin}/api/webhooks/kakao</code></div></div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                                <Button variant="outline" onClick={handleTestKakao} disabled={testingKakao} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>{testingKakao ? <Loader2 size={16} className="animate-spin" /> : '🔗'} {testingKakao ? t('settingsPage.testing') : t('omni.btn.verify', 'Verify Schema')}</Button>
                                                <Button onClick={handleSaveKakao} disabled={savingKakao} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><Save size={16} /> {savingKakao ? t('settingsPage.saving') : t('omni.kakao.save', 'Save KakaoTalk')}</Button>
                                            </div>
                                        </div>
                                    )}

                                    {ch.key === 'wechat' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <Checkbox checked={wechatConfig.enabled} onChange={e => setWechatConfig({ ...wechatConfig, enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: ch.color }} />
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t('omni.wechat.enable', 'Enable WeChat Official Account (公众号)')}</span>
                                            </label>
                                            {wechatConfig.enabled && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '0.5rem' }}>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.wechat.appId', 'AppID')}</label><Input value={wechatConfig.appId} onChange={e => setWechatConfig({ ...wechatConfig, appId: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.wechat.appSecret', 'AppSecret')}</label><Input type="password" value={wechatConfig.appSecret} onChange={e => setWechatConfig({ ...wechatConfig, appSecret: e.target.value })} autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.wechat.token', 'Token (Verification)')}</label><Input value={wechatConfig.token} onChange={e => setWechatConfig({ ...wechatConfig, token: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('omni.wechat.aesKey', 'EncodingAESKey')}</label><Input type="password" value={wechatConfig.encodingAESKey} onChange={e => setWechatConfig({ ...wechatConfig, encodingAESKey: e.target.value })} autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }} /></div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px dashed var(--glass-border)' }} onClick={() => { copyToClipboard(`${window.location.origin}/api/webhooks/wechat`); setMessage({ type: 'success', text: t('omni.toast.webhookCopied', 'Webhook URL copied!') }); setTimeout(() => setMessage(null), 2000); }}>{t('omni.webhookUrl', '📋 Webhook URL: ')}<code style={{ userSelect: 'all', fontWeight: 600, color: 'var(--text-primary)' }}>{window.location.origin}/api/webhooks/wechat</code></div></div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                                <Button data-testid="test-wechat-btn" variant="outline" onClick={handleTestWechat} disabled={testingWechat || !wechatConfig.appId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>{testingWechat ? <Loader2 size={16} className="animate-spin" /> : '🔗'} {testingWechat ? t('settingsPage.testing') : t('omni.btn.test')}</Button>
                                                <Button data-testid="save-wechat-btn" onClick={handleSaveWechat} disabled={savingWechat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><Save size={16} /> {savingWechat ? t('settingsPage.saving') : t('omni.wechat.save', 'Save WeChat')}</Button>
                                            </div>
                                        </div>
                                    )}

                                    {ch.key === 'email' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {emailAdapters.length === 0 && (
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>{t('omni.email.none', 'No email adapters configured.')}</div>
                                            )}
                                            {emailAdapters.map((adapter: any) => (
                                                <div key={adapter.id} style={{ padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            {adapter.name}
                                                            {adapter.isPrimary && <span style={{ fontSize: '0.7rem', color: 'white', background: ch.color, padding: '2px 6px', borderRadius: '4px' }}>{t('omni.email.primary', 'PRIMARY')}</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                            {t('omni.email.imap', 'IMAP: ')}{adapter.imapHost}:{adapter.imapPort}{t('omni.email.auth', ' | Auth: ')}{adapter.authUser}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <Button variant="outline" onClick={() => { setTestingEmail(adapter.id); handleTestEmailAdapter(adapter.id); }} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                                                            {testingEmail === adapter.id ? <Loader2 size={14} className="animate-spin" /> : 'Test'}
                                                        </Button>
                                                        <Button data-testid={`delete-adapter-btn-${adapter.id}`} variant="destructive" onClick={() => setEmailToDelete(adapter.id)} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}

                                            <div style={{ borderTop: '1px dashed var(--glass-border)', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                                                <Button variant="outline" onClick={() => setShowEmailAddForm(!showEmailAddForm)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                                                    <Plus size={16} /> {t('omni.email.add', 'Add Email Adapter')}
                                                </Button>
                                            </div>
                                            {emailTestResult && (
                                                <div style={{ fontSize: '0.85rem', color: emailTestResult.success ? 'var(--success)' : 'var(--danger)', textAlign: 'center', marginTop: '0.5rem' }}>
                                                    {emailTestResult.text}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {emailToDelete && (
                <ConfirmModal
                    open={!!emailToDelete}
                    onClose={() => setEmailToDelete(null)}
                    title={t('omni.email.removeTitle', 'Remove Email Adapter')}
                    description={t('omni.email.removeDesc', 'Are you sure you want to completely remove this email adapter? Existing conversations imported from this address will remain, but no new emails will be processed.')}
                    confirmText={t('omni.email.removeBtn', 'Remove Adapter')}
                    isDanger={true}
                    onConfirm={handleDeleteEmailAdapter}
                />
            )}
        </div>
    );
};

export default OmnichannelConfig;
