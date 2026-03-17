import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import React, { useEffect, useState, useCallback } from 'react';
import { useVisibilityAwareInterval } from '../hooks/useVisibilityAwareInterval';
import api from '../services/api';
import {
    Webhook, Plus, Trash2, Pencil, Loader2, CheckCircle2,
    XCircle, RotateCw, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
    Zap, Sparkles, Copy, Shield, Terminal,
    Activity, Filter, Code2, BookOpen,
} from 'lucide-react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useTranslation } from 'react-i18next';
import '../styles/webhooks.css';

import { Button } from '../components/ui/button';
import { copyToClipboard } from '../utils/clipboard';

// ── Types ──

interface RetryPolicy {
    maxRetries: number;
    backoffMs: number;
}

interface FilterCondition {
    field: string;
    operator: string;
    value: string;
}

interface WebhookConfig {
    _id: string;
    name: string;
    url: string;
    secret: string;
    events: string[];
    headers?: Record<string, string>;
    enabled: boolean;
    clientId?: string;
    retryPolicy: RetryPolicy;
    filterConditions?: FilterCondition[];
    payloadTemplate?: string;
    ticketProvider?: string;
    ticketConfig?: { issueType?: string; tableName?: string };
    createdAt: string;
    updatedAt: string;
}

interface DeliveryLog {
    delivery_id: string;
    event: string;
    status_code: number;
    error: string;
    attempts: number;
    duration_ms: number;
    created_at: string;
}

interface HealthState {
    failures: number;
    open: boolean;
    cooldownRemainMs: number;
    level: 'healthy' | 'degraded' | 'circuit_open';
}

interface DeepPingResult {
    success: boolean;
    statusCode: number;
    error: string;
    durationMs: number;
    request?: { url: string; method: string; headers: Record<string, string>; body: string };
    response?: { statusCode: number; statusText: string; body: string; headers: Record<string, string> };
}

interface HeatmapBucket {
    hour: string;
    success: number;
    failure: number;
    total: number;
}

interface WorkerStatus {
    queueLen: number;
    retryLen: number;
    deliveredTotal: number;
    failedTotal: number;
}

const ALL_EVENTS = ['call_create', 'call_hangup', 'call_summary', 'call_outcome', 'quality_score', 'action_execution', 'ticket_created'] as const;

const FILTER_OPERATORS = [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'gte', label: '≥' },
    { value: 'lte', label: '≤' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'not contains' },
];

const COMMON_FIELDS = [
    'outcome', 'duration', 'agentId', 'callId', 'sentiment',
    'score', 'intent', 'direction', 'status',
];

// ── Mock payload samples (for {t('webhooksPage.form.livePreview', 'Live Preview')}) ──
const MOCK_PAYLOADS: Record<string, any> = {
    call_create: { callId: 'call_abc123', agentId: 'agent_007', direction: 'inbound', callerNumber: '+8613812345678', timestamp: '2026-02-26T08:00:00Z' },
    call_hangup: { callId: 'call_abc123', agentId: 'agent_007', duration: 185, outcome: 'high_intent', sentiment: 'positive' },
    call_summary: { callId: 'call_abc123', summary: 'Customer inquired about product pricing...', intent: 'pricing', nextAction: 'follow_up' },
    call_outcome: { callId: 'call_abc123', outcome: 'converted', confidence: 0.92, agentId: 'agent_007' },
    quality_score: { callId: 'call_abc123', score: 87, category: 'compliance', details: { greeting: true, closing: true } },
    action_execution: { actionId: 'act_xyz', intent: 'create_ticket', payload: { subject: 'Follow up', priority: 'high' } },
    ticket_created: { ticketId: 'PROJ-123', ticketUrl: 'https://your-org.atlassian.net/browse/PROJ-123', provider: 'jira', event: 'call_hangup' },
};

// ── Verification code snippets ──
const VERIFY_SNIPPETS: Record<string, string> = {
    'Node.js': `const crypto = require('crypto');
const signature = req.headers['x-cxmind-signature'];
const hash = 'sha256=' + crypto
  .createHmac('sha256', YOUR_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');
const isValid = crypto.timingSafeEqual(
  Buffer.from(signature), Buffer.from(hash)
);`,
    'Python': `import hmac, hashlib
signature = request.headers.get('X-CXMind-Signature')
hash = 'sha256=' + hmac.new(
    YOUR_SECRET.encode(), request.data, hashlib.sha256
).hexdigest()
is_valid = hmac.compare_digest(signature, hash)`,
    'Go': `mac := hmac.New(sha256.New, []byte(secret))
mac.Write(body)
expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
isValid := hmac.Equal([]byte(sig), []byte(expected))`,
};

// ── CRM Preset Templates ──

interface CRMTemplate {
    id: string;
    name: string;
    icon: string;
    description: string;
    urlTemplate: string;
    headers: Record<string, string>;
    events: string[];
    authNote: string;
}

