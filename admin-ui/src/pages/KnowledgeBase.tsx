import { Input } from "../components/ui/input";
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { Plus, Search, Edit3, Save, Loader2, BookOpen, Tag, RefreshCw, Archive, Upload, FileText, Database, Cpu } from 'lucide-react';
import { GlassModal } from '../components/ui/GlassModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';

import { Button } from '../components/ui/button';

interface KBArticle {
    _id: string;
    title: string;
    content: string;
    category: 'faq' | 'product' | 'policy' | 'script' | 'other';
    tags: string[];
    sourceFile?: string;
    chunkIndex?: number;
    chunkTotal?: number;
    status: 'active' | 'archived' | 'indexing' | 'error';
    createdAt: string;
    updatedAt: string;
}

const CATEGORY_DEFS = [
    { value: 'faq', labelKey: 'knowledgeBase.catFaq', color: 'hsl(210,70%,50%)' },
    { value: 'product', labelKey: 'knowledgeBase.catProduct', color: 'hsl(150,60%,40%)' },
    { value: 'policy', labelKey: 'knowledgeBase.catPolicy', color: 'hsl(35,80%,50%)' },
    { value: 'script', labelKey: 'knowledgeBase.catScript', color: 'hsl(280,60%,50%)' },
    { value: 'other', labelKey: 'knowledgeBase.catOther', color: 'hsl(0,0%,50%)' },
];

