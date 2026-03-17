
import { Checkbox } from '../ui/Checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select } from '../ui/Select';
import React, { useEffect, useState, useCallback } from 'react';
import { Edit, Plus, RefreshCw, X, Save, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { GlassModal } from '../ui/GlassModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { MotionButton } from '../ui/MotionButton';
import { Input } from '../ui/input';
import api from '../../services/api';
import { getMockActionIntents } from '../../services/mock-data';
import { useDemoMode } from '../../hooks/useDemoMode';
import SchemaBuilder, { fieldsToSchema, schemaToFields } from './SchemaBuilder';
import type { SchemaField } from './SchemaBuilder';
import { useTranslation } from 'react-i18next';

interface ActionIntent {
    _id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    enabled: boolean;
    keywords: string[];
    schema?: any;
    webhookConfigIds?: string[];
    usageCount?: number;
    createdAt?: string;
}

interface WebhookConfigOption {
    _id: string;
    name: string;
    url: string;
    enabled: boolean;
}

const emptyIntent: ActionIntent = {
    _id: '',
    slug: '',
    name: '',
    description: '',
    category: 'support',
    enabled: true,
    keywords: [],
    schema: {},
    usageCount: 0,
};

const inputStyle = {
    padding: '0.8rem', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.03)',
};

const selectStyle = {
    padding: '0.8rem', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.03)',
    width: '100%',
};

