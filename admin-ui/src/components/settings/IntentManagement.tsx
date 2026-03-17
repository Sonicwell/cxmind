/**
 * IntentManagement — Routing Intent CRUD + Test Panel
 *
 * Settings → Routing tab
 */

import { Checkbox } from '../ui/Checkbox';
import { Select } from '../ui/Select';
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
    Target, Plus, Edit2, Trash2, Save, X, TestTube, Loader2,
    AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Switch } from '../ui/switch';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface RoutingIntent {
    _id: string;
    slug: string;
    name: string;
    description?: string;
    exampleTexts: string[];
    priority: 'urgent' | 'high' | 'normal' | 'low';
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

const PRIORITY_OPTIONS = [
    { value: 'urgent', labelKey: 'intentManagement.priorityUrgent', color: 'hsl(0, 70%, 50%)' },
    { value: 'high', labelKey: 'intentManagement.priorityHigh', color: 'hsl(30, 80%, 50%)' },
    { value: 'normal', labelKey: 'intentManagement.priorityNormal', color: 'hsl(210, 60%, 50%)' },
    { value: 'low', labelKey: 'intentManagement.priorityLow', color: 'hsl(150, 50%, 45%)' },
];

const IntentManagement: React.FC = () => {
    const { t } = useTranslation();
    const [intents, setIntents] = useState<RoutingIntent[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<RoutingIntent | null>(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteIntentId, setDeleteIntentId] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState({
        slug: '', name: '', description: '', exampleTexts: ['', '', ''], priority: 'normal' as string, enabled: true,
    });

    // Test panel
    const [testText, setTestText] = useState('');
    const [testResult, setTestResult] = useState<any>(null);
    const [testing, setTesting] = useState(false);

    const fetchIntents = useCallback(async () => {
        try {
            const res = await api.get('/intents');
            setIntents(res.data);
        } catch (err) {
            console.error('Failed to fetch intents', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchIntents(); }, [fetchIntents]);

    const handleCreate = () => {
        setCreating(true);
        setEditing(null);
        setForm({ slug: '', name: '', description: '', exampleTexts: ['', '', ''], priority: 'normal', enabled: true });
    };

    const handleEdit = (intent: RoutingIntent) => {
        setEditing(intent);
        setCreating(false);
        setForm({
            slug: intent.slug,
            name: intent.name,
            description: intent.description || '',
            exampleTexts: [...intent.exampleTexts],
            priority: intent.priority,
            enabled: intent.enabled,
        });
    };

    const handleCancel = () => {
        setEditing(null);
        setCreating(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const texts = form.exampleTexts.filter(txt => txt.trim());
            const payload = { ...form, exampleTexts: texts };

            if (editing) {
                await api.put(`/intents/${editing._id}`, payload);
            } else {
                await api.post('/intents', payload);
            }
            handleCancel();
            fetchIntents();
        } catch (err: any) {
            alert(err.response?.data?.error || t('intentManagement.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/intents/${id}`);
            fetchIntents();
        } catch (err: any) {
            alert(err.response?.data?.error || t('intentManagement.deleteFailed'));
        }
        setDeleteIntentId(null);
    };

    const handleToggle = async (intent: RoutingIntent) => {
        try {
            await api.put(`/intents/${intent._id}`, { enabled: !intent.enabled });
            fetchIntents();
        } catch (err) {
            console.error('Toggle failed', err);
        }
    };

    const handleTest = async () => {
        if (!testText.trim()) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await api.post('/intents/test', { text: testText });
            setTestResult(res.data.match);
        } catch (err) {
            setTestResult({ error: true });
        } finally {
            setTesting(false);
        }
    };

    const addExampleText = () => {
        setForm(f => ({ ...f, exampleTexts: [...f.exampleTexts, ''] }));
    };

    const removeExampleText = (idx: number) => {
        setForm(f => ({ ...f, exampleTexts: f.exampleTexts.filter((_, i) => i !== idx) }));
    };

    const updateExampleText = (idx: number, val: string) => {
        setForm(f => {
            const texts = [...f.exampleTexts];
            texts[idx] = val;
            return { ...f, exampleTexts: texts };
        });
    };

    const priorityBadge = (p: string) => {
        const opt = PRIORITY_OPTIONS.find(o => o.value === p);
        if (!opt) return null;
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                background: `${opt.color}18`, color: opt.color,
                border: `1px solid ${opt.color}30`,
            }}>
                {t(opt.labelKey)}
            </span>
        );
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 className="animate-spin" size={20} /></div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Target size={20} color="var(--primary)" />
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('intentManagement.title')}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({intents.length})</span>
                </div>
                <Button className="-sm -" onClick={handleCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} size="sm">
                    <Plus size={14} /> {t('intentManagement.addIntent')}
                </Button>
            </div>

            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {t('intentManagement.description')}
            </p>

            {/* Create / Edit Form */}
            {(creating || editing) && (
                <div style={{
                    padding: '1.5rem', borderRadius: 'var(--radius-md)',
                    border: '2px solid var(--primary)', background: 'var(--bg-card)',
                }}>
                    <h4 style={{ margin: '0 0 1rem' }}>{editing ? t('intentManagement.editIntent') : t('intentManagement.newIntent')}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>{t('intentManagement.slug')}</label>
                            <Input
                                value={form.slug}
                                onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                                disabled={!!editing}
                                placeholder={t('intentManagement.slugPlaceholder')}
                                style={editing ? { background: 'var(--bg-page)' } : undefined}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>{t('intentManagement.name')}</label>
                            <Input
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                placeholder={t('intentManagement.namePlaceholder')}
                            />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>{t('intentManagement.descriptionLabel')}</label>
                            <Input
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder={t('intentManagement.descriptionPlaceholder')}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>{t('intentManagement.priority')}</label>
                            <Select
                                value={form.priority}
                                onChange={e => setForm({ ...form, priority: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                            >
                                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                            </Select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Checkbox checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
                            <span style={{ fontSize: '0.9rem' }}>{t('intentManagement.enabled')}</span>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                {t('intentManagement.exampleTexts')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({t('intentManagement.exampleTextsHint')})</span>
                            </label>
                            {form.exampleTexts.map((txt, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                    <Input
                                        value={txt}
                                        onChange={e => updateExampleText(i, e.target.value)}
                                        placeholder={`${t('intentManagement.examplePrefix')} ${i + 1}`}
                                        style={{ flex: 1, fontSize: '0.85rem' }}
                                    />
                                    {form.exampleTexts.length > 3 && (
                                        <Button onClick={() => removeExampleText(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0 4px' }}>
                                            <X size={14} />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            <Button onClick={addExampleText} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0' }}>
                                <Plus size={12} /> {t('intentManagement.addExample')}
                            </Button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <Button className="-sm" onClick={handleCancel} size="sm">{t('intentManagement.cancel')}</Button>
                        <Button size="sm" className="-sm -" onClick={handleSave} disabled={saving || !form.slug || !form.name || form.exampleTexts.filter(txt => txt.trim()).length < 3}>
                            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                            {saving ? t('intentManagement.saving') : t('intentManagement.save')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Intent List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(Array.isArray(intents) ? intents : []).map(intent => (
                    <div
                        key={intent._id}
                        style={{
                            padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--glass-border)', background: 'var(--bg-card)',
                            opacity: intent.enabled ? 1 : 0.5,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Button
                                onClick={() => setExpandedId(expandedId === intent._id ? null : intent._id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex' }}
                            >
                                {expandedId === intent._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </Button>
                            <code style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>{intent.slug}</code>
                            <span style={{ fontWeight: 500 }}>{intent.name}</span>
                            {priorityBadge(intent.priority)}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{intent.exampleTexts.length} {t('intentManagement.examples')}</span>
                            <div style={{ flex: 1 }} />
                            <div style={{ transform: 'scale(0.7)' }}>
                                <Switch checked={intent.enabled} onCheckedChange={() => handleToggle(intent)} />
                            </div>
                            <Button onClick={() => handleEdit(intent)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <Edit2 size={14} />
                            </Button>
                            <Button onClick={() => setDeleteIntentId(intent._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                                <Trash2 size={14} />
                            </Button>
                        </div>

                        {expandedId === intent._id && (
                            <div style={{ marginTop: '0.75rem', paddingLeft: '2rem' }}>
                                {intent.description && <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{intent.description}</p>}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                    {intent.exampleTexts.map((txt, i) => (
                                        <span key={i} style={{
                                            padding: '0.2rem 0.6rem', borderRadius: '12px',
                                            background: 'hsla(210, 50%, 50%, 0.08)', fontSize: '0.8rem',
                                            color: 'var(--text-secondary)',
                                        }}>
                                            "{txt}"
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {intents.length === 0 && !creating && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <AlertCircle size={28} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                        <p style={{ margin: 0 }}>{t('intentManagement.empty')}</p>
                    </div>
                )}
            </div>

            {/* Test Panel */}
            <div style={{
                padding: '1.25rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <TestTube size={16} color="var(--primary)" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{t('intentManagement.testMatch')}</h4>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Input
                        value={testText}
                        onChange={e => setTestText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleTest(); }}
                        placeholder={t('intentManagement.testPlaceholder')}
                        style={{ flex: 1 }}
                    />
                    <Button className="-sm -" onClick={handleTest} disabled={testing || !testText.trim()} size="sm">
                        {testing ? <Loader2 className="animate-spin" size={14} /> : t('intentManagement.test')}
                    </Button>
                </div>
                {testResult && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '6px', background: testResult.error ? 'hsla(0,60%,50%,0.08)' : 'hsla(150,60%,45%,0.08)' }}>
                        {testResult.error ? (
                            <span style={{ color: 'var(--danger)' }}>{t('intentManagement.testError')}</span>
                        ) : testResult ? (
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <CheckCircle2 size={16} color="hsl(150, 60%, 45%)" />
                                <span style={{ fontWeight: 600 }}>{testResult.intent}</span>
                                {priorityBadge(testResult.priority)}
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('intentManagement.score')}: {(testResult.score * 100).toFixed(1)}%</span>
                            </div>
                        ) : (
                            <span style={{ color: 'var(--text-muted)' }}>{t('intentManagement.noMatch')}</span>
                        )}
                    </div>
                )}
            </div>

            <ConfirmModal
                open={!!deleteIntentId}
                onClose={() => setDeleteIntentId(null)}
                onConfirm={() => { if (deleteIntentId) handleDelete(deleteIntentId); }}
                title={t('intentManagement.deleteTitle')}
                description={t('intentManagement.deleteDesc')}
            />
        </div>
    );
};

export default IntentManagement;