const KnowledgeBase: React.FC = () => {
    const { t } = useTranslation();
    const [articles, setArticles] = useState<KBArticle[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [catFilter, setCatFilter] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Editor modal
    const [showEditor, setShowEditor] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', content: '', category: 'faq' as string, tags: '' });
    const [savingArticle, setSavingArticle] = useState(false);
    const [indexing, setIndexing] = useState(false);
    const [archiveTarget, setArchiveTarget] = useState<KBArticle | null>(null);
    const [editorDirty, setEditorDirty] = useState(false);
    const [showEditorDiscard, setShowEditorDiscard] = useState(false);

    // Upload state
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Vector DB health
    const [vdbHealth, setVdbHealth] = useState<{ ok: boolean; message: string } | null>(null);
    // Python RAG service health
    const [ragHealth, setRagHealth] = useState<{ ok: boolean; message?: string } | null>(null);
    // Vector dimension mismatch detection
    const [dimMismatch, setDimMismatch] = useState<{ expected: number; actual: number } | null>(null);

    const fetchArticles = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = { limit: 100, offset: 0 };
            if (catFilter) params.category = catFilter;
            const res = await api.get('/knowledge', { params });
            const raw = res.data;
            const data = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw?.data?.data) ? raw.data.data : []));
            setArticles(data);
            setTotal(res.data.pagination?.total || res.data.total || 0);
        } catch (err) {
            console.error('Failed to fetch KB articles:', err);
        } finally {
            setLoading(false);
        }
    }, [catFilter]);

    useEffect(() => { fetchArticles(); }, [fetchArticles]);

    // Check Vector DB + RAG service health on mount, poll RAG until ready
    useEffect(() => {
        api.get('/knowledge/health').then(res => setVdbHealth(res.data)).catch(() => setVdbHealth({ ok: false, message: 'Unreachable' }));

        let ragPollTimer: ReturnType<typeof setInterval> | null = null;
        const checkRag = () => {
            api.get('/knowledge/rag-health')
                .then(res => {
                    setRagHealth(res.data);
                    if (res.data?.dimensionMismatch && res.data.expectedDim && res.data.actualDim) {
                        setDimMismatch({ expected: res.data.expectedDim, actual: res.data.actualDim });
                    } else {
                        setDimMismatch(null);
                    }
                    if (res.data?.ok && ragPollTimer) { clearInterval(ragPollTimer); ragPollTimer = null; }
                })
                .catch(() => setRagHealth({ ok: false, message: 'Unreachable' }));
        };
        checkRag();
        ragPollTimer = setInterval(checkRag, 10_000);
        return () => { if (ragPollTimer) clearInterval(ragPollTimer); };
    }, []);

    const handleSearch = async () => {
        if (!searchQuery.trim()) { setSearchResults(null); return; }
        setSearching(true);
        try {
            const res = await api.get('/knowledge/search', { params: { q: searchQuery, limit: 10 } });
            setSearchResults(res.data.results || []);
        } catch (err) {
            setMessage({ type: 'error', text: t('knowledgeBase.searchFailed') });
        } finally {
            setSearching(false);
        }
    };

    const handleSave = async () => {
        if (!form.title.trim() || !form.content.trim()) return;
        setSavingArticle(true);
        try {
            const payload = {
                title: form.title,
                content: form.content,
                category: form.category,
                tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            };
            if (editingId) {
                const article = articles.find(a => a._id === editingId);
                if (article?.sourceFile) {
                    await api.patch(`/knowledge/file/${encodeURIComponent(article.sourceFile)}`, {
                        category: payload.category,
                        tags: payload.tags
                    });
                } else {
                    await api.patch(`/knowledge/${editingId}`, payload);
                }
                setMessage({ type: 'success', text: t('knowledgeBase.articleUpdated') });
            } else {
                await api.post('/knowledge', payload);
                setMessage({ type: 'success', text: t('knowledgeBase.articleCreated') });
            }
            setShowEditor(false);
            setEditingId(null);
            setForm({ title: '', content: '', category: 'faq', tags: '' });
            fetchArticles();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.error || t('knowledgeBase.saveFailed') });
        } finally {
            setSavingArticle(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleDelete = async (article: KBArticle) => {
        try {
            if (article.sourceFile) {
                await api.delete(`/knowledge/file/${encodeURIComponent(article.sourceFile)}`);
                setMessage({ type: 'success', text: t('knowledgeBase.fileArchived', { defaultValue: 'File deleted' }) });
            } else {
                await api.patch(`/knowledge/${article._id}`, { status: 'archived' });
                setMessage({ type: 'success', text: t('knowledgeBase.articleArchived') });
            }
            fetchArticles();
        } catch (err) {
            setMessage({ type: 'error', text: t('knowledgeBase.archiveFailed') });
        }
        setArchiveTarget(null);
        setTimeout(() => setMessage(null), 3000);
    };

    const handleBatchIndex = async () => {
        setIndexing(true);
        try {
            await api.post('/knowledge/index');
            setMessage({ type: 'success', text: t('knowledgeBase.batchIndexStarted') });
        } catch (err) {
            setMessage({ type: 'error', text: t('knowledgeBase.batchIndexFailed') });
        } finally {
            setIndexing(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const openEdit = (article: KBArticle) => {
        setEditingId(article._id);
        setForm({ title: displayTitle(article), content: article.content, category: article.category, tags: article.tags.join(', ') });
        setEditorDirty(false);
        setShowEditorDiscard(false);
        setShowEditor(true);
    };

    const catInfo = (cat: string) => {
        const def = CATEGORY_DEFS.find(c => c.value === cat) || CATEGORY_DEFS[4];
        return { ...def, label: t(def.labelKey) };
    };

    const displayTitle = (article: KBArticle) => {
        if (article.sourceFile) {
            // Strip out " [1/78]" etc if present
            return article.title.replace(/\s+\[\d+\/\d+\]$/, '');
        }
        return article.title;
    };

    // ── File Upload ──
    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        let successCount = 0;
        let totalChunks = 0;
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', 'other');
                const res = await api.post('/knowledge/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                successCount++;
                totalChunks += res.data.chunks || 0;
            }
            setMessage({ type: 'success', text: t('knowledgeBase.uploadSuccess', { count: successCount, chunks: totalChunks }) });
            fetchArticles();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.error || t('knowledgeBase.uploadFailed') });
        } finally {
            setUploading(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        handleFileUpload(e.dataTransfer.files);
    };

    return (
        <div className="page-content">
            <div className="glass-panel" style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <BookOpen size={24} color="var(--primary)" />
                        <h2 style={{ margin: 0 }}>{t('knowledgeBase.title')}</h2>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 10px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>{total} {t('knowledgeBase.articles')}</span>
                        {vdbHealth && (
                            <span
                                title={vdbHealth.ok ? t('knowledgeBase.vectorDbReachable') : vdbHealth.message}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    fontSize: '0.8rem', padding: '2px 10px', borderRadius: '12px', fontWeight: 600,
                                    background: vdbHealth.ok ? 'hsla(150,60%,45%,0.12)' : 'hsla(0,60%,50%,0.12)',
                                    color: vdbHealth.ok ? 'hsl(150,60%,30%)' : 'hsl(0,60%,40%)',
                                }}
                            >
                                <Database size={12} />
                                {vdbHealth.ok ? t('knowledgeBase.vectorDbOnline') : t('knowledgeBase.vectorDbOffline')}
                            </span>
                        )}
                        {ragHealth !== null && (
                            <span
                                title={ragHealth.ok ? t('knowledgeBase.ragServiceReadyTip') : (ragHealth.message || t('knowledgeBase.ragServiceNotAvailableTip'))}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    fontSize: '0.8rem', padding: '2px 10px', borderRadius: '12px', fontWeight: 600,
                                    background: ragHealth.ok ? 'hsla(210,70%,50%,0.12)' : 'hsla(35,80%,50%,0.12)',
                                    color: ragHealth.ok ? 'hsl(210,70%,40%)' : 'hsl(35,80%,35%)',
                                }}
                            >
                                <Cpu size={12} />
                                {ragHealth.ok ? t('knowledgeBase.ragServiceOnline') : t('knowledgeBase.ragServiceOffline')}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button className="-sm" onClick={handleBatchIndex} disabled={indexing} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} size="sm">
                            {indexing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                            {t('knowledgeBase.reIndexAll')}
                        </Button>
                        <Button size="sm" className="-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                            {uploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                            {t('knowledgeBase.uploadFile')}
                        </Button>
                        <Input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx,.xlsx,.csv" multiple style={{ display: 'none' }} onChange={e => handleFileUpload(e.target.files)} />
                        <Button size="sm" className="- -sm" onClick={() => { setEditingId(null); setForm({ title: '', content: '', category: 'faq', tags: '' }); setEditorDirty(false); setShowEditorDiscard(false); setShowEditor(true); }} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                            <Plus size={14} /> {t('knowledgeBase.newArticle')}
                        </Button>
                    </div>
                </div>

                {/* Dimension Mismatch Warning */}
                {dimMismatch && (
                    <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', background: 'hsla(35,90%,50%,0.12)', border: '1px solid hsla(35,90%,50%,0.3)', color: 'hsl(35,50%,30%)', fontWeight: 500, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ⚠️ {t('knowledgeBase.dimMismatchWarning', { expected: dimMismatch.expected, actual: dimMismatch.actual })}
                    </div>
                )}

                {/* Message */}
                {message && (
                    <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', background: message.type === 'success' ? 'hsla(150,60%,90%,1)' : 'hsla(0,60%,90%,1)', color: message.type === 'success' ? 'var(--success)' : 'var(--danger)', fontWeight: 500, fontSize: '0.9rem' }}>
                        {message.text}
                    </div>
                )}

                {/* Search + Filter */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <Input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder={t('knowledgeBase.searchPlaceholder')}
                            style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                        />
                    </div>
                    <Button className="-sm" onClick={handleSearch} disabled={searching} style={{ padding: '0.5rem 1rem' }} size="sm">
                        {searching ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />} {t('knowledgeBase.search')}
                    </Button>
                    <Select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                        <option value="">{t('knowledgeBase.allCategories')}</option>
                        {CATEGORY_DEFS.map(c => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
                    </Select>
                    {searchResults && (
                        <Button size="sm" className="-sm" onClick={() => setSearchResults(null)} style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>{t('knowledgeBase.clearSearch')}</Button>
                    )}
                </div>

                {/* Search Results */}
                {searchResults && (
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid hsla(210,80%,55%,0.3)', background: 'hsla(210,80%,97%,1)' }}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--primary)' }}>{t('knowledgeBase.ragSearchResults', { count: searchResults.length })}</h4>
                        {searchResults.length === 0 && <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('knowledgeBase.noResults')}</p>}
                        {searchResults.map((r, i) => (
                            <div key={i} style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', marginBottom: '0.5rem', background: 'var(--bg-card)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                    <strong style={{ fontSize: '0.9rem' }}>{r.sourceFile ? r.title.replace(/\s+\[\d+\/\d+\]$/, '') : r.title}</strong>
                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: r.score > 0.7 ? 'hsla(150,60%,45%,0.15)' : 'hsla(35,80%,50%,0.15)', color: r.score > 0.7 ? 'hsl(150,60%,30%)' : 'hsl(35,80%,35%)', fontWeight: 600 }}>
                                        {t('knowledgeBase.score', { pct: (r.score * 100).toFixed(0) })}
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.content?.slice(0, 200)}{r.content?.length > 200 ? '…' : ''}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Drag & Drop Upload Zone */}
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    style={{
                        border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--glass-border)'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem',
                        textAlign: 'center',
                        marginBottom: '1.5rem',
                        background: dragOver ? 'hsla(230,80%,60%,0.06)' : 'transparent',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload size={20} color={dragOver ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: '0.25rem' }} />
                    <p style={{ margin: 0, fontSize: '0.85rem', color: dragOver ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {uploading ? t('knowledgeBase.uploadingChunking') : t('knowledgeBase.dropHint')}
                    </p>
                </div>

                {/* Articles List */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <Loader2 className="animate-spin" size={24} /> {t('knowledgeBase.loading')}
                    </div>
                ) : articles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <p>{t('knowledgeBase.noArticles')}</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {articles.map(article => {
                            const ci = catInfo(article.category);
                            return (
                                <div key={article._id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', transition: 'border-color 0.2s' }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                            <strong style={{ fontSize: '0.95rem' }}>{displayTitle(article)}</strong>
                                            <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: `${ci.color}18`, color: ci.color, border: `1px solid ${ci.color}30` }}>{ci.label}</span>
                                            {(article.status === 'indexing' || article.content?.startsWith('[Processing')) && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(210,70%,50%,0.12)', color: 'hsl(210,70%,45%)' }}>
                                                    <Loader2 size={10} className="animate-spin" /> {t('knowledgeBase.indexingStatus')}
                                                </span>
                                            )}
                                            {(article.status === 'error' || article.content?.startsWith('[Failed]')) && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(0,60%,50%,0.12)', color: 'hsl(0,60%,40%)' }}>
                                                    ✕ {t('knowledgeBase.failedStatus')}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {article.sourceFile && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--primary)', opacity: 0.7 }}>
                                                    <FileText size={12} /> {article.sourceFile}
                                                </span>
                                            )}
                                            {article.tags.length > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <Tag size={12} /> {article.tags.slice(0, 3).join(', ')}
                                                </span>
                                            )}
                                            <span>{t('knowledgeBase.updated')} {new Date(article.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <Button size="sm" className="-sm" onClick={() => openEdit(article)} style={{ padding: '0.3rem 0.6rem' }}>
                                            <Edit3 size={14} />
                                        </Button>
                                        <Button size="sm" className="-sm" onClick={() => setArchiveTarget(article)} style={{ padding: '0.3rem 0.6rem', color: 'var(--danger)' }}>
                                            <Archive size={14} />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Editor Modal */}
                <GlassModal
                    open={showEditor}
                    onOpenChange={(v) => { if (!v) { setShowEditor(false); setEditorDirty(false); } }}
                    title={editingId ? t('knowledgeBase.editArticle') : t('knowledgeBase.newArticleTitle')}
                    style={{ maxWidth: '700px' }}
                    isDirty={editorDirty}
                    onCloseAttempt={() => { if (editorDirty) setShowEditorDiscard(true); else { setShowEditor(false); setEditorDirty(false); } }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {(() => {
                            const isFileEditing = !!editingId && !!articles.find(a => a._id === editingId)?.sourceFile;
                            return (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('knowledgeBase.titleLabel')} {isFileEditing && <span style={{ color: 'var(--warning)', fontSize: '0.7rem', fontWeight: 'normal', fontStyle: 'italic' }}>({t('knowledgeBase.readOnlyForFiles')})</span>}</label>
                                        <Input value={form.title} disabled={isFileEditing} onChange={e => { setForm({ ...form, title: e.target.value }); setEditorDirty(true); }} placeholder={t('knowledgeBase.titlePlaceholder')} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)', opacity: isFileEditing ? 0.6 : 1, cursor: isFileEditing ? 'not-allowed' : 'text' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('knowledgeBase.categoryLabel')}</label>
                                        <Select value={form.category} onChange={e => { setForm({ ...form, category: e.target.value }); setEditorDirty(true); }} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                            {CATEGORY_DEFS.map(c => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('knowledgeBase.contentLabel')}</label>
                                        <Textarea value={form.content} disabled={isFileEditing} onChange={e => { setForm({ ...form, content: e.target.value }); setEditorDirty(true); }} rows={10} placeholder={t('knowledgeBase.contentPlaceholder')} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.85rem', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', background: 'var(--bg-card)', color: 'var(--text-primary)', opacity: isFileEditing ? 0.6 : 1, cursor: isFileEditing ? 'not-allowed' : 'text' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>{t('knowledgeBase.tagsLabel')}</label>
                                        <Input value={form.tags} onChange={e => { setForm({ ...form, tags: e.target.value }); setEditorDirty(true); }} placeholder={t('knowledgeBase.tagsPlaceholder')} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                        <Button size="sm" className="-sm" onClick={() => { if (editorDirty) setShowEditorDiscard(true); else setShowEditor(false); }} style={{ padding: '0.5rem 1.25rem' }}>{t('knowledgeBase.cancel')}</Button>
                        <Button className="- -sm" onClick={handleSave} disabled={savingArticle || !(form.title || '').trim() || !(form.content || '').trim()} style={{ padding: '0.5rem 1.25rem' }} size="sm">
                            {savingArticle ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                            {editingId ? t('knowledgeBase.update') : t('knowledgeBase.create')}
                        </Button>
                    </div>
                </GlassModal>

                {/* Delete Confirmation Modal */}
                <ConfirmModal
                    open={!!archiveTarget}
                    onClose={() => setArchiveTarget(null)}
                    onConfirm={() => { if (archiveTarget) handleDelete(archiveTarget); }}
                    title={t('knowledgeBase.archiveConfirm')}
                    description={t('knowledgeBase.archiveConfirmDesc')}
                    confirmText={t('knowledgeBase.archive')}
                />

                <ConfirmModal
                    open={showEditorDiscard}
                    onClose={() => setShowEditorDiscard(false)}
                    onConfirm={() => { setShowEditorDiscard(false); setShowEditor(false); setEditorDirty(false); }}
                    title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                    description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                    confirmText={t('common.discard', 'Discard')}
                    cancelText={t('common.cancel', 'Cancel')}
                />
            </div >
        </div >
    );
};

export default KnowledgeBase;