const CRM_TEMPLATES: CRMTemplate[] = [
    {
        id: 'salesforce',
        name: 'Salesforce',
        icon: '☁️',
        description: 'Platform Events / Apex REST',
        urlTemplate: 'https://{instance}.salesforce.com/services/data/v59.0/sobjects/CXMind_Event__e',
        headers: { 'Authorization': 'Bearer {access_token}', 'Content-Type': 'application/json' },
        events: ['call_hangup', 'call_summary', 'call_outcome'],
        authNote: 'Requires OAuth 2.0 Bearer Token',
    },
    {
        id: 'hubspot',
        name: 'HubSpot',
        icon: '🟠',
        description: 'Workflows Webhook Action',
        urlTemplate: 'https://api.hubapi.com/crm/v3/objects/calls',
        headers: { 'Authorization': 'Bearer {api_key}', 'Content-Type': 'application/json' },
        events: ['call_hangup', 'call_summary', 'call_outcome'],
        authNote: 'Requires HubSpot API Key or OAuth',
    },
    {
        id: 'zoho',
        name: 'Zoho CRM',
        icon: '🔴',
        description: 'Zoho Flow Webhooks',
        urlTemplate: 'https://flow.zoho.com/v1/webhooks/{flow_id}/trigger',
        headers: { 'Content-Type': 'application/json' },
        events: ['call_hangup', 'call_summary', 'quality_score'],
        authNote: 'Requires Zoho Flow webhook URL',
    },
    {
        id: 'freshdesk',
        name: 'Freshdesk',
        icon: '🟢',
        description: 'HMAC-SHA256 compatible',
        urlTemplate: 'https://{domain}.freshdesk.com/api/v2/webhooks',
        headers: { 'Content-Type': 'application/json' },
        events: ['call_hangup', 'call_outcome', 'quality_score'],
        authNote: 'Uses HMAC-SHA256 (same as CXMind)',
    },
    {
        id: 'zendesk',
        name: 'Zendesk',
        icon: '💚',
        description: 'Native webhook receiver',
        urlTemplate: 'https://{subdomain}.zendesk.com/api/v2/webhooks',
        headers: { 'Authorization': 'Basic {base64_credentials}', 'Content-Type': 'application/json' },
        events: ['call_hangup', 'call_summary', 'call_outcome'],
        authNote: 'Supports Bearer Token / Basic Auth',
    },
    {
        id: 'custom',
        name: 'Custom',
        icon: '🔗',
        description: 'Any HTTP endpoint',
        urlTemplate: 'https://your-server.com/webhook',
        headers: { 'Content-Type': 'application/json' },
        events: [...ALL_EVENTS],
        authNote: 'Any REST API with HMAC-SHA256 verify',
    },
];

// ── Confetti effect ──
function fireConfetti() {
    const container = document.createElement('div');
    container.className = 'wh-confetti-container';
    document.body.appendChild(container);
    const colors = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
    for (let i = 0; i < 100; i++) {
        const piece = document.createElement('div');
        piece.className = 'wh-confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 0.5 + 's';
        piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
        container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 3500);
}

// ── Main Component ──

