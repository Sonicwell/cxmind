import { Input } from "../../components/ui/input";
import { Checkbox } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Save, Loader2, Plus, Pencil, Trash2, List, Star, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import { useDemoMode } from '../../hooks/useDemoMode';

import { Button } from '../../components/ui/button';

export interface SchemaField {
    key: string;
    label: string;
    description?: string;
    fieldType: 'string' | 'object';
    required?: boolean;
}

export interface SummarySchema {
    _id: string;
    clientId: string;
    name: string;
    industry?: string;
    isDefault?: boolean;
    fields: SchemaField[];
    createdAt?: string;
}

const DEMO_SCHEMAS: SummarySchema[] = [
    {
        _id: 'demo-general', clientId: '000000000000000000000000', name: 'General Support (Default)',
        industry: 'General', isDefault: true,
        fields: [
            { key: 'intent', label: 'Customer Intent', description: 'Primary reason for contacting support', required: true, fieldType: 'string' },
            { key: 'outcome', label: 'Outcome', description: 'Resolved / Unresolved / Escalated / Follow-up needed', required: true, fieldType: 'string' },
            { key: 'next_action', label: 'Next Action', description: 'Next step to take, None if resolved', required: true, fieldType: 'string' },
            { key: 'entities', label: 'Key Entities', description: 'Customer name, product, order number, amounts', required: false, fieldType: 'object' },
            { key: 'sentiment', label: 'Sentiment', description: 'Customer sentiment progression', required: false, fieldType: 'string' },
        ],
    },
    {
        _id: 'demo-insurance', clientId: '000000000000000000000000', name: 'Insurance Claims',
        industry: 'Insurance', isDefault: false,
        fields: [
            { key: 'claim_type', label: 'Claim Type', description: 'Auto / Home / Health / Life / Travel', required: true, fieldType: 'string' },
            { key: 'policy_number', label: 'Policy Number', description: 'Insurance policy number', required: true, fieldType: 'string' },
            { key: 'incident_date', label: 'Incident Date', description: 'Date of incident YYYY-MM-DD', required: true, fieldType: 'string' },
            { key: 'damage_description', label: 'Damage', description: 'Brief description of damage or loss', required: true, fieldType: 'string' },
            { key: 'entities', label: 'Key Parties', description: 'Claimant, vehicle, property, third parties', required: false, fieldType: 'object' },
            { key: 'outcome', label: 'Claim Status', description: 'Submitted / Pending / Approved / Denied', required: true, fieldType: 'string' },
            { key: 'next_action', label: 'Next Action', description: 'Adjuster visit, document upload, payment', required: true, fieldType: 'string' },
            { key: 'sentiment', label: 'Sentiment', description: 'Customer sentiment e.g. Anxious to Reassured', required: false, fieldType: 'string' },
        ],
    },
    {
        _id: 'demo-ecommerce', clientId: '000000000000000000000000', name: 'E-Commerce Order Support',
        industry: 'E-Commerce', isDefault: false,
        fields: [
            { key: 'intent', label: 'Intent', description: 'Order status / Return / Refund / Exchange', required: true, fieldType: 'string' },
            { key: 'order_id', label: 'Order ID', description: 'Order number referenced', required: true, fieldType: 'string' },
            { key: 'product_details', label: 'Products', description: 'Product name, SKU, quantity', required: false, fieldType: 'object' },
            { key: 'resolution', label: 'Resolution', description: 'Refund / Replacement / Credit / Escalated', required: true, fieldType: 'string' },
            { key: 'entities', label: 'Key Entities', description: 'Customer, address, tracking, payment', required: false, fieldType: 'object' },
            { key: 'sentiment', label: 'Sentiment', description: 'Satisfied / Neutral / Dissatisfied', required: false, fieldType: 'string' },
        ],
    },
    {
        _id: 'demo-healthcare', clientId: '000000000000000000000000', name: 'Healthcare Appointment',
        industry: 'Healthcare', isDefault: false,
        fields: [
            { key: 'intent', label: 'Call Purpose', description: 'Booking / Rescheduling / Cancellation / Test results', required: true, fieldType: 'string' },
            { key: 'department', label: 'Department', description: 'Cardiology, Orthopedics, Pediatrics etc.', required: true, fieldType: 'string' },
            { key: 'appointment_details', label: 'Appointment Info', description: 'Date, time, doctor, type', required: false, fieldType: 'object' },
            { key: 'urgency', label: 'Urgency', description: 'Routine / Semi-urgent / Urgent / Emergency', required: true, fieldType: 'string' },
            { key: 'outcome', label: 'Outcome', description: 'Booked / Rescheduled / Cancelled / Waitlisted', required: true, fieldType: 'string' },
            { key: 'sentiment', label: 'Patient Sentiment', description: 'Calm / Anxious / Frustrated / Appreciative', required: false, fieldType: 'string' },
        ],
    },
    {
        _id: 'demo-telecom', clientId: '000000000000000000000000', name: 'Telecom Support',
        industry: 'Telecom', isDefault: false,
        fields: [
            { key: 'issue_type', label: 'Issue Type', description: 'Outage / Slow speed / Billing / Device', required: true, fieldType: 'string' },
            { key: 'service_type', label: 'Service', description: 'Mobile / Broadband / Fiber / VoIP', required: true, fieldType: 'string' },
            { key: 'diagnosis', label: 'Diagnosis', description: 'Root cause identified', required: false, fieldType: 'string' },
            { key: 'entities', label: 'Device/Plan', description: 'Device model, plan, usage, ticket', required: false, fieldType: 'object' },
            { key: 'outcome', label: 'Status', description: 'Resolved / Ticket / Technician dispatched', required: true, fieldType: 'string' },
            { key: 'next_action', label: 'Next Action', description: 'Technician visit, callback, next steps', required: true, fieldType: 'string' },
            { key: 'sentiment', label: 'Sentiment', description: 'Frustrated to Resolved or Calm to Satisfied', required: false, fieldType: 'string' },
        ],
    },
    {
        _id: 'demo-finance', clientId: '000000000000000000000000', name: 'Banking & Finance',
        industry: 'Finance', isDefault: false,
        fields: [
            { key: 'intent', label: 'Request Type', description: 'Account inquiry / Dispute / Loan / Card issue', required: true, fieldType: 'string' },
            { key: 'account_type', label: 'Account Type', description: 'Savings / Checking / Credit Card / Loan', required: true, fieldType: 'string' },
            { key: 'transaction_details', label: 'Transaction', description: 'Transaction ID, amount, merchant, dispute', required: false, fieldType: 'object' },
            { key: 'verification_status', label: 'Verification', description: 'Verified / Partially verified / Failed', required: true, fieldType: 'string' },
            { key: 'outcome', label: 'Outcome', description: 'Resolved / Processing / Pending / Escalated', required: true, fieldType: 'string' },
            { key: 'next_action', label: 'Next Action', description: 'Document submission, branch visit, callback', required: true, fieldType: 'string' },
            { key: 'sentiment', label: 'Sentiment', description: 'Concerned / Neutral / Satisfied / Upset', required: false, fieldType: 'string' },
        ],
    },
];

