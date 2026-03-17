import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal } from '../ui/GlassModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Input } from '../ui/input';
import type { AlertRule } from '../../services/api/alert-rules';

import { Button } from '../ui/button';

interface RuleModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (data: Partial<AlertRule>) => Promise<void>;
    initialData?: AlertRule | null;
}

export const RuleModal: React.FC<RuleModalProps> = ({ open, onClose, onSave, initialData }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [eventTrigger, setEventTrigger] = useState('SYSTEM_DEGRADATION');
    const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
    const [durationWindowSec, setDurationWindowSec] = useState(300);
    const [metric, setMetric] = useState<'MOS' | 'SIP_ERROR_RATE' | 'CONCURRENT_CALLS' | 'CALL_FAILURE_RATE' | 'ASR_LATENCY' | 'QUEUE_WAIT_TIME'>('MOS');
    const [operator, setOperator] = useState<'GT' | 'LT' | 'EQ' | 'GTE' | 'LTE'>('LT');
    const [threshold, setThreshold] = useState(2.5);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [showDiscard, setShowDiscard] = useState(false);

    useEffect(() => {
        if (open) {
            if (initialData) {
                setName(initialData.name);
                setDescription(initialData.description || '');
                setEventTrigger(initialData.eventTrigger);
                setSeverity(initialData.severity);
                setDurationWindowSec(initialData.durationWindowSec);
                if (initialData.metricExpressions && initialData.metricExpressions.length > 0) {
                    const m = initialData.metricExpressions[0];
                    setMetric(m.metric as any);
                    setOperator(m.operator);
                    setThreshold(m.threshold);
                } else {
                    setMetric('MOS');
                    setOperator('LT');
                    setThreshold(2.5);
                }
            } else {
                setName('');
                setDescription('');
                setEventTrigger('SYSTEM_DEGRADATION');
                setSeverity('warning');
                setDurationWindowSec(300);
                setMetric('MOS');
                setOperator('LT');
                setThreshold(2.5);
            }
            setError('');
            setIsDirty(false);
            setShowDiscard(false);
        }
    }, [open, initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError(t('alertsPage.ruleModal.nameRequired'));
            return;
        }

        setSaving(true);
        try {
            await onSave({
                name: name.trim(),
                description: description.trim(),
                eventTrigger,
                severity,
                durationWindowSec: Number(durationWindowSec),
                metricExpressions: [{ metric, operator, threshold: Number(threshold) }],
                smartBaseline: false // Manual rules don't use AI smart baselines yet
            });
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || t('alertsPage.ruleModal.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <GlassModal
                open={open}
                onOpenChange={onClose}
                title={initialData ? t('alertsPage.ruleModal.editTitle') : t('alertsPage.ruleModal.createTitle')}
                className="w-[500px]"
                isDirty={isDirty}
                onCloseAttempt={() => { if (isDirty) setShowDiscard(true); else onClose(); }}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                    {error && (
                        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.75rem', borderRadius: '4px', fontSize: '0.85rem', border: '1px solid #fecaca' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('alertsPage.ruleModal.ruleName')}</label>
                        <Input
                            value={name}
                            onChange={(e: any) => { setName(e.target.value); setIsDirty(true); }}
                            placeholder={t('alertsPage.placeholders.ruleNamePlaceholder')}
                            required
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('alertsPage.ruleModal.description')}</label>
                        <Textarea
                            value={description}
                            onChange={e => { setDescription(e.target.value); setIsDirty(true); }}
                            placeholder={t('alertsPage.placeholders.descriptionPlaceholder')}
                            className="input-field"
                            rows={2}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('alertsPage.ruleModal.eventTrigger')}</label>
                            <Select
                                value={eventTrigger}
                                onChange={e => { setEventTrigger(e.target.value); setIsDirty(true); }}
                                className="input-field"
                            >
                                <option value="SYSTEM_DEGRADATION">{t('alertsPage.ruleModal.eventSystemDegradation')}</option>
                                <option value="QUAL_VIOLATION">{t('alertsPage.ruleModal.eventQualViolation')}</option>
                                <option value="EMOTION_BURNOUT">{t('alertsPage.ruleModal.eventEmotionBurnout')}</option>
                            </Select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('alertsPage.ruleModal.severityLabel')}</label>
                            <Select
                                value={severity}
                                onChange={e => { setSeverity(e.target.value as any); setIsDirty(true); }}
                                className="input-field"
                            >
                                <option value="info">{t('alertsPage.ruleModal.sevInfo')}</option>
                                <option value="warning">{t('alertsPage.ruleModal.sevWarning')}</option>
                                <option value="critical">{t('alertsPage.ruleModal.sevCritical')}</option>
                            </Select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('alertsPage.ruleModal.condition')}</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
                            <Select
                                value={metric}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val !== 'QUEUE_WAIT_TIME') { setMetric(val as any); setIsDirty(true); }
                                }}
                                className="input-field"
                            >
                                <option value="MOS">{t('alertsPage.ruleModal.metricMos')}</option>
                                <option value="SIP_ERROR_RATE">{t('alertsPage.ruleModal.metricSipError')}</option>
                                <option value="CONCURRENT_CALLS">{t('alertsPage.ruleModal.metricConcurrent')}</option>
                                <option value="CALL_FAILURE_RATE">{t('alertsPage.ruleModal.metricCallFailure')}</option>
                                <option value="ASR_LATENCY">{t('alertsPage.ruleModal.metricAsrLatency')}</option>
                                <option value="QUEUE_WAIT_TIME" disabled style={{ color: 'var(--text-muted)' }}>{t('alertsPage.ruleModal.metricQueueWait')}</option>
                            </Select>
                            <Select
                                value={operator}
                                onChange={e => { setOperator(e.target.value as any); setIsDirty(true); }}
                                className="input-field"
                            >
                                <option value="GT">{t('alertsPage.ruleModal.opGt')}</option>
                                <option value="GTE">{t('alertsPage.ruleModal.opGte')}</option>
                                <option value="LT">{t('alertsPage.ruleModal.opLt')}</option>
                                <option value="LTE">{t('alertsPage.ruleModal.opLte')}</option>
                                <option value="EQ">{t('alertsPage.ruleModal.opEq')}</option>
                            </Select>
                            <Input
                                type="number"
                                step="any"
                                value={threshold}
                                onChange={(e: any) => { setThreshold(parseFloat(e.target.value)); setIsDirty(true); }}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('alertsPage.ruleModal.durationWindow')}</label>
                        <Input
                            type="number"
                            min={0}
                            value={durationWindowSec}
                            onChange={(e: any) => { setDurationWindowSec(parseInt(e.target.value)); setIsDirty(true); }}
                            placeholder={t('alertsPage.placeholders.durationPlaceholder')}
                            required
                        />
                        <small style={{ color: 'var(--text-muted)' }}>{t('alertsPage.ruleModal.durationHint')}</small>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                        <Button type="button" className="al-" onClick={() => { if (isDirty) setShowDiscard(true); else onClose(); }} disabled={saving}>
                            {t('alertsPage.ruleModal.cancel')}
                        </Button>
                        <Button type="submit" className="al- al--" disabled={saving}>
                            {saving ? t('alertsPage.ruleModal.saving') : t('alertsPage.ruleModal.saveRule')}
                        </Button>
                    </div>
                </form>
            </GlassModal>
            <ConfirmModal
                open={showDiscard}
                onClose={() => setShowDiscard(false)}
                onConfirm={() => { setShowDiscard(false); onClose(); }}
                title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                confirmText={t('common.discard', 'Discard')}
                cancelText={t('common.cancel', 'Cancel')}
            />
        </>
    );
};