const Webhooks: React.FC = () => {
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
    const { t } = useTranslation();
    const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deliveries, setDeliveries] = useState<DeliveryLog[]>([]);
    const [deliveriesLoading, setDeliveriesLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [webhookToDelete, setWebhookToDelete] = useState<string | null>(null);

    // V2: Health states per webhook
    const [healthStates, setHealthStates] = useState<Record<string, HealthState>>({});

    // V2: Deep Ping Drawer
    const [deepPingId, setDeepPingId] = useState<string | null>(null);
    const [deepPingResult, setDeepPingResult] = useState<DeepPingResult | null>(null);
    const [deepPingLoading, setDeepPingLoading] = useState(false);

    // V2: Secret rotate
    const [rotatingSecret, setRotatingSecret] = useState<string | null>(null);
    const [newSecret, setNewSecret] = useState<string | null>(null);
    // V2: Verification docs modal
    const [showVerifyDocs, setShowVerifyDocs] = useState(false);
    const [verifyLang, setVerifyLang] = useState('Node.js');

    // V2: Heatmap
    const [heatmapId, setHeatmapId] = useState<string | null>(null);
    const [heatmapData, setHeatmapData] = useState<HeatmapBucket[]>([]);
    const [heatmapLoading, setHeatmapLoading] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formSecret, setFormSecret] = useState('');
    const [formEvents, setFormEvents] = useState<string[]>([...ALL_EVENTS]);
    const [formEnabled, setFormEnabled] = useState(true);
    const [formMaxRetries, setFormMaxRetries] = useState(3);
    const [formBackoffMs, setFormBackoffMs] = useState(1000);
    const [formFilters, setFormFilters] = useState<FilterCondition[]>([]);
    const [formPayloadTemplate, setFormPayloadTemplate] = useState('');
    const [formTicketProvider, setFormTicketProvider] = useState('');
    const [formTicketIssueType, setFormTicketIssueType] = useState('');
    const [formTicketTableName, setFormTicketTableName] = useState('incident');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const fetchWebhooks = useCallback(async () => {
        try {
            const res = await api.get('/platform/webhooks');
            setWebhooks(res.data.data || []);
            setWorkerStatus(res.data.workerStatus || null);
        } catch (err) {
            console.error('Failed to load webhooks:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

    // V2: Fetch health states for all webhooks
    useEffect(() => {
        if (webhooks.length === 0) return;
        const fetchHealth = async () => {
            const states: Record<string, HealthState> = {};
            await Promise.all(
                webhooks.map(async (wh) => {
                    try {
                        const res = await api.get(`/platform/webhooks/${wh._id}/health`);
                        states[wh._id] = res.data;
                    } catch { /* ignore */ }
                })
            );
            setHealthStates(states);
        };
        fetchHealth();
    }, [webhooks]);
    // health状态: 后台不轮询
    const fetchHealthForInterval = useCallback(async () => {
        if (webhooks.length === 0) return;
        const states: Record<string, HealthState> = {};
        await Promise.all(
            webhooks.map(async (wh) => {
                try {
                    const res = await api.get(`/platform/webhooks/${wh._id}/health`);
                    states[wh._id] = res.data;
                } catch { /* ignore */ }
            })
        );
        setHealthStates(states);
    }, [webhooks]);
    useVisibilityAwareInterval(fetchHealthForInterval, 15000, webhooks.length > 0);

    const resetForm = () => {
        setFormName('');
        setFormUrl('');
        setFormSecret('');
        setFormEvents([...ALL_EVENTS]);
        setFormEnabled(true);
        setFormMaxRetries(3);
        setFormBackoffMs(1000);
        setFormFilters([]);
        setFormPayloadTemplate('');
        setFormTicketProvider('');
        setFormTicketIssueType('');
        setFormTicketTableName('incident');
        setEditingId(null);
        setShowForm(false);
        setSelectedTemplate(null);
    };

    const applyTemplate = (tpl: CRMTemplate) => {
        setSelectedTemplate(tpl.id);
        setFormName(tpl.name + ' Webhook');
        setFormUrl(tpl.urlTemplate);
        setFormEvents([...tpl.events]);
        setShowForm(true);
    };

    const handleCreate = async () => {
        setFormError('');
        if (!formName) { setFormError(t('webhooksPage.errors.nameReq', 'Name is required')); return; }
        if (!formUrl) { setFormError(t('webhooksPage.errors.urlReq', 'URL is required')); return; }
        if (!formSecret) { setFormError(t('webhooksPage.errors.secretReq', 'Secret is required for HMAC-SHA256 signing')); return; }
        if (formEvents.length === 0) { setFormError(t('webhooksPage.errors.eventReq', 'Select at least one event')); return; }
        setSaving(true);
        try {
            await api.post('/platform/webhooks', {
                name: formName,
                url: formUrl,
                secret: formSecret,
                events: formEvents,
                enabled: formEnabled,
                retryPolicy: { maxRetries: formMaxRetries, backoffMs: formBackoffMs },
                filterConditions: formFilters,
                payloadTemplate: formPayloadTemplate,
                ...(formEvents.includes('ticket_created') && formTicketProvider ? {
                    ticketProvider: formTicketProvider,
                    ticketConfig: {
                        issueType: formTicketIssueType || undefined,
                        tableName: formTicketTableName || undefined,
                    },
                } : {}),
            });
            setFormError('');
            resetForm();
            fetchWebhooks();
            // 🎉 Confetti on successful create
            fireConfetti();
        } catch (err: any) {
            console.error('Create failed:', err);
            setFormError(err.response?.data?.error || t('webhooksPage.errors.createFailed', 'Failed to create webhook'));
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingId) return;
        setSaving(true);
        try {
            const updates: any = {
                name: formName,
                url: formUrl,
                events: formEvents,
                enabled: formEnabled,
                retryPolicy: { maxRetries: formMaxRetries, backoffMs: formBackoffMs },
                filterConditions: formFilters,
                payloadTemplate: formPayloadTemplate,
                ...(formEvents.includes('ticket_created') && formTicketProvider ? {
                    ticketProvider: formTicketProvider,
                    ticketConfig: {
                        issueType: formTicketIssueType || undefined,
                        tableName: formTicketTableName || undefined,
                    },
                } : {}),
            };
            if (formSecret && formSecret !== '••••••••') {
                updates.secret = formSecret;
            }
            await api.patch(`/platform/webhooks/${editingId}`, updates);
            resetForm();
            fetchWebhooks();
        } catch (err) {
            console.error('Update failed:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!webhookToDelete) return;
        try {
            await api.delete(`/platform/webhooks/${webhookToDelete}`);
            fetchWebhooks();
        } catch (err: any) {
            if (err.response?.status === 409) {
                const data = err.response.data;
                const intentNames = data.intents?.map((i: any) => i.name).join(', ') || '';
                alert(t('webhooksPage.errors.inUse', 'Cannot delete: referenced by intent(s): {{intents}}.\nRemove the webhook from those intents first.', { intents: intentNames }));
            } else {
                console.error('Delete failed:', err);
            }
        } finally {
            setWebhookToDelete(null);
        }
    };

    // V2: Deep Ping with full request/response
    const handleDeepPing = async (id: string) => {
        setDeepPingId(id);
        setDeepPingResult(null);
        setDeepPingLoading(true);
        try {
            const res = await api.post(`/platform/webhooks/${id}/test`);
            setDeepPingResult(res.data);
            if (res.data.success) fireConfetti();
        } catch (err: any) {
            setDeepPingResult({
                success: false, statusCode: 0, error: err.message || t('webhooksPage.errors.networkError', 'Network error'), durationMs: 0,
            });
        } finally {
            setDeepPingLoading(false);
        }
    };

    const handleEdit = (wh: WebhookConfig) => {
        setEditingId(wh._id);
        setFormName(wh.name);
        setFormUrl(wh.url);
        setFormSecret(wh.secret);
        setFormEvents(wh.events);
        setFormEnabled(wh.enabled);
        setFormMaxRetries(wh.retryPolicy?.maxRetries || 3);
        setFormBackoffMs(wh.retryPolicy?.backoffMs || 1000);
        setFormFilters(wh.filterConditions || []);
        setFormPayloadTemplate(wh.payloadTemplate || '');
        setFormTicketProvider(wh.ticketProvider || '');
        setFormTicketIssueType(wh.ticketConfig?.issueType || '');
        setFormTicketTableName(wh.ticketConfig?.tableName || 'incident');
        setShowForm(true);
        setSelectedTemplate(null);
    };

    const toggleEvent = (ev: string) => {
        setFormEvents(prev =>
            prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
        );
    };

    const loadDeliveries = async (id: string) => {
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(id);
        setDeliveriesLoading(true);
        try {
            const res = await api.get(`/platform/webhooks/${id}/deliveries?limit=20`);
            setDeliveries(res.data.data || []);
        } catch (err) {
            console.error('Failed to load deliveries:', err);
        } finally {
            setDeliveriesLoading(false);
        }
    };

    const toggleEnabled = async (wh: WebhookConfig) => {
        try {
            await api.patch(`/platform/webhooks/${wh._id}`, { enabled: !wh.enabled });
            fetchWebhooks();
        } catch (err) {
            console.error('Toggle failed:', err);
        }
    };

    // V2: Secret rotation
    const handleRotateSecret = async (id: string) => {
        setRotatingSecret(id);
        setNewSecret(null);
        try {
            const res = await api.post(`/platform/webhooks/${id}/rotate-secret`);
            setNewSecret(res.data.secret);
            fetchWebhooks();
        } catch (err) {
            console.error('Rotate failed:', err);
        } finally {
            setRotatingSecret(null);
        }
    };

    // V2: Heatmap
    const loadHeatmap = async (id: string) => {
        if (heatmapId === id) { setHeatmapId(null); return; }
        setHeatmapId(id);
        setHeatmapLoading(true);
        try {
            const res = await api.get(`/platform/webhooks/${id}/heatmap?days=7`);
            setHeatmapData(res.data.data || []);
        } catch { setHeatmapData([]); }
        finally { setHeatmapLoading(false); }
    };

    // V2: Filter builder helpers
    const addFilter = () => setFormFilters([...formFilters, { field: 'outcome', operator: 'eq', value: '' }]);
    const removeFilter = (idx: number) => setFormFilters(formFilters.filter((_, i) => i !== idx));
    const updateFilter = (idx: number, key: keyof FilterCondition, val: string) => {
        const updated = [...formFilters];
        updated[idx] = { ...updated[idx], [key]: val };
        setFormFilters(updated);
    };

    // V2: Live payload preview
    const getLivePreview = (): string => {
        if (!formPayloadTemplate.trim()) return '';
        const sampleEvent = formEvents[0] || 'call_hangup';
        const samplePayload = MOCK_PAYLOADS[sampleEvent] || {};
        let result = formPayloadTemplate;
        result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
            if (key === 'event') return sampleEvent;
            const val = key.split('.').reduce((acc: any, k: string) => acc?.[k], samplePayload);
            if (val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        });
        try { return JSON.stringify(JSON.parse(result), null, 2); } catch { return result; }
    };

    // Health indicator helper
    const getHealthIcon = (id: string) => {
        const h = healthStates[id];
        if (!h) return <span className="wh-health-dot healthy" title="Healthy" />;
        if (h.level === 'circuit_open') {
            const secs = Math.ceil(h.cooldownRemainMs / 1000);
            return <span className="wh-health-dot circuit-open" title={`Circuit Open — cooldown ${secs}s`} />;
        }
        if (h.level === 'degraded') return <span className="wh-health-dot degraded" title={`Degraded — ${h.failures} failures`} />;
        return <span className="wh-health-dot healthy" title="Healthy" />;
    };

    return (
        <div className="wh-page">
            <div className="wh-header">
                <h1><Webhook size={24} /> {t('webhooksPage.title')}</h1>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Button className="wh- wh--ghost" onClick={() => setShowVerifyDocs(true)} title="Signature Verification Docs">
                        <BookOpen size={16} />
                    </Button>
                    <Button className="wh- wh--" onClick={() => { resetForm(); setShowForm(true); }}>
                        <Plus size={16} /> {t('webhooksPage.newWebhook')}
                    </Button>
                </div>
            </div>

            {/* Worker Status KPI */}
            {workerStatus && (
                <div className="wh-kpi-grid">
                    <div className="wh-kpi glass-panel">
                        <span className="wh-kpi-label">{t('webhooksPage.kpi.queue')}</span>
                        <span className="wh-kpi-value" style={{ color: 'var(--warning)' }}>{workerStatus.queueLen}</span>
                    </div>
                    <div className="wh-kpi glass-panel">
                        <span className="wh-kpi-label">{t('webhooksPage.kpi.retry')}</span>
                        <span className="wh-kpi-value" style={{ color: 'var(--primary)' }}>{workerStatus.retryLen}</span>
                    </div>
                    <div className="wh-kpi glass-panel">
                        <span className="wh-kpi-label">{t('webhooksPage.kpi.delivered')}</span>
                        <span className="wh-kpi-value" style={{ color: 'var(--success)' }}>{workerStatus.deliveredTotal}</span>
                    </div>
                    <div className="wh-kpi glass-panel">
                        <span className="wh-kpi-label">{t('webhooksPage.kpi.failed')}</span>
                        <span className="wh-kpi-value" style={{ color: 'var(--danger)' }}>{workerStatus.failedTotal}</span>
                    </div>
                </div>
            )}

            {/* CRM Templates — Connector Marketplace Cards */}
            {!editingId && (
                <div className="wh-templates-section glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                    <h3><Sparkles size={16} /> {t('webhooksPage.templates.title')}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        {t('webhooksPage.templates.desc')}
                    </p>
                    <div className="wh-templates-grid">
                        {CRM_TEMPLATES.map(tpl => (
                            <div
                                key={tpl.id}
                                className={`wh-tpl-card ${selectedTemplate === tpl.id ? 'selected' : ''}`}
                                onClick={() => applyTemplate(tpl)}
                            >
                                <div className="wh-tpl-logo">{tpl.icon}</div>
                                <div className="wh-tpl-name">{tpl.name}</div>
                                <div className="wh-tpl-sub">{tpl.description}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Create / Edit Form */}
            {showForm && (
                <div className="wh-form glass-panel">
                    <h3>
                        {editingId ? <><Pencil size={16} /> {t('webhooksPage.form.editWebhook')}</> :
                            selectedTemplate ? <><Zap size={16} /> {CRM_TEMPLATES.find(t2 => t2.id === selectedTemplate)?.name} {t('webhooksPage.templates.configure')}</> :
                                <><Plus size={16} /> {t('webhooksPage.newWebhook')}</>}
                    </h3>

                    {/* Auth note for selected template */}
                    {selectedTemplate && !editingId && (
                        <div style={{
                            padding: '0.6rem 1rem',
                            borderRadius: 'var(--radius-sm)',
                            background: 'hsla(var(--primary-hue), 60%, 90%, 0.5)',
                            border: '1px solid hsla(var(--primary-hue), 60%, 80%, 0.3)',
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            marginBottom: '1rem',
                        }}>
                            💡 {CRM_TEMPLATES.find(t2 => t2.id === selectedTemplate)?.authNote}
                        </div>
                    )}

                    <div className="wh-form-grid">
                        <div className="wh-field">
                            <label>{t('webhooksPage.form.name')}</label>
                            <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Salesforce CRM" />
                        </div>
                        <div className="wh-field">
                            <label>{t('webhooksPage.form.url')}</label>
                            <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://your-crm.com/webhook" />
                        </div>
                        <div className="wh-field">
                            <label>{t('webhooksPage.form.secret')}</label>
                            <Input value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder="whsec_xxxxxxxxxx" type="password" autoComplete="new-password" />
                        </div>
                    </div>

                    <div className="wh-field" style={{ marginTop: '1rem' }}>
                        <label>{t('webhooksPage.form.events')}</label>
                        <div className="wh-events-grid">
                            {ALL_EVENTS.map(ev => (
                                <Button
                                    key={ev}
                                    className={`wh-event-chip ${formEvents.includes(ev) ? 'active' : ''}`}
                                    onClick={() => toggleEvent(ev)}
                                >
                                    {ev}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* #12 UX: Ticket Provider — progressive disclosure when ticket_created is selected */}
                    {formEvents.includes('ticket_created') && (
                        <div className="wh-field" style={{
                            marginTop: '1rem', padding: '1rem 1.25rem',
                            background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--glass-border)',
                        }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Zap size={14} /> {t('webhooksPage.form.ticketProvider', 'Ticket Provider')}
                            </label>
                            <Select
                                value={formTicketProvider}
                                onChange={e => setFormTicketProvider(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', marginTop: '0.5rem' }}
                            >
                                <option value="">{t('webhooksPage.form.selectProvider', '— Select Provider —')}</option>
                                <option value="jira">Jira</option>
                                <option value="servicenow">ServiceNow</option>
                            </Select>
                            {formTicketProvider === 'jira' && (
                                <div style={{ marginTop: '0.75rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('webhooksPage.form.issueTypeOverride', 'Issue Type Override')}</label>
                                    <Select
                                        value={formTicketIssueType}
                                        onChange={e => setFormTicketIssueType(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', marginTop: '0.25rem' }}
                                    >
                                        <option value="">{t('webhooksPage.form.useDefault', 'Use default from integration')}</option>
                                        <option value="Task">Task</option>
                                        <option value="Bug">Bug</option>
                                        <option value="Story">Story</option>
                                    </Select>
                                </div>
                            )}
                            {formTicketProvider === 'servicenow' && (
                                <div style={{ marginTop: '0.75rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('webhooksPage.form.tableOverride', 'Table Override')}</label>
                                    <Select
                                        value={formTicketTableName}
                                        onChange={e => setFormTicketTableName(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', marginTop: '0.25rem' }}
                                    >
                                        <option value="incident">Incident</option>
                                        <option value="sc_request">Service Request</option>
                                        <option value="problem">Problem</option>
                                    </Select>
                                </div>
                            )}
                            {!formTicketProvider && (
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {t('webhooksPage.form.providerHint', 'Select a provider to configure ticket creation. Make sure you\'ve set up the integration in Integrations first.')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* V2: Visual Filter Builder */}
                    <div className="wh-field" style={{ marginTop: '1rem' }}>
                        <label><Filter size={14} /> {t('webhooksPage.form.eventFilters', 'Event Filters')} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('webhooksPage.form.optionalAndLogic', '(optional, AND logic)')}</span></label>
                        {formFilters.map((f, idx) => (
                            <div key={idx} className="wh-filter-row">
                                <Select value={f.field} onChange={e => updateFilter(idx, 'field', e.target.value)}>
                                    {COMMON_FIELDS.map(field => <option key={field} value={field}>{field}</option>)}
                                </Select>
                                <Select value={f.operator} onChange={e => updateFilter(idx, 'operator', e.target.value)}>
                                    {FILTER_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                                </Select>
                                <Input value={f.value} onChange={e => updateFilter(idx, 'value', e.target.value)} placeholder="value" />
                                <Button variant="destructive" className="wh-icon-" onClick={() => removeFilter(idx)}><XCircle size={14} /></Button>
                            </div>
                        ))}
                        <Button className="wh- wh--sm" onClick={addFilter} style={{ marginTop: '0.5rem' }} size="sm">
                            <Plus size={12} /> {t('webhooksPage.form.addCondition', 'Add Condition')}
                        </Button>
                    </div>

                    {/* V2: {t('webhooksPage.form.payloadTemplate', 'Payload Template')} with {t('webhooksPage.form.livePreview', 'Live Preview')} */}
                    <div className="wh-field" style={{ marginTop: '1rem' }}>
                        <label><Code2 size={14} /> {t('webhooksPage.form.payloadTemplate', 'Payload Template')} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('webhooksPage.form.optionalInterpolation', '(optional, {{field}} interpolation)')}</span></label>
                        <div className="wh-template-editor">
                            <Textarea
                                value={formPayloadTemplate}
                                onChange={e => setFormPayloadTemplate(e.target.value)}
                                placeholder={'{\n  "call_id": "{{callId}}",\n  "agent": "{{agentId}}",\n  "event_type": "{{event}}"\n}'}
                                rows={5}
                                className="wh-template-input"
                            />
                            {formPayloadTemplate.trim() && (
                                <div className="wh-template-preview">
                                    <div className="wh-preview-label">{t('webhooksPage.form.livePreview', 'Live Preview')}</div>
                                    <pre className="wh-preview-code">{getLivePreview()}</pre>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="wh-form-row" style={{ marginTop: '1rem' }}>
                        <div className="wh-field" style={{ flex: 1 }}>
                            <label>{t('webhooksPage.form.maxRetries')}</label>
                            <Input type="number" min={0} max={10} value={formMaxRetries} onChange={e => setFormMaxRetries(parseInt(e.target.value))} />
                        </div>
                        <div className="wh-field" style={{ flex: 1 }}>
                            <label>{t('webhooksPage.form.backoff')}</label>
                            <Input type="number" min={100} max={60000} value={formBackoffMs} onChange={e => setFormBackoffMs(parseInt(e.target.value))} />
                        </div>
                        <div className="wh-field" style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                            <Button className="wh-toggle-" onClick={() => setFormEnabled(!formEnabled)}>
                                {formEnabled
                                    ? <><ToggleRight size={20} style={{ color: 'var(--success)' }} /> {t('webhooksPage.form.enabled')}</>
                                    : <><ToggleLeft size={20} style={{ color: 'var(--text-muted)' }} /> {t('webhooksPage.form.disabled')}</>}
                            </Button>
                        </div>
                    </div>

                    {formError && (
                        <div style={{
                            padding: '0.6rem 1rem',
                            borderRadius: 'var(--radius-sm)',
                            background: 'hsla(0, 70%, 60%, 0.08)',
                            border: '1px solid hsla(0, 70%, 60%, 0.2)',
                            color: 'var(--danger)',
                            fontSize: '0.85rem',
                            marginBottom: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                        }}>
                            <XCircle size={14} /> {formError}
                        </div>
                    )}
                    <div className="wh-form-actions">
                        <Button className="wh- wh--" onClick={editingId ? handleUpdate : handleCreate} disabled={saving}>
                            {saving ? <><Loader2 size={14} className="spinning" /> {t('webhooksPage.form.saving')}</> : editingId ? t('webhooksPage.form.update') : t('webhooksPage.form.create')}
                        </Button>
                        <Button className="wh-" onClick={resetForm}>{t('webhooksPage.form.cancel')}</Button>
                    </div>
                </div>
            )}

            {/* Webhook List */}
            {loading ? (
                <div className="wh-loading">{t('webhooksPage.loading')}</div>
            ) : webhooks.length === 0 && !showForm ? (
                <div className="wh-empty glass-panel">
                    <Webhook size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>{t('webhooksPage.noWebhooks')}</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{t('webhooksPage.noWebhooksHint')}</p>
                </div>
            ) : (
                <div className="wh-list">
                    {webhooks.map(wh => (
                        <div key={wh._id} className={`wh-card glass-panel ${!wh.enabled ? 'disabled' : ''}`}>
                            <div className="wh-card-header">
                                <div className="wh-card-info">
                                    <div className="wh-card-name">
                                        {getHealthIcon(wh._id)}
                                        {wh.name}
                                    </div>
                                    <div className="wh-card-url">{wh.url}</div>
                                    <div className="wh-card-events">
                                        {wh.events.map(ev => (
                                            <span key={ev} className="wh-event-tag">{ev}</span>
                                        ))}
                                        {(wh.filterConditions?.length ?? 0) > 0 && (
                                            <span className="wh-event-tag wh-filter-tag" title="Has filter conditions">
                                                <Filter size={10} /> {wh.filterConditions!.length}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="wh-card-actions">
                                    <Button className="wh-icon-" title="Toggle" onClick={() => toggleEnabled(wh)}>
                                        {wh.enabled
                                            ? <ToggleRight size={18} style={{ color: 'var(--success)' }} />
                                            : <ToggleLeft size={18} style={{ color: 'var(--text-muted)' }} />}
                                    </Button>
                                    <Button className="wh-icon-" title="{t('webhooksPage.tools.deepPing', 'Deep Ping Test')}" onClick={() => handleDeepPing(wh._id)}>
                                        <Terminal size={16} />
                                    </Button>
                                    <Button className="wh-icon-" title="Delivery Timeline" onClick={() => loadHeatmap(wh._id)}>
                                        <Activity size={16} />
                                    </Button>
                                    <Button className="wh-icon-" title="Rotate Secret" onClick={() => handleRotateSecret(wh._id)}>
                                        <Shield size={16} />
                                    </Button>
                                    <Button className="wh-icon-" title="Edit" onClick={() => handleEdit(wh)}>
                                        <Pencil size={16} />
                                    </Button>
                                    <Button variant="destructive" className="wh-icon-" title="Delete" onClick={() => setWebhookToDelete(wh._id)}>
                                        <Trash2 size={16} />
                                    </Button>
                                    <Button className="wh-icon-" title="Delivery Logs" onClick={() => loadDeliveries(wh._id)}>
                                        {expandedId === wh._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </Button>
                                </div>
                            </div>

                            {/* V2: Deep Ping Drawer */}
                            {deepPingId === wh._id && (
                                <div className="wh-deep-ping-drawer">
                                    <div className="wh-drawer-header">
                                        <Terminal size={14} /> {t('webhooksPage.tools.deepPing', 'Deep Ping Test')}
                                        <Button className="wh-icon-" onClick={() => setDeepPingId(null)}><XCircle size={14} /></Button>
                                    </div>
                                    {deepPingLoading ? (
                                        <div className="wh-loading"><Loader2 size={16} className="spinning" /> {t('webhooksPage.tools.sendingReq', 'Sending request...')}</div>
                                    ) : deepPingResult ? (
                                        <div className="wh-drawer-body">
                                            <div className={`wh-ping-status ${deepPingResult.success ? 'success' : 'fail'}`}>
                                                {deepPingResult.success
                                                    ? <><CheckCircle2 size={16} /> {t('webhooksPage.tools.success', 'Success')} — {deepPingResult.statusCode} ({deepPingResult.durationMs}ms)</>
                                                    : <><XCircle size={16} /> {t('webhooksPage.tools.failed', 'Failed')} — {deepPingResult.error} ({deepPingResult.durationMs}ms)</>
                                                }
                                            </div>
                                            {deepPingResult.request && (
                                                <div className="wh-ping-section">
                                                    <div className="wh-ping-label">→ Request</div>
                                                    <pre className="wh-ping-code">
                                                        {`POST ${deepPingResult.request.url}\n`}
                                                        {Object.entries(deepPingResult.request.headers).map(([k, v]) => `${k}: ${v}\n`).join('')}
                                                        {`\n${deepPingResult.request.body}`}
                                                    </pre>
                                                </div>
                                            )}
                                            {deepPingResult.response && (
                                                <div className="wh-ping-section">
                                                    <div className="wh-ping-label">← Response ({deepPingResult.response.statusCode} {deepPingResult.response.statusText})</div>
                                                    <pre className="wh-ping-code">
                                                        {Object.entries(deepPingResult.response.headers).map(([k, v]) => `${k}: ${v}\n`).join('')}
                                                        {`\n${deepPingResult.response.body}`}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {/* V2: Rotated Secret Alert */}
                            {newSecret && rotatingSecret === null && deepPingId !== wh._id && (
                                <div className="wh-new-secret-alert">
                                    <Shield size={14} /> {t('webhooksPage.tools.newSecret', 'New Secret:')} <code>{newSecret}</code>
                                    <Button className="wh-icon-" onClick={() => { copyToClipboard(newSecret); }}><Copy size={12} /></Button>
                                    <Button className="wh-icon-" onClick={() => setNewSecret(null)}><XCircle size={12} /></Button>
                                </div>
                            )}

                            {/* V2: Delivery Heatmap Timeline */}
                            {heatmapId === wh._id && (
                                <div className="wh-heatmap-section">
                                    <div className="wh-heatmap-header">
                                        <Activity size={14} /> {t('webhooksPage.tools.deliveryTimeline', 'Delivery Timeline (7 days)')}
                                    </div>
                                    {heatmapLoading ? (
                                        <div className="wh-loading"><Loader2 size={14} className="spinning" /></div>
                                    ) : heatmapData.length === 0 ? (
                                        <div className="wh-empty-small">{t('webhooksPage.tools.noDeliveryData', 'No delivery data yet')}</div>
                                    ) : (
                                        <div className="wh-heatmap-grid">
                                            {heatmapData.slice(-48).map((b, i) => {
                                                const failRate = b.total > 0 ? b.failure / b.total : 0;
                                                const color = b.total === 0 ? 'var(--bg-tertiary)' :
                                                    failRate > 0.5 ? 'var(--danger)' :
                                                        failRate > 0.1 ? 'var(--warning)' : 'var(--success)';
                                                return (
                                                    <div
                                                        key={i}
                                                        className="wh-heatmap-cell"
                                                        style={{ background: color, opacity: b.total === 0 ? 0.2 : 0.7 + failRate * 0.3 }}
                                                        title={`${new Date(b.hour).toLocaleString()}\n✓ ${b.success}  ✗ ${b.failure}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Delivery Logs */}
                            {expandedId === wh._id && (
                                <div className="wh-deliveries">
                                    <h4>{t('webhooksPage.deliveries.title')}</h4>
                                    {deliveriesLoading ? (
                                        <div className="wh-loading">{t('webhooksPage.deliveries.loading')}</div>
                                    ) : deliveries.length === 0 ? (
                                        <div className="wh-empty-small">{t('webhooksPage.deliveries.noDeliveries')}</div>
                                    ) : (
                                        <Table className="wh-table">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{t('webhooksPage.deliveries.time')}</TableHead>
                                                    <TableHead>{t('webhooksPage.deliveries.event')}</TableHead>
                                                    <TableHead>{t('webhooksPage.deliveries.status')}</TableHead>
                                                    <TableHead>{t('webhooksPage.deliveries.attempts')}</TableHead>
                                                    <TableHead>{t('webhooksPage.deliveries.duration')}</TableHead>
                                                    <TableHead>{t('webhooksPage.deliveries.error')}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {deliveries.map((d, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell>{new Date(d.created_at).toLocaleString()}</TableCell>
                                                        <TableCell><span className="wh-event-tag">{d.event}</span></TableCell>
                                                        <TableCell>
                                                            <span className={`wh-status-code ${d.status_code >= 200 && d.status_code < 300 ? 'ok' : 'err'}`}>
                                                                {d.status_code}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>{d.attempts}</TableCell>
                                                        <TableCell>{d.duration_ms}ms</TableCell>
                                                        <TableCell className="wh-error-cell">{d.error || '—'}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Refresh Button */}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <Button className="wh-" onClick={() => { setLoading(true); fetchWebhooks(); }}>
                    <RotateCw size={14} /> {t('webhooksPage.refresh')}
                </Button>
            </div>

            {/* V2: Signature Verification Docs Modal */}
            {showVerifyDocs && (
                <div className="wh-modal-overlay" onClick={() => setShowVerifyDocs(false)}>
                    <div className="wh-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="wh-modal-header">
                            <h3><BookOpen size={16} /> {t('webhooksPage.docs.verifySignatures', 'How to Verify Webhook Signatures')}</h3>
                            <Button className="wh-icon-" onClick={() => setShowVerifyDocs(false)}><XCircle size={16} /></Button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Every webhook delivery includes an <code>X-CXMind-Signature</code> header containing an HMAC-SHA256 signature. 
                            
                        </p>
                        <div className="wh-verify-tabs">
                            {Object.keys(VERIFY_SNIPPETS).map(lang => (
                                <Button key={lang} className={`wh-verify-tab ${verifyLang === lang ? 'active' : ''}`} onClick={() => setVerifyLang(lang)}>
                                    {lang}
                                </Button>
                            ))}
                        </div>
                        <div className="wh-verify-code-wrap">
                            <pre className="wh-verify-code">{VERIFY_SNIPPETS[verifyLang]}</pre>
                            <Button className="wh-copy-" onClick={() => copyToClipboard(VERIFY_SNIPPETS[verifyLang])}>
                                <Copy size={14} /> {t('common.copy', 'Copy')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={!!webhookToDelete}
                onClose={() => setWebhookToDelete(null)}
                onConfirm={handleDelete}
                title={t('webhooksPage.confirm.deleteTitle')}
                description={t('webhooksPage.confirm.deleteDesc')}
                confirmText={t('webhooksPage.confirm.deleteConfirm')}
            />
        </div>
    );
};

export default Webhooks;
