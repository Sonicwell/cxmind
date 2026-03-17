import { Checkbox } from '../components/ui/Checkbox';
import { Textarea } from '../components/ui/Textarea';
import React, { useEffect, useState, useCallback } from 'react';
import { useTabParam } from '../hooks/useTabParam';
import { Bell, Plus, Trash2, Pencil, Send, Loader2, XCircle, ToggleLeft, ToggleRight, Sparkles, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
    getAlertChannels,
    createAlertChannel,
    updateAlertChannel,
    deleteAlertChannel,
    testAlertChannel,
    getAlertRoutes,
    createAlertRoute,
    updateAlertRoute,
    deleteAlertRoute
} from '../services/api/alerts';
import {
    getAlertRules,
    getAlertTemplates,
    generateRuleFromPrompt,
    toggleAlertRule,
    deleteAlertRule,
    createAlertRule,
    updateAlertRule,
    getAlertHistory,
} from '../services/api/alert-rules';
import type { AlertRule, AlertRuleTemplate, AlertHistoryRecord } from '../services/api/alert-rules';
import type { AlertChannel, AlertRoute } from '../services/api/alerts';
import { RuleModal } from '../components/alerts/RuleModal';
import { useDemoMode } from '../hooks/useDemoMode';
import '../styles/alerts.css';

import { Button } from '../components/ui/button';

const DEFAULT_WEBHOOKS: Record<string, string> = {
    feishu: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx-xxx-xxx',
    dingtalk: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
    wecom: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx',
    slack: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
    email: 'admin@example.com, ops@example.com',
    custom: 'https://api.yourdomain.com/webhook',
};

const ALERT_EVENT_IDS = ['QUAL_VIOLATION', 'EMOTION_BURNOUT', 'SYSTEM_DEGRADATION', 'RECORDING_UPLOAD_FAILURE', 'TEST_PING'] as const;
const SEVERITY_IDS = ['all', 'info', 'warning', 'critical'] as const;

