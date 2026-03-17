import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal } from '../ui/GlassModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { MotionButton } from '../ui/MotionButton';
import { Input } from '../ui/input';
import { Select } from '../ui/Select';
import { AlertTriangle } from 'lucide-react';
import api from '../../services/api';

export interface ContactFormData {
    displayName: string;
    company: string;
    phone: string;
    email: string;
    tags: string;
    stage?: string;
}

interface DuplicateHit {
    _id: string;
    displayName?: string;
    stage?: string;
    company?: string;
}

interface ContactFormModalProps {
    isOpen: boolean;
    initialData?: ContactFormData;
    contactStages: { id: string; label: string; i18nKey?: string }[];
    onClose: () => void;
    onSubmit: (data: ContactFormData) => Promise<void>;
    title: string;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({
    isOpen,
    initialData,
    contactStages,
    onClose,
    onSubmit,
    title
}) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState<ContactFormData>({
        displayName: '',
        company: '',
        phone: '',
        email: '',
        tags: '',
        stage: undefined,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

    // 查重状态
    const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);
    const [dupChecked, setDupChecked] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData(initialData);
            } else {
                setFormData({ displayName: '', company: '', phone: '', email: '', tags: '' });
            }
            setDuplicates([]);
            setDupChecked(false);
            setIsDirty(false);
            setShowDiscardConfirm(false);
        }
    }, [isOpen, initialData]);

    // 电话号码 blur 后自动查重（仅新建时）
    const checkDuplicate = useCallback(async (phone: string) => {
        if (!phone.trim() || initialData) return; // 编辑模式不查重
        try {
            const res = await api.get(`/contacts/check-duplicate?phone=${encodeURIComponent(phone.trim())}`);
            setDuplicates(res.data?.duplicates || []);
            setDupChecked(true);
        } catch {
            setDuplicates([]);
            setDupChecked(true);
        }
    }, [initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSubmit(formData);
            setIsDirty(false);
            onClose();
        } catch (error) {
            console.error('Failed to submit contact:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // 表单字段变更时同步 dirty 标记
    const updateField = (field: keyof ContactFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    // ESC/点击外部/X 按钮 — dirty 时弹确认，clean 时直接关闭
    const handleCloseAttempt = () => {
        if (isDirty) {
            setShowDiscardConfirm(true);
        } else {
            onClose();
        }
    };

    const inputStyle = {
        padding: '0.8rem', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--glass-border)', background: 'var(--bg-card)',
        color: 'var(--text-primary)', width: '100%'
    };

    return (
        <>
            <GlassModal
                open={isOpen}
                onOpenChange={(open) => { if (!open) onClose(); }}
                title={title}
                onCloseAttempt={handleCloseAttempt}
                isDirty={isDirty}
            >
                <form onSubmit={handleSubmit} className="flex flex-col gap-md">
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('contacts.displayName')}</label>
                        <Input
                            type="text"
                            style={inputStyle}
                            value={formData.displayName}
                            onChange={(e: any) => updateField('displayName', e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('contacts.company')}</label>
                        <Input
                            type="text"
                            style={inputStyle}
                            value={formData.company}
                            onChange={(e: any) => updateField('company', e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('contacts.phone')}</label>
                        <Input
                            type="text"
                            style={inputStyle}
                            value={formData.phone}
                            onChange={(e: any) => updateField('phone', e.target.value)}
                            onBlur={() => checkDuplicate(formData.phone)}
                        />
                    </div>

                    {/* 查重警告 */}
                    {dupChecked && duplicates.length > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '10px 14px', borderRadius: 8,
                            background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)',
                            fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 8,
                        }}>
                            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('contacts.dupWarningTitle')}</div>
                                {duplicates.map(d => (
                                    <div key={d._id} style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                                        • {d.displayName || t('contacts.never')} {d.stage && <span style={{
                                            fontSize: '0.7rem', padding: '1px 6px', borderRadius: 999,
                                            background: 'rgba(148,163,184,0.15)', color: '#94a3b8', marginLeft: 4,
                                        }}>{d.stage}</span>}
                                        {d.company && ` — ${d.company}`}
                                    </div>
                                ))}
                                <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    {t('contacts.dupWarningHint')}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stage 选择器 */}
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('contacts.col.stage')}</label>
                        <Select
                            style={{ ...inputStyle, cursor: 'pointer' }}
                            value={formData.stage || 'Visitor'}
                            onChange={(e) => updateField('stage', e.target.value)}
                        >
                            {contactStages.map(s => (
                                <option key={s.id} value={s.id}>{s.i18nKey ? t(s.i18nKey as any) : s.label}</option>
                            ))}
                        </Select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('contacts.email')}</label>
                        <Input
                            type="text"
                            style={inputStyle}
                            value={formData.email}
                            onChange={(e: any) => updateField('email', e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('contacts.tags')}</label>
                        <Input
                            type="text"
                            style={inputStyle}
                            value={formData.tags}
                            onChange={(e: any) => updateField('tags', e.target.value)}
                            placeholder={t('contacts.tagsPlaceholder')}
                        />
                    </div>
                    <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                        <MotionButton type="button" variant="secondary" className="w-full" onClick={handleCloseAttempt} disabled={isSubmitting}>
                            {t('common.cancel')}
                        </MotionButton>
                        <MotionButton type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? t('common.saving') : t('common.save')}
                        </MotionButton>
                    </div>
                </form>
            </GlassModal>
            <ConfirmModal
                open={showDiscardConfirm}
                onClose={() => setShowDiscardConfirm(false)}
                onConfirm={() => { setShowDiscardConfirm(false); setIsDirty(false); onClose(); }}
                title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                confirmText={t('common.discard', 'Discard')}
                cancelText={t('common.cancel', 'Cancel')}
            />
        </>
    );
};

export default ContactFormModal;