const ActionConfigPanel: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [intents, setIntents] = useState<ActionIntent[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingIntent, setEditingIntent] = useState<ActionIntent | null>(null);
    const [formData, setFormData] = useState<ActionIntent>(emptyIntent);
    const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
    const [keywordInput, setKeywordInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [webhookConfigs, setWebhookConfigs] = useState<WebhookConfigOption[]>([]);
    const [showPayloadPreview, setShowPayloadPreview] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

    const loadWebhookConfigs = useCallback(async () => {
        if (demoMode) return;
        try {
            const res = await api.get('/platform/webhooks');
            setWebhookConfigs((res.data.data || []).map((wh: any) => ({
                _id: wh._id, name: wh.name, url: wh.url, enabled: wh.enabled,
            })));
        } catch (err) {
            console.error('Failed to load webhook configs', err);
        }
    }, [demoMode]);

    const loadIntents = async () => {
        setLoading(true);
        try {
            if (demoMode) {
                const res = await getMockActionIntents();
                setIntents(res.data.data);
            } else {
                const res = await api.get('/platform/actions/intents');
                setIntents(res.data);
            }
        } catch (error) {
            console.error('Failed to load intents', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadIntents(); }, [demoMode]);
    useEffect(() => { loadWebhookConfigs(); }, [loadWebhookConfigs]);

    const toggleIntent = async (intent: ActionIntent) => {
        const newEnabled = !intent.enabled;
        // Optimistic UI update
        setIntents(prev => prev.map(i => i._id === intent._id ? { ...i, enabled: newEnabled } : i));
        if (!demoMode) {
            try {
                await api.put(`/platform/actions/intents/${intent._id}`, { enabled: newEnabled });
            } catch (error) {
                console.error('Failed to toggle intent', error);
                // Revert on failure
                setIntents(prev => prev.map(i => i._id === intent._id ? { ...i, enabled: !newEnabled } : i));
            }
        }
    };

    const openCreate = () => {
        setEditingIntent(null);
        setFormData({ ...emptyIntent });
        setSchemaFields([]);
        setKeywordInput('');
        setIsDirty(false);
        setShowDiscardConfirm(false);
        setModalOpen(true);
    };

    const openEdit = (intent: ActionIntent) => {
        setEditingIntent(intent);
        setFormData({ ...intent });
        setSchemaFields(schemaToFields(intent.schema || {}));
        setKeywordInput('');
        setIsDirty(false);
        setShowDiscardConfirm(false);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingIntent(null);
        setIsDirty(false);
        setShowDiscardConfirm(false);
    };

    // ESC/点击外部/X/Cancel — dirty 时弹确认
    const handleCloseAttempt = () => {
        if (isDirty) {
            setShowDiscardConfirm(true);
        } else {
            closeModal();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        // Build schema from visual fields
        const schema = schemaFields.length > 0 ? fieldsToSchema(schemaFields) : {};
        const saveData = { ...formData, schema };

        if (demoMode) {
            // Demo mode: local state only
            if (editingIntent) {
                setIntents(prev => prev.map(i =>
                    i._id === editingIntent._id ? { ...saveData } : i
                ));
            } else {
                const slug = saveData.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                setIntents(prev => [...prev, { ...saveData, _id: `ai_new_${Date.now()}`, slug, usageCount: 0 }]);
            }
            closeModal();
        } else {
            // Live mode: persist to backend
            try {
                if (editingIntent) {
                    await api.put(`/platform/actions/intents/${editingIntent._id}`, saveData);
                } else {
                    await api.post('/platform/actions/intents', saveData);
                }
                closeModal();
                loadIntents();
            } catch (error) {
                console.error('Failed to save intent', error);
            }
        }
    };

    const addKeyword = () => {
        const kw = keywordInput.trim().toLowerCase();
        if (kw && !formData.keywords.includes(kw)) {
            setFormData(prev => ({ ...prev, keywords: [...prev.keywords, kw] }));
            setKeywordInput('');
        }
    };

    const removeKeyword = (kw: string) => {
        setFormData(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }));
    };

    const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addKeyword();
        }
    };

    const filteredIntents = intents.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div className="input-with-icon" style={{ width: '260px' }}>
                    <input
                        type="text"
                        placeholder={t('actions.searchIntents')}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <MotionButton variant="secondary" onClick={loadIntents} style={{ gap: '0.4rem' }}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        {t('actions.refresh')}
                    </MotionButton>
                    <MotionButton onClick={openCreate} style={{ gap: '0.4rem' }}>
                        <Plus size={16} />
                        {t('actions.createIntent')}
                    </MotionButton>
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                </div>
            ) : (
                <>
                    {/* Table */}
                    <Table className="data-table">
                        <TableHeader>
                            <TableRow>
                                <TableHead style={{ width: '60px' }}>{t('actions.statusCol')}</TableHead>
                                <TableHead>{t('actions.intentName')}</TableHead>
                                <TableHead>{t('actions.category')}</TableHead>
                                <TableHead>{t('actions.keywords')}</TableHead>
                                <TableHead style={{ textAlign: 'center' }}>{t('actions.usage')}</TableHead>
                                <TableHead style={{ textAlign: 'right' }}>{t('common.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredIntents.map((intent) => (
                                <TableRow key={intent._id}>
                                    <TableCell>
                                        <label className="toggle-switch" title={intent.enabled ? 'Enabled' : 'Disabled'}>
                                            <Checkbox
                                                checked={intent.enabled}
                                                onChange={() => toggleIntent(intent)}
                                            />
                                            <span className="toggle-slider" />
                                        </label>
                                    </TableCell>
                                    <TableCell>
                                        <div style={{ fontWeight: 600 }}>{intent.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{intent.description}</div>
                                    </TableCell>
                                    <TableCell>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: 'var(--radius-full)',
                                            fontSize: '0.75rem',
                                            fontWeight: 500,
                                            textTransform: 'capitalize',
                                            border: '1px solid var(--glass-border)',
                                            color: 'var(--text-secondary)',
                                        }}>
                                            {intent.category}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                            {intent.keywords.slice(0, 3).map(k => (
                                                <span key={k} style={{
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    fontSize: '0.75rem',
                                                    background: 'hsla(var(--primary-hue), 60%, 60%, 0.08)',
                                                    color: 'var(--text-secondary)',
                                                    border: '1px solid var(--glass-border)',
                                                }}>
                                                    {k}
                                                </span>
                                            ))}
                                            {intent.keywords.length > 3 && (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    +{intent.keywords.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        {intent.usageCount ?? '—'}
                                    </TableCell>
                                    <TableCell style={{ textAlign: 'right' }}>
                                        <MotionButton variant="ghost" onClick={() => openEdit(intent)} title="Edit Intent">
                                            <Edit size={16} />
                                        </MotionButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredIntents.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        {searchTerm ? t('actions.noIntentsMatch') : t('actions.noIntentsConfigured')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {filteredIntents.length} / {intents.length} {t('actions.intentsShown')}
                    </div>
                </>
            )}

            {/* Create / Edit Intent Modal */}
            <GlassModal
                open={modalOpen}
                onOpenChange={(open) => { if (!open) closeModal(); }}
                title={editingIntent ? t('actions.editIntent') : t('actions.createNewIntent')}
                description={editingIntent
                    ? t('actions.editIntentDesc')
                    : t('actions.createIntentDesc')}
                onCloseAttempt={handleCloseAttempt}
                isDirty={isDirty}
            >
                <form onSubmit={handleSave} className="flex flex-col gap-md" autoComplete="off">
                    <div className="form-group">
                        <label>{t('actions.intentName')}</label>
                        <Input
                            placeholder="e.g. Create Support Ticket"
                            value={formData.name}
                            onChange={(e: any) => { setFormData(prev => ({ ...prev, name: e.target.value })); setIsDirty(true); }}
                            required
                            style={inputStyle}
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('actions.description')}</label>
                        <Input
                            placeholder="Brief description of what this action does"
                            value={formData.description}
                            onChange={(e: any) => { setFormData(prev => ({ ...prev, description: e.target.value })); setIsDirty(true); }}
                            style={inputStyle}
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('actions.category')}</label>
                        <Select
                            value={formData.category}
                            onChange={e => { setFormData(prev => ({ ...prev, category: e.target.value })); setIsDirty(true); }}
                            style={selectStyle}
                        >
                            <option value="support">Support</option>
                            <option value="sales">Sales</option>
                            <option value="ecommerce">Ecommerce</option>
                            <option value="scheduling">Scheduling</option>
                            <option value="communication">Communication</option>
                            <option value="integration">Integration</option>
                            <option value="routing">Routing</option>
                            <option value="other">Other</option>
                        </Select>
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Webhook {t('actions.webhookDest')}
                            {!demoMode && webhookConfigs.length > 0 && (
                                <a href="/webhooks" target="_blank" rel="noreferrer" style={{
                                    fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none',
                                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                }}>
                                    {t('actions.manage')} <ExternalLink size={10} />
                                </a>
                            )}
                        </label>
                        {webhookConfigs.length > 0 ? (
                            <div style={{
                                border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.5rem',
                                maxHeight: '160px',
                                overflowY: 'auto',
                                background: 'rgba(0,0,0,0.015)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                            }}>
                                {webhookConfigs.map(wh => {
                                    const selected = (formData.webhookConfigIds || []).includes(wh._id);
                                    return (
                                        <label key={wh._id} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.4rem 0.5rem',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: wh.enabled ? 'pointer' : 'not-allowed',
                                            opacity: wh.enabled ? 1 : 0.5,
                                            background: selected ? 'hsla(var(--primary-hue), 60%, 60%, 0.08)' : 'transparent',
                                            transition: 'background 0.15s',
                                        }}>
                                            <Checkbox
                                                checked={selected}
                                                disabled={!wh.enabled}
                                                onChange={() => {
                                                    if (!wh.enabled) return;
                                                    setFormData(prev => {
                                                        const current = prev.webhookConfigIds || [];
                                                        const next = selected
                                                            ? current.filter(id => id !== wh._id)
                                                            : [...current, wh._id];
                                                        return { ...prev, webhookConfigIds: next };
                                                    });
                                                }}
                                                style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                                            />
                                            <span style={{ flex: 1, fontSize: '0.85rem' }}>
                                                {wh.name}
                                                {!wh.enabled && <span style={{ marginLeft: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>(disabled)</span>}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                {wh.url.replace(/^https?:\/\//, '').slice(0, 30)}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{
                                padding: '1rem',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px dashed var(--glass-border)',
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                fontSize: '0.85rem',
                            }}>
                                No webhooks configured. <a href="/webhooks" style={{ color: 'var(--primary)' }}>{t('actions.goToWebhooks')}</a>
                            </div>
                        )}
                        {(formData.webhookConfigIds?.length || 0) > 0 && (
                            <small style={{ marginTop: '0.25rem', color: 'var(--text-muted)', display: 'block' }}>
                                {formData.webhookConfigIds!.length} webhook{formData.webhookConfigIds!.length > 1 ? 's' : ''} selected — action will be sent to all on confirm
                            </small>
                        )}
                    </div>

                    <div className="form-group">
                        <label>{t('actions.keywords')}</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Input
                                placeholder="Type and press Enter"
                                value={keywordInput}
                                onChange={(e: any) => { setKeywordInput(e.target.value); setIsDirty(true); }}
                                onKeyDown={handleKeywordKeyDown}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <MotionButton type="button" variant="secondary" onClick={addKeyword} style={{ padding: '0.5rem 0.8rem' }}>
                                <Plus size={16} />
                            </MotionButton>
                        </div>
                        {formData.keywords.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                                {formData.keywords.map(kw => (
                                    <span
                                        key={kw}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            padding: '0.25rem 0.6rem',
                                            borderRadius: 'var(--radius-full)',
                                            fontSize: '0.8rem',
                                            background: 'hsla(var(--primary-hue), 60%, 60%, 0.1)',
                                            color: 'var(--primary)',
                                            border: '1px solid hsla(var(--primary-hue), 60%, 60%, 0.2)',
                                        }}
                                    >
                                        {kw}
                                        <X
                                            size={12}
                                            style={{ cursor: 'pointer', opacity: 0.7 }}
                                            onClick={() => removeKeyword(kw)}
                                        />
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label style={{ marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Extraction Schema
                            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                                {t('actions.schemaHint')}
                            </span>
                        </label>
                        <div style={{
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--glass-border)',
                            background: 'rgba(0,0,0,0.015)',
                        }}>
                            <SchemaBuilder fields={schemaFields} onChange={setSchemaFields} />
                        </div>
                    </div>

                    {/* Payload Preview */}
                    {schemaFields.length > 0 && (
                        <div className="form-group">
                            <label
                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => setShowPayloadPreview(!showPayloadPreview)}
                            >
                                {showPayloadPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                                {t('actions.previewPayload')}
                            </label>
                            {showPayloadPreview && (
                                <pre style={{
                                    padding: '0.75rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--glass-border)',
                                    background: 'rgba(0,0,0,0.03)',
                                    fontSize: '0.75rem',
                                    overflowX: 'auto',
                                    maxHeight: '200px',
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {JSON.stringify({
                                        version: '1.0',
                                        event: 'action_execution',
                                        timestamp: new Date().toISOString(),
                                        deliveryId: 'uuid-xxxx',
                                        data: {
                                            actionId: 'act_xxxx',
                                            intent: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '_'),
                                            intentName: formData.name || 'Intent Name',
                                            payload: Object.fromEntries(
                                                schemaFields.map(f => [f.name, f.type === 'string' ? '(AI extracted)' : f.type === 'number' ? 0 : f.type === 'boolean' ? false : '(AI extracted)'])
                                            ),
                                            agentId: 'agent_xxx',
                                            callId: 'call_xxx',
                                            timestamp: new Date().toISOString(),
                                        },
                                    }, null, 2)}
                                </pre>
                            )}
                        </div>
                    )}

                    <div className="form-group">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <label className="toggle-switch">
                                <Checkbox
                                    checked={formData.enabled}
                                    onChange={e => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                                />
                                <span className="toggle-slider" />
                            </label>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                {formData.enabled ? t('actions.activeOnCreation') : t('actions.disabledOnCreation')}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                        <MotionButton type="button" variant="secondary" className="w-full" onClick={handleCloseAttempt}>
                            {t('common.cancel')}
                        </MotionButton>
                        <MotionButton type="submit" className="w-full">
                            <Save size={16} />
                            {editingIntent ? t('actions.saveChanges') : t('actions.createIntent')}
                        </MotionButton>
                    </div>
                </form>
            </GlassModal>
            <ConfirmModal
                open={showDiscardConfirm}
                onClose={() => setShowDiscardConfirm(false)}
                onConfirm={() => { setShowDiscardConfirm(false); closeModal(); }}
                title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                confirmText={t('common.discard', 'Discard')}
                cancelText={t('common.cancel', 'Cancel')}
            />
        </div>
    );
};

export default ActionConfigPanel;