export const SummarySchemasConfig: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();

    const [schemas, setSchemas] = useState<SummarySchema[]>([]);
    const [schemasLoading, setSchemasLoading] = useState(true);
    const [savingSchema, setSavingSchema] = useState(false);
    const [schemaToDelete, setSchemaToDelete] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editSchema, setEditSchema] = useState<{ name: string; industry: string; isDefault: boolean; fields: SchemaField[] } | null>(null);

    const [showSchemaForm, setShowSchemaForm] = useState(false);
    const [newSchema, setNewSchema] = useState({
        name: '',
        industry: '',
        clientId: '000000000000000000000000', // Need user context ideally
        fields: [{ key: '', label: '', description: '', fieldType: 'string' as 'string' | 'object', required: false }],
    });

    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const fetchSchemas = async () => {
        setSchemasLoading(true);
        try {
            if (demoMode) {
                setSchemas(DEMO_SCHEMAS);
            } else {
                const res = await api.get('/platform/summary-schemas');
                setSchemas(res.data.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch summary schemas', error);
        } finally {
            setSchemasLoading(false);
        }
    };

    useEffect(() => {
        fetchSchemas();
    }, [demoMode]);

    const handleCreateSchema = async () => {
        setSavingSchema(true);
        try {
            const fields = newSchema.fields.filter(f => f.key.trim());
            await api.post('/platform/summary-schemas', {
                clientId: newSchema.clientId,
                name: newSchema.name,
                industry: newSchema.industry || undefined,
                fields,
            });
            setMessage({ type: 'success', text: t('schema.toast.created', 'Summary schema created.') });
            setShowSchemaForm(false);
            setNewSchema({
                name: '', industry: '', clientId: '000000000000000000000000',
                fields: [{ key: '', label: '', description: '', fieldType: 'string', required: false }],
            });
            fetchSchemas();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.error || t('schema.toast.createFailed', 'Failed to create schema') });
        } finally {
            setSavingSchema(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleDeleteSchema = async () => {
        if (!schemaToDelete) return;
        try {
            if (demoMode) {
                setSchemas(prev => prev.filter(s => s._id !== schemaToDelete));
                setMessage({ type: 'success', text: t('schema.toast.deletedDemo', 'Schema deleted (demo).') });
                return;
            }
            await api.delete(`/platform/summary-schemas/${schemaToDelete}`);
            setMessage({ type: 'success', text: t('schema.toast.deleted', 'Schema deleted.') });
            fetchSchemas();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.error || t('schema.toast.deleteFailed', 'Failed to delete schema') });
        } finally {
            setSchemaToDelete(null);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleEditSchema = (s: SummarySchema) => {
        if (editingId === s._id) {
            setEditingId(null);
            setEditSchema(null);
        } else {
            setEditingId(s._id);
            setEditSchema({ name: s.name, industry: s.industry || '', isDefault: s.isDefault || false, fields: [...s.fields] });
        }
    };

    const handleUpdateSchema = async () => {
        if (!editingId || !editSchema) return;
        setSavingSchema(true);
        try {
            const fields = editSchema.fields.filter(f => f.key.trim());
            if (demoMode) {
                setSchemas(prev => prev.map(s => s._id === editingId ? { ...s, ...editSchema, fields } : (editSchema.isDefault ? { ...s, isDefault: false } : s)));
                setMessage({ type: 'success', text: t('schema.toast.updatedDemo', 'Schema updated (demo).') });
            } else {
                await api.patch(`/platform/summary-schemas/${editingId}`, {
                    name: editSchema.name,
                    industry: editSchema.industry || undefined,
                    isDefault: editSchema.isDefault,
                    fields,
                });
                setMessage({ type: 'success', text: t('schema.toast.updated', 'Schema updated.') });
                fetchSchemas();
            }
            setEditingId(null);
            setEditSchema(null);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.error || t('schema.toast.updateFailed', 'Failed to update schema') });
        } finally {
            setSavingSchema(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

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
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    {message.text}
                </div>
            )}

            {/* Modal for Delete Confirmation */}
            {schemaToDelete && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="card" style={{ width: 400, padding: '1.5rem', background: 'var(--bg-card)' }}>
                        <h3 style={{ marginTop: 0 }}>{t('schema.deleteModal.title', 'Delete Schema?')}</h3>
                        <p style={{ color: 'var(--text-muted)' }}>{t('schema.deleteModal.desc', 'Are you sure you want to delete this schema? This action cannot be undone.')}</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <Button onClick={() => setSchemaToDelete(null)}>{t('settingsPage.schema.cancelEdit', 'Cancel')}</Button>
                            <Button onClick={handleDeleteSchema} variant="destructive">{t('schema.btn.delete', 'Delete')}</Button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginTop: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={20} style={{ color: 'var(--primary)' }} /> {t('settingsPage.schema.title', 'Summary Schemas')}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                    {t('settingsPage.schema.description', 'Define JSON schemas used by the LLM to structure post-call conversational summaries.')}
                </p>

                {/* Schema List */}
                {schemasLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} /> {t('settingsPage.schema.loadingSchemas', 'Loading schemas...')}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                        {schemas.length === 0 && (
                            <div style={{
                                padding: '2rem', textAlign: 'center', color: 'var(--text-muted)',
                                border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-md)',
                            }}>
                                {t('settingsPage.schema.noSchemas', 'No summary schemas defined yet.')}
                            </div>
                        )}
                        {schemas.map(s => (
                            <div key={s._id} style={{
                                borderRadius: 'var(--radius-md)',
                                border: `1px solid ${s.isDefault ? 'hsl(260, 60%, 40%)' : 'var(--glass-border)'}`,
                                background: s.isDefault ? 'hsla(260, 80%, 50%, 0.04)' : 'var(--bg-card)',
                                overflow: 'hidden',
                                boxShadow: 'var(--shadow-sm)'
                            }}>
                                {/* Schema Card Header */}
                                <div style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => handleEditSchema(s)}>
                                        <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                                            {s.name}
                                            {s.isDefault && (
                                                <span style={{
                                                    marginLeft: '0.75rem', fontSize: '0.65rem', padding: '2px 8px',
                                                    background: 'hsla(260, 80%, 60%, 0.15)', color: 'hsl(260, 80%, 70%)',
                                                    borderRadius: 12, fontWeight: 600, textTransform: 'uppercase',
                                                }}>{t('settingsPage.schema.default', 'Default')}</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            {s.industry && <span>🏢 {s.industry}</span>}
                                            <span><List size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {s.fields.length} {t('settingsPage.schema.fields', 'Fields')}</span>
                                            {s.clientId !== '000000000000000000000000' && (
                                                <span style={{ opacity: 0.7 }}>{t('schema.client', 'Client:')} {s.clientId.slice(-6)}</span>
                                            )}
                                        </div>
                                        {/* Preview fields */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                                            {s.fields.slice(0, 5).map(f => (
                                                <span key={f.key} style={{
                                                    fontSize: '0.75rem', padding: '2px 8px',
                                                    background: 'rgba(99,102,241,0.08)', color: '#818cf8',
                                                    borderRadius: 4, border: '1px solid rgba(99,102,241,0.15)',
                                                }}>{f.label || f.key}</span>
                                            ))}
                                            {s.fields.length > 5 && (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '2px 8px' }}>+{s.fields.length - 5} {t('settingsPage.schema.fields', 'fields')}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                                        <Button variant="ghost" size="icon" className="-icon" onClick={() => handleEditSchema(s)}
                                            style={{ padding: '0.5rem', color: editingId === s._id ? 'var(--primary)' : 'var(--text-muted)' }}>
                                            <Pencil size={18} />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="-icon" onClick={() => setSchemaToDelete(s._id)}
                                            style={{ padding: '0.5rem', color: 'var(--danger)' }}>
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                </div>

                                {/* Inline Edit Form */}
                                {editingId === s._id && editSchema && (
                                    <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: '1rem', margin: '1.5rem 0' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('settingsPage.schema.nameLbl', 'Schema Name')}</label>
                                                <Input value={editSchema.name} onChange={e => setEditSchema({ ...editSchema, name: e.target.value })}
                                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('settingsPage.schema.industryLbl', 'Industry / Vertical')}</label>
                                                <Input value={editSchema.industry} onChange={e => setEditSchema({ ...editSchema, industry: e.target.value })}
                                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'end', paddingBottom: '0.35rem' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 500 }}>
                                                    <Checkbox checked={editSchema.isDefault} onChange={e => setEditSchema({ ...editSchema, isDefault: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                                                    <Star size={16} color={editSchema.isDefault ? "var(--warning)" : "var(--text-muted)"} fill={editSchema.isDefault ? "var(--warning)" : "none"} /> {t('settingsPage.schema.default', 'Make Default')}
                                                </label>
                                            </div>
                                        </div>

                                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <List size={16} /> {t('settingsPage.schema.editFields', 'Extractable Fields')}
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {editSchema.fields.map((f, idx) => (
                                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 2fr 110px 80px 40px', gap: '0.75rem', alignItems: 'center', padding: '0.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                                                    <Input value={f.key} placeholder={t('schema.placeholder.jsonKey', 'JSON Key (e.g. sentiment)')} onChange={e => {
                                                        const nf = [...editSchema.fields]; nf[idx] = { ...nf[idx], key: e.target.value }; setEditSchema({ ...editSchema, fields: nf });
                                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-base)', color: 'var(--text-primary)' }} />
                                                    <Input value={f.label} placeholder={t('schema.placeholder.label', 'Display Label')} onChange={e => {
                                                        const nf = [...editSchema.fields]; nf[idx] = { ...nf[idx], label: e.target.value }; setEditSchema({ ...editSchema, fields: nf });
                                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-base)', color: 'var(--text-primary)' }} />
                                                    <Input value={f.description || ''} placeholder={t('schema.placeholder.descLLM', 'Prompt Description for LLM')} onChange={e => {
                                                        const nf = [...editSchema.fields]; nf[idx] = { ...nf[idx], description: e.target.value }; setEditSchema({ ...editSchema, fields: nf });
                                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-base)', color: 'var(--text-primary)' }} />
                                                    <Select value={f.fieldType} onChange={e => {
                                                        const nf = [...editSchema.fields]; nf[idx] = { ...nf[idx], fieldType: e.target.value as any }; setEditSchema({ ...editSchema, fields: nf });
                                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
                                                        <option value="string">{t('schema.type.string', 'String')}</option>
                                                        <option value="object">{t('schema.type.objectJSON', 'Object (JSON)')}</option>
                                                        <option value="number">{t('schema.type.number', 'Number')}</option>
                                                        <option value="boolean">{t('schema.type.boolean', 'Boolean')}</option>
                                                    </Select>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                                                        <Checkbox checked={f.required || false} onChange={e => {
                                                            const nf = [...editSchema.fields]; nf[idx] = { ...nf[idx], required: e.target.checked }; setEditSchema({ ...editSchema, fields: nf });
                                                        }} /> {t('settingsPage.schema.req', 'Required')}
                                                    </label>
                                                    <Button variant="ghost" size="icon" className="-icon" style={{ padding: '0.5rem', color: 'var(--danger)' }} onClick={() => {
                                                        const nf = editSchema.fields.filter((_, i) => i !== idx);
                                                        setEditSchema({ ...editSchema, fields: nf.length ? nf : [{ key: '', label: '', description: '', fieldType: 'string', required: false }] });
                                                    }}><Trash2 size={16} /></Button>
                                                </div>
                                            ))}
                                        </div>
                                        <Button onClick={() => setEditSchema({
                                            ...editSchema, fields: [...editSchema.fields, { key: '', label: '', description: '', fieldType: 'string', required: false }]
                                        })} style={{ fontSize: '0.85rem', padding: '0.5rem 0.8rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Plus size={14} /> {t('settingsPage.schema.addField', 'Add Field')}
                                        </Button>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                                            <Button onClick={() => { setEditingId(null); setEditSchema(null); }}
                                                style={{ padding: '0.6rem 1rem' }}>{t('settingsPage.schema.cancelEdit', 'Cancel')}</Button>
                                            <Button disabled={savingSchema || !editSchema.name || editSchema.fields.length === 0}
                                                onClick={handleUpdateSchema}
                                                style={{ padding: '0.6rem 1.5rem', minWidth: '120px' }}>
                                                {savingSchema ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                                {savingSchema ? t('settingsPage.saving', 'Saving...') : t('settingsPage.schema.saveChanges', 'Save Changes')}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Schema Toggle */}
                <Button className="-outline"
                    onClick={() => setShowSchemaForm(!showSchemaForm)}
                    style={{ fontSize: '0.9rem', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderStyle: 'dashed', borderWidth: '2px', width: '100%', justifyContent: 'center' }}
                >
                    {showSchemaForm ? <ChevronDown size={16} /> : <Plus size={16} />}
                    {t('settingsPage.schema.addSchema', 'Create New Schema')}
                </Button>

                {/* Add Schema Form */}
                {showSchemaForm && (
                    <div style={{
                        marginTop: '1rem', padding: '1.5rem', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--glass-border)', background: 'var(--bg-card)',
                        boxShadow: 'var(--shadow-md)'
                    }}>
                        <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 600 }}>{t('schema.createModal.title', 'Create New Summary Schema')}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('settingsPage.schema.schemaName', 'Schema Name')}</label>
                                <Input value={newSchema.name} onChange={e => setNewSchema({ ...newSchema, name: e.target.value })}
                                    placeholder={t('schema.placeholder.techSupport', 'e.g. Technical Support')}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-base)', color: 'var(--text-primary)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('settingsPage.schema.industryLbl', 'Industry / Vertical')}</label>
                                <Input value={newSchema.industry} onChange={e => setNewSchema({ ...newSchema, industry: e.target.value })}
                                    placeholder={t('schema.placeholder.itServices', 'e.g. IT Services')}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-base)', color: 'var(--text-primary)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('schema.clientId', 'Client ID (Optional)')}</label>
                                <Input value={newSchema.clientId} onChange={e => setNewSchema({ ...newSchema, clientId: e.target.value })}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', fontFamily: 'monospace', boxSizing: 'border-box', background: 'var(--bg-base)', color: 'var(--text-primary)' }} />
                            </div>
                        </div>

                        {/* Fields editor */}
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <List size={16} /> {t('settingsPage.schema.editFields', 'Extractable Fields')}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {newSchema.fields.map((f, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 2fr 110px 80px 40px', gap: '0.75rem', alignItems: 'center', padding: '0.5rem', background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                                    <Input value={f.key} placeholder={t('schema.placeholder.key', 'JSON Key')} onChange={e => {
                                        const nf = [...newSchema.fields]; nf[idx] = { ...nf[idx], key: e.target.value }; setNewSchema({ ...newSchema, fields: nf });
                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                    <Input value={f.label} placeholder={t('schema.placeholder.label', 'Display Label')} onChange={e => {
                                        const nf = [...newSchema.fields]; nf[idx] = { ...nf[idx], label: e.target.value }; setNewSchema({ ...newSchema, fields: nf });
                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                    <Input value={f.description || ''} placeholder={t('schema.placeholder.desc', 'Prompt Description')} onChange={e => {
                                        const nf = [...newSchema.fields]; nf[idx] = { ...nf[idx], description: e.target.value }; setNewSchema({ ...newSchema, fields: nf });
                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                    <Select value={f.fieldType} onChange={e => {
                                        const nf = [...newSchema.fields]; nf[idx] = { ...nf[idx], fieldType: e.target.value as any }; setNewSchema({ ...newSchema, fields: nf });
                                    }} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                        <option value="string">{t('schema.type.string', 'String')}</option>
                                        <option value="object">{t('schema.type.object', 'Object')}</option>
                                        <option value="number">{t('schema.type.number', 'Number')}</option>
                                        <option value="boolean">{t('schema.type.boolean', 'Boolean')}</option>
                                    </Select>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                                        <Checkbox checked={f.required || false} onChange={e => {
                                            const nf = [...newSchema.fields]; nf[idx] = { ...nf[idx], required: e.target.checked }; setNewSchema({ ...newSchema, fields: nf });
                                        }} /> {t('settingsPage.schema.req', 'Required')}
                                    </label>
                                    <Button variant="ghost" size="icon" className="-icon" style={{ padding: '0.5rem', color: 'var(--danger)' }} onClick={() => {
                                        const nf = newSchema.fields.filter((_, i) => i !== idx);
                                        setNewSchema({ ...newSchema, fields: nf.length ? nf : [{ key: '', label: '', description: '', fieldType: 'string', required: false }] });
                                    }}><Trash2 size={16} /></Button>
                                </div>
                            ))}
                        </div>
                        <Button onClick={() => setNewSchema({
                            ...newSchema, fields: [...newSchema.fields, { key: '', label: '', description: '', fieldType: 'string', required: false }]
                        })} style={{ fontSize: '0.85rem', padding: '0.5rem 0.8rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={14} /> {t('settingsPage.schema.addField', 'Add Field')}
                        </Button>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
                            <Button onClick={() => setShowSchemaForm(false)}
                                style={{ padding: '0.6rem 1rem' }}>{t('settingsPage.schema.cancelEdit', 'Cancel')}</Button>
                            <Button disabled={savingSchema || !newSchema.name || newSchema.fields.length === 0}
                                onClick={handleCreateSchema}
                                style={{ padding: '0.6rem 1.5rem', minWidth: '150px' }}>
                                {savingSchema ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {savingSchema ? t('schema.btn.creating', 'Creating...') : t('schema.btn.create', 'Create Schema')}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SummarySchemasConfig;