const Alerts: React.FC = () => {
    const [activeTab, setActiveTab] = useTabParam<'channels' | 'routing' | 'rules'>('tab', 'rules');
    const { demoMode } = useDemoMode();
    const { t } = useTranslation();

    // 运行时构建，确保 t() 在语言切换时响应
    const TYPE_OPTIONS = [
        { value: 'feishu', label: t('alertsPage.typeOptions.feishu') },
        { value: 'dingtalk', label: t('alertsPage.typeOptions.dingtalk') },
        { value: 'wecom', label: t('alertsPage.typeOptions.wecom') },
        { value: 'slack', label: t('alertsPage.typeOptions.slack') },
        { value: 'email', label: t('alertsPage.typeOptions.email') },
        { value: 'custom', label: t('alertsPage.typeOptions.custom') },
    ];
    const ALERT_EVENTS = ALERT_EVENT_IDS.map(id => ({
        id,
        label: t(`alertsPage.events.${id}.label`, id),
        desc: t(`alertsPage.events.${id}.desc`, ''),
    }));
    const SEVERITY_LEVELS = SEVERITY_IDS.map(id => ({
        id,
        label: t(`alertsPage.severity.${id}.label`, id.toUpperCase()),
        desc: t(`alertsPage.severity.${id}.desc`, ''),
    }));

    // --- Channels State ---
    const [channels, setChannels] = useState<AlertChannel[]>([]);
    const [loadingChannels, setLoadingChannels] = useState(true);
    const [showChannelForm, setShowChannelForm] = useState(false);
    const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
    const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [channelToDelete, setChannelToDelete] = useState<string | null>(null);

    // Channel Form State
    const [cName, setCName] = useState('');
    const [cType, setCType] = useState<'dingtalk' | 'wecom' | 'feishu' | 'slack' | 'email' | 'custom'>('feishu');
    const [cEnabled, setCEnabled] = useState(true);
    const [cUrl, setCUrl] = useState('');
    const [cSecret, setCSecret] = useState('');

    const handleTypeChange = (newType: any) => {
        const currentIsDefault = Object.values(DEFAULT_WEBHOOKS).includes(cUrl);
        if (!cUrl || currentIsDefault) {
            setCUrl(DEFAULT_WEBHOOKS[newType] || '');
        }
        setCType(newType);
    };

    // --- Routes State ---
    const [routes, setRoutes] = useState<AlertRoute[]>([]);
    const [routeToDelete, setRouteToDelete] = useState<string | null>(null);
    const [loadingRoutes, setLoadingRoutes] = useState(false);
    const [showRouteForm, setShowRouteForm] = useState(false);
    const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
    const [savingRoute, setSavingRoute] = useState(false);
    const [routeFormError, setRouteFormError] = useState('');

    const [rName, setRName] = useState('');
    const [rEventSearch, setREventSearch] = useState('');
    const [rEvents, setREvents] = useState<string[]>([]);
    const [rSeverity, setRSeverity] = useState<'info' | 'warning' | 'critical' | 'all'>('all');
    const [rChannels, setRChannels] = useState<string[]>([]);
    const [rEnabled, setREnabled] = useState(true);
    const [rCooldown, setRCooldown] = useState(300); // 5 minutes

    // --- Rules State ---
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [templates, setTemplates] = useState<AlertRuleTemplate[]>([]);
    const [history, setHistory] = useState<AlertHistoryRecord[]>([]);
    const [loadingRules, setLoadingRules] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [templateError, setTemplateError] = useState<string | null>(null);
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

    // --- Fetch Data ---
    const fetchChannels = useCallback(async () => {
        setLoadingChannels(true);
        try {
            const data = await getAlertChannels(demoMode);
            setChannels(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingChannels(false);
        }
    }, [demoMode]);

    const fetchRoutes = useCallback(async () => {
        setLoadingRoutes(true);
        try {
            const data = await getAlertRoutes(demoMode);
            setRoutes(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingRoutes(false);
        }
    }, [demoMode]);

    const fetchRulesData = useCallback(async () => {
        setLoadingRules(true);
        try {
            const [rulesData, templatesData, historyData] = await Promise.all([
                getAlertRules(),
                getAlertTemplates(),
                getAlertHistory(1, 10, demoMode).catch(() => ({ data: [] }))
            ]);
            setRules(rulesData);
            setTemplates(templatesData);
            setHistory(historyData.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingRules(false);
        }
    }, [demoMode]);

    useEffect(() => {
        if (activeTab === 'channels') fetchChannels();
        if (activeTab === 'routing') {
            fetchRoutes();
            fetchChannels(); // Need channels for the dropdown options
        }
        if (activeTab === 'rules') {
            fetchRulesData();
        }
    }, [activeTab, fetchChannels, fetchRoutes, fetchRulesData, demoMode]);

    // --- Channel Form Logic ---
    const resetChannelForm = () => {
        setCName('');
        setCType('feishu');
        setCUrl('');
        setCSecret('');
        setCEnabled(true);
        setEditingChannelId(null);
        setShowChannelForm(false);
        setFormError('');
    };

    const handleEditChannel = (ch: AlertChannel) => {
        setEditingChannelId(ch._id);
        setCName(ch.name);
        setCType(ch.type);
        setCUrl(ch.type === 'email' ? (ch.config?.recipients || '') : (ch.config?.webhookUrl || ''));
        setCSecret(ch.config?.secret || '');
        setCEnabled(ch.enabled);
        setShowChannelForm(true);
    };

    const handleSaveChannel = async () => {
        if (!cName) { setFormError(t('alertsPage.errors.nameRequired')); return; }
        if (!cUrl && cType !== 'email') { setFormError(t('alertsPage.errors.urlRequired')); return; }

        setSaving(true);
        try {
            const configPayload = cType === 'email'
                ? { recipients: cUrl, secret: cSecret }
                : { webhookUrl: cUrl, secret: cSecret };

            const payload = {
                name: cName,
                type: cType,
                enabled: cEnabled,
                config: configPayload
            };

            if (editingChannelId) {
                await updateAlertChannel(editingChannelId, payload);
            } else {
                await createAlertChannel(payload);
            }
            fetchChannels();
            resetChannelForm();
        } catch (err: any) {
            setFormError(err.response?.data?.error || t('alertsPage.errors.channelSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteChannel = async () => {
        if (!channelToDelete) return;
        try {
            await deleteAlertChannel(channelToDelete);
            fetchChannels();
        } catch (err: any) {
            alert(err.response?.data?.error || t('alertsPage.errors.channelDeleteFailed'));
        } finally {
            setChannelToDelete(null);
        }
    };

    const handleTestChannel = async (id: string) => {
        setTestResult(null);
        setTestingChannelId(id);
        try {
            const res = await testAlertChannel(id);
            setTestResult({ id, ok: true, msg: `Success (${res.durationMs}ms)` });
        } catch (err: any) {
            setTestResult({ id, ok: false, msg: err.response?.data?.error || 'Test failed' });
        } finally {
            setTestingChannelId(null);
        }
        setTimeout(() => setTestResult(null), 5000);
    };

    // --- Route Form Logic ---
    const resetRouteForm = () => {
        setRName('');
        setREventSearch('');
        setREvents([]);
        setRSeverity('all');
        setRChannels([]);
        setREnabled(true);
        setRCooldown(300);
        setEditingRouteId(null);
        setShowRouteForm(false);
        setRouteFormError('');
    };

    const handleEditRoute = (rt: AlertRoute) => {
        setEditingRouteId(rt._id);
        setRName(rt.name);
        setREvents(rt.events || []);
        setRSeverity(rt.severity);
        setRChannels(rt.channelIds.map(c => typeof c === 'string' ? c : c._id));
        setREnabled(rt.enabled);
        setRCooldown(rt.cooldownSec || 300);
        setShowRouteForm(true);
    };

    const handleSaveRoute = async () => {
        if (!rName) { setRouteFormError(t('alertsPage.errors.routeNameRequired')); return; }
        if (rChannels.length === 0) { setRouteFormError(t('alertsPage.errors.routeChannelRequired')); return; }

        setSavingRoute(true);
        try {
            const payload = {
                name: rName,
                events: rEvents,
                severity: rSeverity,
                channelIds: rChannels,
                enabled: rEnabled,
                cooldownSec: rCooldown
            };

            if (editingRouteId) {
                await updateAlertRoute(editingRouteId, payload);
            } else {
                await createAlertRoute(payload);
            }
            fetchRoutes();
            resetRouteForm();
        } catch (err: any) {
            setRouteFormError(err.response?.data?.error || t('alertsPage.errors.routeSaveFailed'));
        } finally {
            setSavingRoute(false);
        }
    };

    const handleDeleteRoute = async () => {
        if (!routeToDelete) return;
        try {
            await deleteAlertRoute(routeToDelete);
            fetchRoutes();
        } catch (err: any) {
            console.error(err.response?.data?.error || 'Delete failed');
            // Optionally, set a routeFormError here if you want to display it
        } finally {
            setRouteToDelete(null);
        }
    };

    const toggleChannelSelection = (chId: string) => {
        setRChannels(prev =>
            prev.includes(chId) ? prev.filter(c => c !== chId) : [...prev, chId]
        );
    };

    // --- Renders ---

    const renderLivePreview = () => {
        if (cType === 'feishu') {
            return (
                <div className="lp-container">
                    <div className="lp-feishu">
                        <div className="lp-feishu-header">
                            🚨 {t('alertsPage.preview.feishuTitle')}
                        </div>
                        <div className="lp-feishu-body">
                            <p><strong>{t('alertsPage.preview.feishuAgent')}</strong> John Doe (Ext: 1001)</p>
                            <p><strong>{t('alertsPage.preview.feishuRule')}</strong> No false refund promises</p>
                            <p style={{ color: '#d32f2f' }}>❝ Yes ma'am, I guarantee a full refund to your card by tomorrow morning. ❞</p>
                            <div className="lp-feishu-action">
                                🔍 {t('alertsPage.preview.feishuAction')}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (cType === 'dingtalk') {
            return (
                <div className="lp-container">
                    <div className="lp-dingtalk">
                        <h4>⚠️ {t('alertsPage.preview.dingtalkTitle')}</h4>
                        <p><strong>{t('alertsPage.preview.dingtalkNode')}</strong> PBX-Singapore-01</p>
                        <p><strong>{t('alertsPage.preview.dingtalkEvent')}</strong> WebSocket Connection Dropped</p>
                        <p><strong>{t('alertsPage.preview.dingtalkSeverity')}</strong> <span style={{ color: 'red' }}>Critical</span></p>
                        <p style={{ color: '#0052cc', marginTop: '12px', cursor: 'pointer' }}>➡️ {t('alertsPage.preview.dingtalkAction')}</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="lp-container" style={{ color: 'var(--text-muted)' }}>
                <em>{t('alertsPage.channels.noPreview', { type: cType })}</em>
            </div>
        );
    };

    return (
        <div className="al-page">
            <div className="al-header">
                <h1><Bell size={24} color="var(--primary)" /> {t('alertsPage.title')}</h1>
            </div>

            <div className="al-tabs">
                <Button className={`al-tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sparkles size={16} /> {t('alertsPage.tabs.rules')}
                </Button>
                <div style={{ width: '1px', background: 'var(--border)', margin: '0.5rem 0' }}></div>
                <Button className={`al-tab ${activeTab === 'channels' ? 'active' : ''}`} onClick={() => setActiveTab('channels')}>
                    {t('alertsPage.tabs.channels')}
                </Button>
                <Button className={`al-tab ${activeTab === 'routing' ? 'active' : ''}`} onClick={() => setActiveTab('routing')}>
                    {t('alertsPage.tabs.routing')}
                </Button>
            </div>

            {/* Rules Tab */}
            {activeTab === 'rules' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                        {/* NLP Generate Rules Card */}
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>
                                <Sparkles size={18} /> {t('alertsPage.rules.nlpTitle')}
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                {t('alertsPage.rules.nlpDesc')}
                            </p>
                            <Textarea
                                value={aiPrompt}
                                onChange={e => setAiPrompt(e.target.value)}
                                placeholder={t('alertsPage.placeholders.nlpPrompt')}
                                className="input-field"
                                style={{ height: '140px', resize: 'none', marginBottom: '1rem', width: '100%', fontSize: '0.9rem' }}
                            />
                            <Button
                                style={{ width: '100%' }}
                                disabled={!aiPrompt || generating}
                                onClick={async () => {
                                    setGenerating(true);
                                    try {
                                        setTemplateError(null);
                                        await generateRuleFromPrompt(aiPrompt);
                                        // Auto refresh rules list after generation
                                        fetchRulesData();
                                        setAiPrompt('');
                                    } catch (err: any) {
                                        setTemplateError(err.response?.data?.error || t('alertsPage.errors.generateFailed'));
                                    } finally {
                                        setGenerating(false);
                                    }
                                }}
                            >
                                {generating ? <Loader2 size={16} className="spinning" /> : t('alertsPage.rules.generateBtn')}
                            </Button>
                        </div>

                        {/* Templates Card */}
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <Plus size={18} /> {t('alertsPage.rules.templatesTitle')}
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                {t('alertsPage.rules.templatesDesc')}
                            </p>

                            {templateError && (
                                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid #fecaca' }}>
                                    <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{t('alertsPage.rules.error')}</strong>
                                    {templateError}
                                </div>
                            )}

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem' }}>
                                {templates.map(tpl => (
                                    <div key={tpl.id} className="al-channel-select-card" style={{ padding: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tpl.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tpl.description}</div>
                                        </div>
                                        <Button
                                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                            onClick={async () => {
                                                const ruleToCreate = tpl.rulesToInject[0] || {};
                                                try {
                                                    setTemplateError(null);
                                                    await createAlertRule({ ...ruleToCreate, templateId: tpl.id } as any);
                                                    fetchRulesData();
                                                } catch (e: any) {
                                                    setTemplateError(e.response?.data?.error || t('alertsPage.errors.deployFailed'));
                                                }
                                            }}
                                        >
                                            {t('alertsPage.rules.deploy')}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Active Rules List */}
                    <div className="al-list">
                        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{t('alertsPage.rules.activeTracker')}</h3>
                            <Button variant="secondary"
                                onClick={() => {
                                    setEditingRule(null);
                                    setShowRuleModal(true);
                                }}
                            >
                                <Plus size={16} /> {t('alertsPage.rules.addCustomRule')}
                            </Button>
                        </div>
                        {loadingRules ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('alertsPage.rules.loadingRules')}</div>
                        ) : rules.length === 0 ? (
                            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                                <Bell size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                <p>{t('alertsPage.rules.noRules')}</p>
                            </div>
                        ) : (
                            rules.map(rule => (
                                <div key={rule._id} className={`al-card glass-panel ${!rule.enabled ? 'disabled' : ''}`}>
                                    <div className="al-card-info" style={{ width: '100%' }}>
                                        <div className="al-card-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {rule.name}
                                                {rule.isSystemDefault && <Badge style={{ fontSize: '0.65rem' }}>{t('alertsPage.rules.system')}</Badge>}
                                                <Badge style={{ borderColor: 'hsla(var(--primary-hue), 50%, 50%, 0.3)', color: 'var(--primary)' }}>
                                                    {rule.eventTrigger}
                                                </Badge>
                                            </div>
                                            <Button variant="ghost" size="icon" style={{ padding: 0 }} onClick={() => {
                                                toggleAlertRule(rule._id, !rule.enabled).then(fetchRulesData);
                                            }}>
                                                {rule.enabled ? <ToggleRight size={24} color="var(--success)" /> : <ToggleLeft size={24} />}
                                            </Button>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                            {rule.description || t('alertsPage.rules.noDesc')}
                                        </div>

                                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'hsla(0,0%,0%,0.2)', borderRadius: '8px', border: '1px solid hsla(var(--primary-hue), 20%, 50%, 0.15)' }}>
                                            {rule.smartBaseline ? (
                                                <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                                                    <Sparkles size={16} />
                                                    <span>{t('alertsPage.rules.smartBaseline')}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>{t('alertsPage.rules.smartBaselineDesc')}</span></span>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {rule.metricExpressions.map((exp: any, i: number) => {
                                                        const opMap: Record<string, string> = { 'GT': t('alertsPage.expressions.goesAbove'), 'LT': t('alertsPage.expressions.dropsBelow'), 'EQ': t('alertsPage.expressions.equals'), 'GTE': t('alertsPage.expressions.atLeast'), 'LTE': t('alertsPage.expressions.atMost') };
                                                        return (
                                                            <div key={i} style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                                                                <span style={{ color: 'var(--text-muted)' }}>{t('alertsPage.expressions.if')} </span>
                                                                <span style={{ color: 'var(--primary-light)', fontWeight: 600, background: 'hsla(var(--primary-hue), 50%, 50%, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{exp.metric.replace(/_/g, ' ')}</span>
                                                                <span style={{ margin: '0 0.4rem' }}>{opMap[exp.operator] || exp.operator}</span>
                                                                <span style={{ color: 'var(--warning)', fontWeight: 600, background: 'hsla(35, 90%, 50%, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{exp.threshold}</span>
                                                                <span style={{ color: 'var(--text-muted)', margin: '0 0.4rem' }}>{t('alertsPage.expressions.continuouslyFor')}</span>
                                                                <span style={{ color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px dashed var(--border)' }}>{rule.durationWindowSec} {t('alertsPage.expressions.seconds')}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            <Button variant="ghost" size="icon" title="Edit Rule" onClick={() => {
                                                setEditingRule(rule);
                                                setShowRuleModal(true);
                                            }}>
                                                <Pencil size={16} /> {t('alertsPage.rules.edit')}
                                            </Button>
                                            <Button variant="destructive" size="icon" title="Delete Rule" onClick={() => {
                                                deleteAlertRule(rule._id).then(fetchRulesData);
                                            }}>
                                                <Trash2 size={16} /> {t('alertsPage.rules.delete')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Alert History Timeline */}
                    <div className="al-list" style={{ marginTop: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                            <Bell size={18} /> {t('alertsPage.rules.historyTitle')}
                        </h3>
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            {history.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('alertsPage.rules.noHistory')}</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {history.map(h => (
                                        <div key={h._id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                                            <div style={{
                                                width: '10px', height: '10px', borderRadius: '50%', marginTop: '6px',
                                                background: h.severity === 'critical' ? 'var(--danger)' : h.severity === 'warning' ? 'var(--warning)' : 'var(--primary)'
                                            }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{h.ruleName}</strong>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(h.timestamp).toLocaleString()}</span>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    {t('alertsPage.expressions.triggeredBecause')} <strong>{h.metric}</strong> {t('alertsPage.expressions.hit')} <strong>{h.triggerValue?.toFixed ? h.triggerValue.toFixed(2) : h.triggerValue}</strong> ({t('alertsPage.expressions.threshold')}: {h.threshold}).
                                                </div>
                                                {/* Render Mock Enriched Fields */}
                                                {(h as any).route && (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <span style={{ padding: '0.15rem 0.4rem', background: 'hsla(var(--primary-hue), 20%, 50%, 0.1)', borderRadius: '4px', border: '1px solid hsla(var(--primary-hue), 20%, 50%, 0.2)' }}>
                                                            {(h as any).route}
                                                        </span>
                                                        {(h as any).channels && (h as any).channels.length > 0 && (
                                                            <>
                                                                <span style={{ fontSize: '0.7rem' }}>{t('alertsPage.rules.notified')}</span>
                                                                {(h as any).channels.map((ch: string, idx: number) => (
                                                                    <span key={idx} style={{ padding: '0.15rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'hsla(0, 0%, 50%, 0.1)', borderRadius: '4px' }}>
                                                                        {ch.toLowerCase().includes('email') ? '✉️' : ch.toLowerCase().includes('slack') ? '💬' : '🔔'} {ch}
                                                                    </span>
                                                                ))}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            <RuleModal
                open={showRuleModal}
                onClose={() => {
                    setShowRuleModal(false);
                    setEditingRule(null);
                }}
                initialData={editingRule}
                onSave={async (ruleData) => {
                    if (editingRule) {
                        await updateAlertRule(editingRule._id, ruleData);
                    } else {
                        await createAlertRule(ruleData);
                    }
                    await fetchRulesData();
                }}
            />

            {/* Channels Tab */}
            {activeTab === 'channels' && (
                <>
                    {!showChannelForm && (
                        <div style={{ marginBottom: '1rem' }}>
                            <Button onClick={() => {
                                resetChannelForm();
                                setCUrl(DEFAULT_WEBHOOKS['feishu']);
                                setShowChannelForm(true);
                            }}>
                                <Plus size={16} /> {t('alertsPage.channels.addChannel')}
                            </Button>
                        </div>
                    )}

                    {showChannelForm && (
                        <div className="al-form glass-panel">
                            <div className="al-form-fields">
                                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {editingChannelId ? <Pencil size={18} /> : <Plus size={18} />}
                                    {editingChannelId ? t('alertsPage.channels.editChannel') : t('alertsPage.channels.newChannel')}
                                </h3>

                                <div className="al-field">
                                    <label>{t('alertsPage.channels.channelName')}</label>
                                    <Input value={cName} onChange={e => setCName(e.target.value)} placeholder={t('alertsPage.placeholders.channelName')} />
                                </div>
                                <div className="al-field">
                                    <label>{t('alertsPage.channels.platformType')}</label>
                                    <DropdownMenu
                                        trigger={
                                            <Button
                                                type="button" variant="secondary"
                                                style={{ width: '100%', justifyContent: 'space-between', background: 'hsla(0, 0%, 0%, 0.2)', border: '1px solid hsla(var(--primary-hue), 20%, 50%, 0.2)', padding: '0.6rem 0.8rem', fontWeight: 'normal', color: 'var(--text-primary)' }}
                                            >
                                                {TYPE_OPTIONS.find(o => o.value === cType)?.label}
                                                <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                                            </Button>
                                        }
                                        align="start"
                                        items={TYPE_OPTIONS.map(opt => ({
                                            label: opt.label,
                                            icon: cType === opt.value ? <Check size={14} /> : <div style={{ width: 14 }} />,
                                            onClick: () => handleTypeChange(opt.value)
                                        }))}
                                    />
                                </div>

                                {cType === 'email' ? (
                                    <div className="al-field">
                                        <label>{t('alertsPage.channels.recipientEmails', 'Recipient Emails')}</label>
                                        <Input value={cUrl} onChange={e => setCUrl(e.target.value)} placeholder="admin@example.com, ops@example.com" />
                                        <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                            <span style={{ color: 'var(--info)', marginRight: '4px' }}>ℹ️</span>
                                            {t('alertsPage.channels.emailHint', 'Requires System SMTP configuration in Settings.')}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="al-field">
                                            <label>{t('alertsPage.channels.webhookUrl')}</label>
                                            <Input value={cUrl} onChange={e => setCUrl(e.target.value)} placeholder="https://..." autoComplete="new-password" data-lpignore="true" data-form-type="other" />
                                            {cType === 'custom' && (
                                                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                                    <span style={{ color: 'var(--warning)', marginRight: '4px' }}>ℹ️</span>
                                                    {t('alertsPage.channels.intranetNote')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="al-field">
                                            <label>{t('alertsPage.channels.secretKey')}</label>
                                            <Input value={cSecret} onChange={e => setCSecret(e.target.value)} type="password" placeholder={t('alertsPage.placeholders.secretKey')} autoComplete="new-password" data-lpignore="true" data-form-type="other" />
                                        </div>
                                    </>
                                )}

                                <div className="al-field" style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Button variant="ghost" size="icon" style={{ padding: 0 }} onClick={() => setCEnabled(!cEnabled)}>
                                        {cEnabled ? <ToggleRight size={24} color="var(--success)" /> : <ToggleLeft size={24} />}
                                    </Button>
                                    <span style={{ fontSize: '0.9rem' }}>{cEnabled ? t('alertsPage.channels.active') : t('alertsPage.channels.disabled')}</span>
                                </div>

                                {formError && (
                                    <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <XCircle size={14} /> {formError}
                                    </div>
                                )}

                                <div className="al-form-actions">
                                    <Button onClick={handleSaveChannel} disabled={saving}>
                                        {saving ? <Loader2 size={16} className="spinning" /> : t('alertsPage.channels.saveChannel')}
                                    </Button>
                                    <Button variant="secondary" onClick={resetChannelForm}>{t('alertsPage.channels.cancel')}</Button>
                                </div>
                            </div>

                            {/* Live Template Preview Panel */}
                            <div className="al-form-preview">
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    <Sparkles size={16} /> {t('alertsPage.channels.livePreview')}
                                </h4>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    {t('alertsPage.channels.livePreviewDesc')}
                                </p>
                                {renderLivePreview()}
                            </div>
                        </div>
                    )}

                    {loadingChannels ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('alertsPage.channels.loadingChannels')}</div>
                    ) : channels.length === 0 && !showChannelForm ? (
                        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                            <Bell size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p>{t('alertsPage.channels.noChannels')}</p>
                        </div>
                    ) : (
                        <div className="al-list">
                            {channels.map(ch => (
                                <div key={ch._id} className={`al-card glass-panel ${!ch.enabled ? 'disabled' : ''}`}>
                                    <div className="al-card-info">
                                        <div className="al-card-name" style={{ display: 'flex', alignItems: 'center' }}>
                                            {ch.name}
                                            <span className="al-card-type">{ch.type.toUpperCase()}</span>
                                            {ch.enabled ? (
                                                <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'hsla(150, 60%, 50%, 0.15)', color: '#10b981', marginLeft: '0.5rem', border: '1px solid hsla(150, 60%, 50%, 0.3)' }}>{t('alertsPage.channels.active')}</span>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'hsla(0, 0%, 50%, 0.15)', color: '#9ca3af', marginLeft: '0.5rem', border: '1px solid hsla(0, 0%, 50%, 0.3)' }}>{t('alertsPage.channels.disabled')}</span>
                                            )}
                                        </div>
                                        {ch.config?.webhookUrl && <div className="al-card-url">{ch.config.webhookUrl}</div>}
                                    </div>
                                    <div className="al-card-actions" style={{ position: 'relative' }}>
                                        <Button variant="ghost" size="icon" title="Test Ping" onClick={() => handleTestChannel(ch._id)} disabled={testingChannelId === ch._id}>
                                            {testingChannelId === ch._id ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                        </Button>
                                        <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEditChannel(ch)}>
                                            <Pencil size={18} />
                                        </Button>
                                        <Button variant="destructive" size="icon" title="Delete" onClick={() => setChannelToDelete(ch._id)}>
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>

                                    {testResult?.id === ch._id && (
                                        <div style={{ position: 'absolute', bottom: '10px', right: '20px', fontSize: '0.8rem', color: testResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                                            {testResult.msg}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Routing Tab */}
            {activeTab === 'routing' && (
                <>
                    {!showRouteForm && (
                        <div style={{ marginBottom: '1rem' }}>
                            <Button onClick={() => {
                                resetRouteForm();
                                setShowRouteForm(true);
                            }}>
                                <Plus size={16} /> {t('alertsPage.routing.addRoute')}
                            </Button>
                        </div>
                    )}

                    {showRouteForm && (
                        <div className="al-routing-card">
                            <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                                {editingRouteId ? <Pencil size={20} color="var(--primary)" /> : <Plus size={20} color="var(--primary)" />}
                                {editingRouteId ? t('alertsPage.routing.editRouting') : t('alertsPage.routing.newRouting')}
                            </h3>

                            <div className="al-field">
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('alertsPage.routing.ruleName')}</label>
                                <Input
                                    value={rName}
                                    onChange={(e: any) => setRName(e.target.value)}
                                    placeholder={t('alertsPage.placeholders.routeName')}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '2rem', width: '100%', marginTop: '1.5rem' }}>
                                <div className="al-field" style={{ flex: 1.5 }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('alertsPage.routing.triggerEvents')} <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>{t('alertsPage.routing.multiSelect')}</span></label>
                                    <Input
                                        value={rEventSearch}
                                        onChange={(e: any) => setREventSearch(e.target.value)}
                                        placeholder={t('alertsPage.placeholders.searchEvents')}
                                        style={{ marginBottom: '0.8rem', padding: '0.5rem 0.8rem', fontSize: '0.85rem' }}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                                        {ALERT_EVENTS.filter(ev => ev.label.toLowerCase().includes(rEventSearch.toLowerCase()) || ev.id.toLowerCase().includes(rEventSearch.toLowerCase()) || ev.desc.toLowerCase().includes(rEventSearch.toLowerCase())).map(ev => {
                                            const isSelected = rEvents.includes(ev.id);
                                            return (
                                                <div
                                                    key={ev.id}
                                                    onClick={() => {
                                                        if (isSelected) setREvents(prev => prev.filter(e => e !== ev.id));
                                                        else setREvents(prev => [...prev, ev.id]);
                                                    }}
                                                    className={`al-channel-select-card ${isSelected ? 'selected' : ''}`}
                                                    style={{ padding: '0.6rem 1rem' }}
                                                >
                                                    <div className="al-channel-select-card-icon" style={{ minWidth: '18px' }}>
                                                        {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isSelected ? 'var(--primary)' : 'var(--text-primary)' }}>{ev.label}</span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>{ev.desc}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="al-field" style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('alertsPage.routing.severityFilter')}</label>
                                    {/* Empty placeholder spacer to align with the search input on the left */}
                                    <div style={{ height: '36px', marginBottom: '0.8rem' }}></div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                                        {SEVERITY_LEVELS.map(sev => {
                                            const isSelected = rSeverity === sev.id;
                                            return (
                                                <div
                                                    key={sev.id}
                                                    onClick={() => setRSeverity(sev.id as any)}
                                                    className={`al-channel-select-card ${isSelected ? 'selected' : ''}`}
                                                    style={{ padding: '0.6rem 1rem' }}
                                                >
                                                    <div className="al-channel-select-card-icon" style={{ minWidth: '18px', flexShrink: 0 }}>
                                                        {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isSelected ? 'var(--primary)' : 'var(--text-primary)' }}>{sev.label}</span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>{sev.desc}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="al-field" style={{ marginTop: '1.5rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                    {t('alertsPage.routing.targetChannels')} <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>{t('alertsPage.routing.selectAtLeastOne')}</span>
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                    {channels.length === 0 ? (
                                        <span style={{ fontSize: '0.85rem', color: 'var(--danger)', padding: '1rem', background: 'hsla(0, 100%, 50%, 0.1)', borderRadius: '8px' }}>{t('alertsPage.routing.createChannelFirst')}</span>
                                    ) : (
                                        channels.map(ch => {
                                            const isSelected = rChannels.includes(ch._id);
                                            return (
                                                <div
                                                    key={ch._id}
                                                    onClick={() => toggleChannelSelection(ch._id)}
                                                    className={`al-channel-select-card ${isSelected ? 'selected' : ''}`}
                                                >
                                                    <div className="al-channel-select-card-icon">
                                                        {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: isSelected ? 'var(--primary)' : 'var(--text-primary)' }}>{ch.name}</span>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{ch.type}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="al-setting-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <label className="toggle-switch">
                                        <Checkbox
                                            checked={rEnabled}
                                            onChange={e => setREnabled(e.target.checked)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: rEnabled ? 'var(--success)' : 'var(--text-muted)' }}>
                                            {rEnabled ? t('alertsPage.routing.ruleActive') : t('alertsPage.routing.rulePaused')}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {rEnabled ? t('alertsPage.routing.ruleActiveDesc') : t('alertsPage.routing.rulePausedDesc')}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('alertsPage.routing.cooldownPeriod')}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--glass-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }}>
                                        <Input
                                            type="number"
                                            value={rCooldown}
                                            onChange={e => setRCooldown(parseInt(e.target.value) || 0)}
                                            style={{
                                                width: '60px', padding: '0.5rem',
                                                background: 'transparent', border: 'none',
                                                color: 'var(--text-primary)', textAlign: 'center',
                                                outline: 'none', fontSize: '0.9rem'
                                            }}
                                        />
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingRight: '0.5rem' }}>{t('alertsPage.routing.seconds')}</span>
                                    </div>
                                </div>
                            </div>

                            {routeFormError && (
                                <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <XCircle size={14} /> {routeFormError}
                                </div>
                            )}

                            <div className="al-form-actions">
                                <Button onClick={handleSaveRoute} disabled={savingRoute || rChannels.length === 0}>
                                    {savingRoute ? <Loader2 size={16} className="spinning" /> : t('alertsPage.routing.saveRule')}
                                </Button>
                                <Button variant="secondary" onClick={resetRouteForm}>{t('alertsPage.routing.cancel')}</Button>
                            </div>
                        </div>
                    )}

                    {loadingRoutes ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('alertsPage.routing.loadingRoutes')}</div>
                    ) : routes.length === 0 && !showRouteForm ? (
                        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                            <Bell size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p>{t('alertsPage.routing.noRoutes')}</p>
                        </div>
                    ) : (
                        <div className="al-list">
                            {routes.map(r => (
                                <div key={r._id} className={`al-card glass-panel ${!r.enabled ? 'disabled' : ''}`}>
                                    <div className="al-card-info">
                                        <div className="al-card-name" style={{ display: 'flex', alignItems: 'center' }}>
                                            {r.name}
                                            {r.events?.slice(0, 2).map(ev => (
                                                <Badge key={ev} style={{ marginLeft: '0.5rem', color: 'var(--primary)', borderColor: 'hsla(var(--primary-hue), 50%, 50%, 0.3)', background: 'hsla(var(--primary-hue), 50%, 50%, 0.1)', fontSize: '0.65rem' }}>
                                                    {ALERT_EVENTS.find(e => e.id === ev)?.label || ev}
                                                </Badge>
                                            ))}
                                            {(r.events?.length || 0) > 2 && (
                                                <Badge style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>+{r.events.length - 2}</Badge>
                                            )}
                                            <Badge style={{ marginLeft: '0.5rem', color: 'var(--warning)', borderColor: 'hsla(35, 90%, 50%, 0.3)', background: 'hsla(35, 90%, 50%, 0.1)' }}>{r.severity.toUpperCase()}</Badge>
                                            {r.enabled ? (
                                                <Badge variant="success" style={{ marginLeft: '0.5rem' }}>{t('alertsPage.channels.active')}</Badge>
                                            ) : (
                                                <Badge style={{ marginLeft: '0.5rem' }}>{t('alertsPage.routing.paused')}</Badge>
                                            )}
                                        </div>
                                        <div className="al-card-url" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {t('alertsPage.routing.targets')}
                                            {r.channelIds.map((c: any) => (
                                                <span key={c._id || c} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)' }}>
                                                    <Send size={10} color="var(--primary)" /> {c.name || t('alertsPage.routing.unknownChannel')}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>{t('alertsPage.routing.cooldown')} {r.cooldownSec}s</div>
                                    </div>
                                    <div className="al-card-actions">
                                        <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEditRoute(r)}>
                                            <Pencil size={18} />
                                        </Button>
                                        <Button variant="destructive" size="icon" title="Delete" onClick={() => setRouteToDelete(r._id)}>
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            <ConfirmModal
                open={!!channelToDelete}
                onClose={() => setChannelToDelete(null)}
                onConfirm={handleDeleteChannel}
                title={t('alertsPage.confirm.deleteChannelTitle')}
                description={t('alertsPage.confirm.deleteChannelDesc')}
                confirmText={t('alertsPage.confirm.deleteChannelConfirm')}
            />

            <ConfirmModal
                open={!!routeToDelete}
                onClose={() => setRouteToDelete(null)}
                onConfirm={handleDeleteRoute}
                title={t('alertsPage.confirm.deleteRouteTitle')}
                description={t('alertsPage.confirm.deleteRouteDesc')}
                confirmText={t('alertsPage.confirm.deleteRouteConfirm')}
            />
        </div>
    );
};

export default Alerts;

