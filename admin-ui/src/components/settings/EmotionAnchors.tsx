/**
 * EmotionAnchors — 情绪锚点管理 + 测试面板
 *
 * Settings → Business Logic → Emotion Anchors
 * 复用 IntentManagement 同一 UI 模式, 数据通过 SER Python API 管理
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import {
    Brain, Plus, Save, X, TestTube, Loader2,
    AlertCircle, ChevronDown, ChevronUp, RotateCcw, Download,
} from 'lucide-react';
import { Select } from '../ui/Select';

import { Button } from '../ui/button';
import { Input } from '../ui/input';

const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊', angry: '😡', sad: '😢', frustrated: '😤',
    neutral: '😐', fear: '😨', surprise: '😲', disgust: '🤢',
};

const EMOTION_COLORS: Record<string, string> = {
    happy: 'hsl(45, 90%, 50%)', angry: 'hsl(0, 70%, 50%)',
    sad: 'hsl(210, 60%, 55%)', frustrated: 'hsl(25, 75%, 50%)',
    neutral: 'hsl(210, 10%, 55%)', fear: 'hsl(270, 50%, 55%)',
    surprise: 'hsl(175, 60%, 45%)', disgust: 'hsl(90, 40%, 45%)',
};

const EmotionAnchors: React.FC = () => {
    const { t } = useTranslation();
    const [anchors, setAnchors] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // New category form
    const [addingCategory, setAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Load Preset
    const [presetLocales, setPresetLocales] = useState<{ code: string; label: string }[]>([]);
    const [showPresetPicker, setShowPresetPicker] = useState(false);
    const [presetLoading, setPresetLoading] = useState(false);

    // Test panel
    const [testText, setTestText] = useState('');
    const [testResult, setTestResult] = useState<any>(null);
    const [testing, setTesting] = useState(false);

    const fetchAnchors = useCallback(async () => {
        try {
            const res = await api.get('/speech-emotion/anchors');
            setAnchors(res.data?.data || res.data || {});
        } catch (err) {
            console.error('Failed to fetch emotion anchors', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAnchors(); }, [fetchAnchors]);

    // 加载可用语言列表
    useEffect(() => {
        api.get('/speech-emotion/anchor-presets/locales')
            .then(res => setPresetLocales(res.data?.data || []))
            .catch(() => { });
    }, []);

    const loadPreset = async (lang: string) => {
        setPresetLoading(true);
        try {
            const res = await api.get(`/speech-emotion/anchor-presets/${lang}`);
            const preset: Record<string, string[]> = res.data?.data || {};
            // 合并: 已有类别追加去重, 新类别直接加入
            setAnchors(prev => {
                const merged = { ...prev };
                for (const [emotion, texts] of Object.entries(preset)) {
                    const existing = new Set(merged[emotion] || []);
                    const newTexts = texts.filter(t => !existing.has(t));
                    merged[emotion] = [...(merged[emotion] || []), ...newTexts];
                }
                return merged;
            });
            setDirty(true);
            setShowPresetPicker(false);
            setMessage({ type: 'success', text: t('emotionAnchors.presetLoaded', `Loaded ${lang} preset (merged)`) });
        } catch {
            setMessage({ type: 'error', text: t('emotionAnchors.presetFailed', 'Failed to load preset') });
        } finally {
            setPresetLoading(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/speech-emotion/anchors', anchors);
            setDirty(false);
            setMessage({ type: 'success', text: t('emotionAnchors.saved', 'Emotion anchors saved and recomputed') });
        } catch (err) {
            setMessage({ type: 'error', text: t('emotionAnchors.saveFailed', 'Failed to save emotion anchors') });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleReset = async () => {
        try {
            await api.delete('/speech-emotion/anchors');
            await fetchAnchors();
            setDirty(false);
            setMessage({ type: 'success', text: t('emotionAnchors.resetDone', 'Reset to default anchors') });
        } catch {
            setMessage({ type: 'error', text: t('emotionAnchors.resetFailed', 'Failed to reset') });
        }
        setTimeout(() => setMessage(null), 3000);
    };

    const updateAnchorText = (emotion: string, idx: number, val: string) => {
        setAnchors(prev => {
            const updated = { ...prev, [emotion]: [...(prev[emotion] || [])] };
            updated[emotion][idx] = val;
            return updated;
        });
        setDirty(true);
    };

    const addAnchorText = (emotion: string) => {
        setAnchors(prev => ({
            ...prev,
            [emotion]: [...(prev[emotion] || []), ''],
        }));
        setDirty(true);
    };

    const removeAnchorText = (emotion: string, idx: number) => {
        setAnchors(prev => ({
            ...prev,
            [emotion]: (prev[emotion] || []).filter((_: string, i: number) => i !== idx),
        }));
        setDirty(true);
    };

    const addCategory = () => {
        if (!newCategoryName.trim()) return;
        const key = newCategoryName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (anchors[key]) return;
        setAnchors(prev => ({ ...prev, [key]: [''] }));
        setAddingCategory(false);
        setNewCategoryName('');
        setExpandedKey(key);
        setDirty(true);
    };

    const removeCategory = (emotion: string) => {
        setAnchors(prev => {
            const next = { ...prev };
            delete next[emotion];
            return next;
        });
        setDirty(true);
    };

    const handleTest = async () => {
        if (!testText.trim()) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await api.post('/speech-emotion/test-emotion', { text: testText });
            setTestResult(res.data?.data || res.data);
        } catch {
            setTestResult({ error: true });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 className="animate-spin" size={20} /></div>;
    }

    const emotionKeys = Object.keys(anchors);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Message */}
            {message && (
                <div style={{
                    padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                    background: message.type === 'success' ? 'hsla(150, 50%, 90%, 1)' : 'hsla(0, 80%, 90%, 1)',
                    color: message.type === 'success' ? 'hsl(150, 50%, 30%)' : 'hsl(0, 70%, 30%)',
                    border: `1px solid ${message.type === 'success' ? 'hsla(150, 50%, 70%, 1)' : 'hsla(0, 70%, 70%, 1)'}`,
                }}>
                    {message.text}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Brain size={20} color="var(--primary)" />
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('emotionAnchors.title', 'Emotion Anchors')}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({emotionKeys.length})</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Load Preset */}
                    {showPresetPicker ? (
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <Select
                                onChange={e => { if (e.target.value) loadPreset(e.target.value); }}
                                disabled={presetLoading}
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                            >
                                <option value="">{t('emotionAnchors.selectLang', '-- Select Language --')}</option>
                                {presetLocales.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                            </Select>
                            <Button size="sm" variant="secondary" onClick={() => setShowPresetPicker(false)}>
                                <X size={14} />
                            </Button>
                        </div>
                    ) : (
                        <Button size="sm" variant="secondary" onClick={() => setShowPresetPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Download size={14} /> {t('emotionAnchors.loadPreset', 'Load Preset')}
                        </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <RotateCcw size={14} /> {t('emotionAnchors.resetDefault', 'Reset')}
                    </Button>
                    <Button size="sm" onClick={() => setAddingCategory(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Plus size={14} /> {t('emotionAnchors.addCategory', 'Add Category')}
                    </Button>
                </div>
            </div>

            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {t('emotionAnchors.description', 'Define anchor texts for each emotion. The system uses cosine similarity to classify customer text into these categories. More anchor texts improve accuracy.')}
            </p>

            {/* New Category Input */}
            {addingCategory && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Input
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
                        placeholder={t('emotionAnchors.categoryPlaceholder', 'e.g. sarcasm, disappointment...')}
                        style={{ maxWidth: '300px' }}
                        autoFocus
                    />
                    <Button size="sm" onClick={addCategory} disabled={!newCategoryName.trim()}>
                        <Save size={14} />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setAddingCategory(false)}>
                        <X size={14} />
                    </Button>
                </div>
            )}

            {/* Anchor List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {emotionKeys.map(emotion => {
                    const texts = anchors[emotion] || [];
                    const emoji = EMOTION_EMOJI[emotion] || '🏷️';
                    const color = EMOTION_COLORS[emotion] || 'var(--text-muted)';
                    const isExpanded = expandedKey === emotion;

                    return (
                        <div
                            key={emotion}
                            style={{
                                padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)',
                                border: `1px solid ${isExpanded ? color + '40' : 'var(--glass-border)'}`,
                                background: 'var(--bg-card)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Button
                                    onClick={() => setExpandedKey(isExpanded ? null : emotion)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex' }}
                                >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </Button>
                                <span style={{ fontSize: '1.2rem' }}>{emoji}</span>
                                <span style={{ fontWeight: 600, color }}>{emotion}</span>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                                    borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                    background: `${color}15`, color,
                                }}>
                                    {texts.length} {t('emotionAnchors.anchorsCount', 'anchors')}
                                </span>
                                <div style={{ flex: 1 }} />
                                <Button
                                    onClick={() => removeCategory(emotion)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', opacity: 0.6 }}
                                    title={t('emotionAnchors.removeCategory', 'Remove category')}
                                >
                                    <X size={14} />
                                </Button>
                            </div>

                            {isExpanded && (
                                <div style={{ marginTop: '0.75rem', paddingLeft: '2rem' }}>
                                    {texts.map((txt: string, i: number) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                            <Input
                                                value={txt}
                                                onChange={e => updateAnchorText(emotion, i, e.target.value)}
                                                placeholder={`${t('emotionAnchors.anchorPlaceholder', 'Anchor text')} ${i + 1}`}
                                                style={{ flex: 1, fontSize: '0.85rem' }}
                                            />
                                            <Button
                                                onClick={() => removeAnchorText(emotion, i)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0 4px' }}
                                            >
                                                <X size={14} />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        onClick={() => addAnchorText(emotion)}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600,
                                            display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0',
                                        }}
                                    >
                                        <Plus size={12} /> {t('emotionAnchors.addAnchor', 'Add anchor text')}
                                    </Button>
                                </div>
                            )}

                            {!isExpanded && texts.length > 0 && (
                                <div style={{ marginTop: '0.5rem', paddingLeft: '2rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                    {texts.slice(0, 5).map((txt: string, i: number) => (
                                        <span key={i} style={{
                                            padding: '0.15rem 0.5rem', borderRadius: '12px',
                                            background: `${color}08`, fontSize: '0.78rem',
                                            color: 'var(--text-secondary)',
                                        }}>
                                            "{txt}"
                                        </span>
                                    ))}
                                    {texts.length > 5 && (
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            +{texts.length - 5} more
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {emotionKeys.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <AlertCircle size={28} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                        <p style={{ margin: 0 }}>{t('emotionAnchors.empty', 'No emotion anchors configured.')}</p>
                    </div>
                )}
            </div>

            {/* Save Bar */}
            {dirty && (
                <div style={{
                    display: 'flex', justifyContent: 'flex-end', padding: '1rem',
                    borderRadius: 'var(--radius-md)', background: 'hsla(var(--primary-hue, 260), 80%, 55%, 0.05)',
                    border: '1px solid var(--primary)',
                }}>
                    <Button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {saving ? t('emotionAnchors.saving', 'Saving...') : t('emotionAnchors.saveAnchors', 'Save Anchors')}
                    </Button>
                </div>
            )}

            {/* Test Panel */}
            <div style={{
                padding: '1.25rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <TestTube size={16} color="var(--primary)" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{t('emotionAnchors.testMatch', 'Test Emotion Match')}</h4>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Input
                        value={testText}
                        onChange={e => setTestText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleTest(); }}
                        placeholder={t('emotionAnchors.testPlaceholder', 'Type a customer message to test emotion matching…')}
                        style={{ flex: 1 }}
                    />
                    <Button size="sm" onClick={handleTest} disabled={testing || !testText.trim()}>
                        {testing ? <Loader2 className="animate-spin" size={14} /> : t('emotionAnchors.test', 'Test')}
                    </Button>
                </div>
                {testResult && (
                    <div style={{
                        marginTop: '0.75rem', padding: '0.75rem', borderRadius: '6px',
                        background: testResult.error ? 'hsla(0,60%,50%,0.08)' : 'hsla(150,60%,45%,0.08)',
                    }}>
                        {testResult.error ? (
                            <span style={{ color: 'var(--danger)' }}>{t('emotionAnchors.testError', 'Classification failed or model not loaded')}</span>
                        ) : (
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '1.5rem' }}>{EMOTION_EMOJI[testResult.emotion] || '🏷️'}</span>
                                <span style={{ fontWeight: 600, color: EMOTION_COLORS[testResult.emotion] || 'var(--text-primary)' }}>
                                    {testResult.emotion}
                                </span>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {t('emotionAnchors.confidence', 'Confidence')}: {((testResult.confidence || 0) * 100).toFixed(1)}%
                                </span>
                                {testResult.scores && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {Object.entries(testResult.scores as Record<string, number>)
                                            .sort(([, a], [, b]) => b - a)
                                            .slice(0, 4)
                                            .map(([em, score]) => (
                                                <span key={em} style={{
                                                    fontSize: '0.75rem', padding: '1px 6px', borderRadius: '8px',
                                                    background: 'var(--bg-base)', color: 'var(--text-muted)',
                                                }}>
                                                    {EMOTION_EMOJI[em] || ''} {em}: {((score as number) * 100).toFixed(0)}%
                                                </span>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmotionAnchors;
