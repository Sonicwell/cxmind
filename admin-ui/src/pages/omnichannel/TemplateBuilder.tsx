import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Webhook, MonitorSmartphone, Mail, Image, Type, Columns, Trash2, Plus, MessageCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Input } from '../../components/ui/input';
import api from '../../services/api';
import '../../styles/templates.css';

import { Button } from '../../components/ui/button';

const SUPPORTED_LANGUAGES = [
    { code: 'en_US', name: 'English (US)' },
    { code: 'en_GB', name: 'English (UK)' },
    { code: 'zh_CN', name: 'Chinese (Simplified)' },
    { code: 'zh_HK', name: 'Chinese (Traditional, HK)' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'es_ES', name: 'Spanish (Spain)' },
    { code: 'es_MX', name: 'Spanish (Latin America)' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt_BR', name: 'Portuguese (Brazil)' },
    { code: 'pt_PT', name: 'Portuguese (Portugal)' },
    { code: 'ru', name: 'Russian' },
    { code: 'ar', name: 'Arabic' },
    { code: 'id', name: 'Indonesian' },
    { code: 'th', name: 'Thai' },
    { code: 'vi', name: 'Vietnamese' }
];

interface TemplateComponent {
    type: string;
    format?: string;
    text?: string;
    buttons?: any[];
}

interface TemplateTranslation {
    language: string;
    status: string;
    components: TemplateComponent[];
}

interface TemplateDef {
    _id: string;
    name: string;
    category: string;
    translations: TemplateTranslation[];
    updatedAt: string;
}

export const TemplateBuilder: React.FC = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'build' | 'preview'>('build');
    const [previewChannel, setPreviewChannel] = useState<'webchat' | 'email' | 'whatsapp' | 'line' | 'kakao'>('webchat');

    const [template, setTemplate] = useState<TemplateDef | null>(null);
    const [allTemplates, setAllTemplates] = useState<TemplateDef[]>([]);
    const [currentLang, setCurrentLang] = useState<string>('en_US');
    const [loading, setLoading] = useState(false);
    const [showLangPrompt, setShowLangPrompt] = useState(false);
    const [newLangCode, setNewLangCode] = useState('');
    const [searchLangQuery, setSearchLangQuery] = useState('');

    // Fetch all templates for navigation
    useEffect(() => {
        api.get('/templates').then(res => {
            const data = res.data;
            const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.data?.data) ? data.data.data : []));
            setAllTemplates(arr);
        }).catch(err => {
            console.warn("Failed to fetch template list for navigation", err);
        });
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const id = params.get('id');
        const mode = params.get('mode');

        if (mode === 'preview') {
            setActiveTab('preview');
        }

        if (id) {
            setLoading(true);
            api.get(`/templates/${id}`).then(res => {
                const raw = res.data;
                const data1 = Array.isArray(raw) ? raw[0] : (raw?.data || raw);
                const tpl = Array.isArray(data1) ? data1[0] : (data1?.data || data1);
                setTemplate(tpl);
                if (tpl.translations && tpl.translations.length > 0) {
                    // Default to Chinese if available, else first language
                    const zhTr = tpl.translations.find((t: any) => t.language === 'zh_CN');
                    if (zhTr) {
                        setCurrentLang('zh_CN');
                    } else {
                        setCurrentLang(tpl.translations[0].language);
                    }
                }
            }).catch(err => {
                console.error("Failed to load template", err);
                // Fallback for new or missing templates
                setTemplate({ _id: '', name: 'new_template', category: 'MARKETING', translations: [{ language: 'en_US', status: 'DRAFT', components: [] }], updatedAt: new Date().toISOString() });
                setCurrentLang('en_US');
            }).finally(() => {
                setLoading(false);
            });
        } else {
            // New template mode
            setTemplate({
                _id: '',
                name: 'new_template',
                category: 'MARKETING',
                translations: [{ language: 'en_US', status: 'DRAFT', components: [] }],
                updatedAt: new Date().toISOString()
            });
            setCurrentLang('en_US');
        }
    }, [location.search]);

    // Calculate Prev/Next IDs
    const currentIndex = allTemplates.findIndex(t => t._id === template?._id);
    const prevId = currentIndex > 0 ? allTemplates[currentIndex - 1]._id : null;
    const nextId = currentIndex >= 0 && currentIndex < allTemplates.length - 1 ? allTemplates[currentIndex + 1]._id : null;

    const activeTranslation = template?.translations?.find(t => t.language === currentLang) || template?.translations?.[0];

    let headerText = '';
    let bodyText = '';
    let footerText = '';
    let buttons: any[] = [];
    let hasMediaHeader = false;

    if (activeTranslation) {
        activeTranslation.components.forEach(c => {
            if (c.type === 'HEADER') {
                if (c.format === 'TEXT') headerText = c.text || '';
                else hasMediaHeader = true;
            }
            if (c.type === 'BODY') bodyText = c.text || '';
            if (c.type === 'FOOTER') footerText = c.text || '';
            if (c.type === 'BUTTONS') buttons = c.buttons || [];
        });
    }

    const injectVars = (text: string) => {
        if (!text) return text;
        const name = template?.name || '';
        if (name === 'flight_boarding_pass_v1') {
            return text.replace(/\{\{1\}\}/g, 'Michael')
                .replace(/\{\{2\}\}/g, 'CX8821')
                .replace(/\{\{3\}\}/g, '14:30')
                .replace(/\{\{4\}\}/g, 'SFO')
                .replace(/\{\{5\}\}/g, 'HND')
                .replace(/\{\{6\}\}/g, '12A')
                .replace(/\{\{7\}\}/g, 'PASS_8821');
        } else if (name === 'ecommerce_delivery_alert') {
            return text.replace(/\{\{1\}\}/g, 'Michael')
                .replace(/\{\{2\}\}/g, '4:00 PM')
                .replace(/\{\{3\}\}/g, 'ORD-99120')
                .replace(/\{\{4\}\}/g, 'MacBook Pro 16"');
        } else if (name === 'bank_fraud_warning') {
            return text.replace(/\{\{1\}\}/g, '8892')
                .replace(/\{\{2\}\}/g, '$1,299.00')
                .replace(/\{\{3\}\}/g, 'Apple Store')
                .replace(/\{\{4\}\}/g, 'New York, NY');
        } else if (name === 'webinar_invitation_q3') {
            return text.replace(/\{\{1\}\}/g, 'Michael')
                .replace(/\{\{2\}\}/g, 'Next Tuesday')
                .replace(/\{\{3\}\}/g, '10:00 AM PST');
        } else if (name === 'wechat_order_status') {
            return text.replace(/\{\{1\}\}/g, 'Michael')
                .replace(/\{\{2\}\}/g, 'WX2026118833');
        } else if (name === 'line_flash_sale_promo') {
            return text.replace(/\{\{1\}\}/g, 'Michael')
                .replace(/\{\{2\}\}/g, 'SUMMER20');
        } else if (name === 'kakao_appointment_reminder') {
            return text.replace(/\{\{1\}\}/g, 'Michael')
                .replace(/\{\{2\}\}/g, '2026-03-01')
                .replace(/\{\{3\}\}/g, '15:00')
                .replace(/\{\{4\}\}/g, 'APT_98211');
        }

        // Fallback
        return text.replace(/\{\{1\}\}/g, 'Michael')
            .replace(/\{\{2\}\}/g, 'Value 2')
            .replace(/\{\{3\}\}/g, 'Value 3');
    };

    const renderedHeader = injectVars(headerText);
    const renderedBody = injectVars(bodyText);
    const renderedFooter = injectVars(footerText);

    const componentsList = [
        { type: 'HEADER', icon: <Image size={16} />, label: 'Header (Media/Text)' },
        { type: 'BODY', icon: <Type size={16} />, label: 'Body Text' },
        { type: 'FOOTER', icon: <Type size={16} />, label: 'Footer Note' },
        { type: 'BUTTONS', icon: <Columns size={16} />, label: 'Action Buttons' },
    ];

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, type: string) => {
        e.dataTransfer.setData('componentType', type);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('componentType');
        if (!type || !template) return;

        const updatedTemplate = { ...template };
        const transIdx = updatedTemplate.translations.findIndex(t => t.language === currentLang);
        if (transIdx === -1) return;

        const newComp: TemplateComponent = { type };
        if (type === 'HEADER') {
            newComp.format = 'TEXT';
            newComp.text = 'New Header';
        } else if (type === 'BODY') {
            newComp.text = 'New body text...';
        } else if (type === 'FOOTER') {
            newComp.text = 'Footer note';
        } else if (type === 'BUTTONS') {
            newComp.buttons = [{ type: 'URL', text: 'Visit Website', url: 'https://' }];
        }

        updatedTemplate.translations[transIdx].components.push(newComp);
        setTemplate(updatedTemplate);
    };

    const removeComponent = (idx: number) => {
        if (!template) return;
        const updatedTemplate = { ...template };
        const transIdx = updatedTemplate.translations.findIndex(t => t.language === currentLang);
        if (transIdx !== -1) {
            updatedTemplate.translations[transIdx].components.splice(idx, 1);
            setTemplate(updatedTemplate);
        }
    };

    const updateComponent = (idx: number, field: keyof TemplateComponent, value: any) => {
        if (!template) return;
        const updatedTemplate = { ...template };
        const transIdx = updatedTemplate.translations.findIndex(t => t.language === currentLang);
        if (transIdx !== -1) {
            updatedTemplate.translations[transIdx].components[idx] = {
                ...updatedTemplate.translations[transIdx].components[idx],
                [field]: value
            };
            setTemplate(updatedTemplate);
        }
    };

    const addLanguage = () => {
        setNewLangCode('');
        setSearchLangQuery('');
        setShowLangPrompt(true);
    };

    const confirmAddLanguage = (code?: string) => {
        const lang = (code || newLangCode).trim();
        if (!lang) {
            setShowLangPrompt(false);
            return;
        }
        if (!template) return;
        if (template.translations.some(t => t.language === lang)) {
            setCurrentLang(lang);
            setShowLangPrompt(false);
            return;
        }
        const updatedTemplate = { ...template };
        updatedTemplate.translations.push({
            language: lang,
            status: 'DRAFT',
            components: []
        });
        setTemplate(updatedTemplate);
        setCurrentLang(lang);
        setShowLangPrompt(false);
    };

    const updateButton = (compIdx: number, btnIdx: number, field: string, value: string) => {
        if (!template) return;
        const updatedTemplate = { ...template };
        const transIdx = updatedTemplate.translations.findIndex(t => t.language === currentLang);
        if (transIdx !== -1) {
            const comp = updatedTemplate.translations[transIdx].components[compIdx];
            if (comp.buttons) {
                comp.buttons[btnIdx] = { ...comp.buttons[btnIdx], [field]: value };
                setTemplate(updatedTemplate);
            }
        }
    };

    const addButton = (compIdx: number) => {
        if (!template) return;
        const updatedTemplate = { ...template };
        const transIdx = updatedTemplate.translations.findIndex(t => t.language === currentLang);
        if (transIdx !== -1) {
            const comp = updatedTemplate.translations[transIdx].components[compIdx];
            if (!comp.buttons) comp.buttons = [];
            comp.buttons.push({ type: 'URL', text: 'New Button', url: 'https://' });
            setTemplate(updatedTemplate);
        }
    };

    const removeButton = (compIdx: number, btnIdx: number) => {
        if (!template) return;
        const updatedTemplate = { ...template };
        const transIdx = updatedTemplate.translations.findIndex(t => t.language === currentLang);
        if (transIdx !== -1) {
            const comp = updatedTemplate.translations[transIdx].components[compIdx];
            if (comp.buttons) {
                comp.buttons.splice(btnIdx, 1);
                setTemplate(updatedTemplate);
            }
        }
    };

    const handleSave = async () => {
        if (!template) return;
        setLoading(true);
        try {
            if (template._id) {
                await api.put(`/templates/${template._id}`, template);
            } else {
                const res = await api.post('/templates', template);
                const obj = res.data?.data || res.data;
                navigate(`/templates/builder?id=${obj._id}`);
            }
            toast.success(t('templateBuilder.saveSuccess'));
        } catch (err: any) {
            console.error('Failed to save template', err);
            toast.error(t('templateBuilder.saveFailed') + ': ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const getMockMedia = (name: string, format: string) => {
        if (format === 'DOCUMENT') {
            return (
                <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: 40, height: 40, backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>PDF</div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>document.pdf</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>1.2 MB</div>
                    </div>
                </div>
            );
        }

        let url = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&h=300&fit=crop'; // default generic

        if (name === 'ecommerce_delivery_alert') {
            url = 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&h=300&fit=crop'; // package delivery
        } else if (name === 'webinar_invitation_q3') {
            url = 'https://images.unsplash.com/photo-1540317580384-e5d43867caa6?w=600&h=300&fit=crop'; // audience/webinar
        } else if (name === 'line_flash_sale_promo') {
            url = 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&h=300&fit=crop'; // shopping/sale
        }

        if (format === 'VIDEO') {
            const videoUrl = name === 'webinar_invitation_q3' ? 'https://assets.mixkit.co/videos/preview/mixkit-software-developer-working-on-code-41716-large.mp4' : 'https://assets.mixkit.co/videos/preview/mixkit-hands-typing-on-a-laptop-5605-large.mp4';
            return (
                <div style={{ width: '100%', position: 'relative', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000' }}>
                    <video
                        src={videoUrl}
                        style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block', opacity: 0.8 }}
                        autoPlay
                        muted
                        loop
                        playsInline
                    />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <div style={{ width: 48, height: 48, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                            <div style={{ width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderLeft: '16px solid #1e293b', marginLeft: '6px' }}></div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div style={{ width: '100%', position: 'relative', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden' }}>
                <img src={url} alt="Media Header" style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }} />
            </div>
        );
    };

    if (loading) {
        return <div className="tb-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
    }

    return (
        <div className="tb-container">
            {/* Top Navbar */}
            <div className="tb-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Button onClick={() => navigate('/templates')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} title="Back to list">
                        <ArrowLeft size={20} />
                    </Button>

                    {/* Template Navigation */}
                    <div style={{ display: 'flex', gap: '4px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px', marginLeft: '4px' }}>
                        <Button
                            onClick={() => prevId && navigate(`/templates/builder?id=${prevId}&mode=${activeTab}`)}
                            disabled={!prevId}
                            style={{ background: 'transparent', border: 'none', cursor: prevId ? 'pointer' : 'not-allowed', color: prevId ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
                            title="Previous Template"
                        >
                            <ChevronLeft size={20} />
                        </Button>
                        <Button
                            onClick={() => nextId && navigate(`/templates/builder?id=${nextId}&mode=${activeTab}`)}
                            disabled={!nextId}
                            style={{ background: 'transparent', border: 'none', cursor: nextId ? 'pointer' : 'not-allowed', color: nextId ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
                            title="Next Template"
                        >
                            <ChevronRight size={20} />
                        </Button>
                    </div>

                    <div style={{ marginLeft: '12px' }}>
                        <h2 className="tb-header-title">
                            <span
                                contentEditable
                                suppressContentEditableWarning
                                style={{ outline: 'none', borderBottom: '1px dashed var(--glass-border)', padding: '0 4px', minWidth: '150px' }}
                                onBlur={(e) => {
                                    if (template) {
                                        setTemplate({ ...template, name: e.currentTarget.textContent || 'new_template' })
                                    }
                                }}
                            >
                                {template ? template.name : 'new_template'}
                            </span>
                        </h2>
                        <div className="tb-header-subtitle">
                            <span className="tb-badge">{template ? template.category : 'MARKETING'}</span>
                            <span>{template ? 'Saved' : 'Draft'} • {template ? new Date(template.updatedAt).toLocaleTimeString() : 'Just now'}</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="tb-tabs" style={{ marginBottom: 0 }}>
                        <Button
                            className={`tb-tab ${activeTab === 'build' ? 'active' : 'inactive'}`}
                            onClick={() => setActiveTab('build')}
                        >
                            Build
                        </Button>
                        <Button
                            className={`tb-tab ${activeTab === 'preview' ? 'active' : 'inactive'}`}
                            onClick={() => setActiveTab('preview')}
                        >
                            Preview
                        </Button>
                    </div>
                    <Button onClick={handleSave} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Save size={16} />
                        Save Template
                    </Button>
                </div>
            </div>

            <div className="tb-main">
                {/* Left Toolbar (Components) */}
                {activeTab === 'build' && (
                    <div className="tb-sidebar">
                        <h3 className="tb-sidebar-title">Blocks</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {componentsList.map(c => (
                                <div
                                    key={c.type}
                                    className="tb-component-item"
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, c.type)}
                                    style={{ cursor: 'grab' }}
                                >
                                    <div className="tb-component-icon">{c.icon}</div>
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{c.label}</span>
                                </div>
                            ))}
                        </div>

                        <h3 className="tb-sidebar-title" style={{ marginTop: '2rem' }}>Variables</h3>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', backgroundColor: 'hsla(var(--primary-hue), var(--primary-sat), 50%, 0.1)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid hsla(var(--primary-hue), var(--primary-sat), 50%, 0.2)' }}>
                            Use <code style={{ backgroundColor: 'var(--bg-card)', padding: '2px 4px', borderRadius: '4px', color: 'var(--primary)' }}>{'{{1}}'}</code> syntax to inject dynamic content.
                        </div>
                    </div>
                )}

                {/* Center Canvas (Editor) */}
                {activeTab === 'build' && (
                    <div className="tb-canvas" onDragOver={handleDragOver} onDrop={handleDrop}>
                        <div className="tb-canvas-inner">
                            {/* Language Tabs */}
                            <div className="tb-tabs" style={{ marginBottom: '1rem' }}>
                                {template?.translations.map(t => (
                                    <Button
                                        key={t.language}
                                        className={`tb-tab ${currentLang === t.language ? 'active' : 'inactive'}`}
                                        onClick={() => setCurrentLang(t.language)}
                                        style={currentLang === t.language ? { color: 'var(--primary)' } : {}}
                                    >
                                        {t.language}
                                    </Button>
                                ))}
                                <Button className="tb-tab inactive" style={{ borderStyle: 'dashed' }} onClick={addLanguage}>+ Add Language</Button>
                            </div>

                            {/* Editor Surface */}
                            <div className="tb-editor-surface">
                                {activeTranslation?.components.map((comp, idx) => (
                                    <div key={idx} className="tb-block">
                                        <div className="tb-block-delete" onClick={() => removeComponent(idx)}>
                                            <Trash2 size={14} />
                                        </div>
                                        <div className="tb-block-header">
                                            {comp.type === 'HEADER' && <Image size={14} />}
                                            {comp.type === 'BODY' && <Type size={14} />}
                                            {comp.type === 'FOOTER' && <Type size={14} />}
                                            {comp.type === 'BUTTONS' && <Columns size={14} />}
                                            <span>
                                                {comp.type === 'HEADER' && 'Header (Media/Text)'}
                                                {comp.type === 'BODY' && 'Body Text'}
                                                {comp.type === 'FOOTER' && 'Footer Note'}
                                                {comp.type === 'BUTTONS' && `Buttons (${comp.buttons?.length || 0})`}
                                            </span>
                                        </div>
                                        <div className="tb-block-content">
                                            {comp.type === 'HEADER' && (
                                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                    <Select className="tb-input" value={comp.format || 'TEXT'} onChange={(e) => updateComponent(idx, 'format', e.target.value)} style={{ width: '120px' }}>
                                                        <option value="TEXT">Text</option>
                                                        <option value="IMAGE">Image</option>
                                                        <option value="VIDEO">Video</option>
                                                        <option value="DOCUMENT">Document</option>
                                                    </Select>
                                                    {comp.format === 'TEXT' && (
                                                        <Input type="text" value={comp.text || ''} onChange={(e: any) => updateComponent(idx, 'text', e.target.value)} placeholder="Header text..." style={{ flex: 1 }} />
                                                    )}
                                                    {comp.format !== 'TEXT' && (
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                                                            (Media attached when sending)
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {(comp.type === 'BODY' || comp.type === 'FOOTER') && (
                                                <Textarea
                                                    className="tb-textarea"
                                                    rows={comp.type === 'BODY' ? 5 : 2}
                                                    value={comp.text || ''}
                                                    onChange={(e) => updateComponent(idx, 'text', e.target.value)}
                                                    placeholder={`Enter ${comp.type.toLowerCase()} text...`}
                                                    style={{ backgroundColor: 'var(--bg-card)' }}
                                                />
                                            )}
                                            {comp.type === 'BUTTONS' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {comp.buttons && comp.buttons.length > 0 && (
                                                        comp.buttons.map((btn, bidx) => (
                                                            <div key={bidx} className="tb-button-row" style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <Select className="tb-input" style={{ flex: '0 0 auto', width: 'auto' }} value={btn.type} onChange={(e) => updateButton(idx, bidx, 'type', e.target.value)}>
                                                                    <option value="URL">URL Visit</option>
                                                                    <option value="QUICK_REPLY">Quick Reply</option>
                                                                    <option value="PHONE_NUMBER">Call Phone</option>
                                                                </Select>
                                                                <Input type="text" value={btn.text} onChange={(e: any) => updateButton(idx, bidx, 'text', e.target.value)} placeholder={t('templateBuilder.buttonText')} style={{ flex: 1 }} />
                                                                {(btn.type === 'URL' || btn.type === 'PHONE_NUMBER') && (
                                                                    <Input type="text" value={btn.url || btn.payload || ''} onChange={(e: any) => updateButton(idx, bidx, btn.type === 'URL' ? 'url' : 'payload', e.target.value)} placeholder={btn.type === 'URL' ? 'https://' : '+1234567890'} style={{ flex: 1 }} />
                                                                )}
                                                                <Button onClick={() => removeButton(idx, bidx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}><Trash2 size={14} /></Button>
                                                            </div>
                                                        ))
                                                    )}
                                                    <Button onClick={() => addButton(idx)} className="btn" style={{ fontSize: '0.75rem', padding: '4px 8px', alignSelf: 'flex-start' }}>+ Add Button</Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <div className="tb-dropzone">
                                    <Plus size={24} style={{ marginBottom: '0.5rem' }} />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Drag or click to add component</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Right Sandbox (Preview) */}
                <div className={`tb-sandbox ${activeTab === 'preview' ? 'full-width' : ''}`} style={{ display: activeTab === 'build' ? 'none' : 'flex' }}>
                    <div className="tb-sandbox-header" style={{ flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                        <Button onClick={() => setPreviewChannel('webchat')} className={`tb-sandbox-btn ${previewChannel === 'webchat' ? 'active-webchat' : ''}`}>
                            <MonitorSmartphone size={16} /> <span className="hidden sm:inline">WebChat</span>
                        </Button>
                        <Button onClick={() => setPreviewChannel('whatsapp')} className={`tb-sandbox-btn ${previewChannel === 'whatsapp' ? 'active-whatsapp' : ''}`}>
                            <Webhook size={16} /> <span className="hidden sm:inline">{t('templateBuilder.whatsapp')}</span>
                        </Button>
                        <Button onClick={() => setPreviewChannel('line')} className={`tb-sandbox-btn ${previewChannel === 'line' ? 'active-whatsapp' : ''}`} style={previewChannel === 'line' ? { borderColor: '#06C755', color: '#06C755', backgroundColor: '#06C75510' } : {}}>
                            <MessageCircle size={16} /> <span className="hidden sm:inline">LINE</span>
                        </Button>
                        <Button onClick={() => setPreviewChannel('kakao')} className={`tb-sandbox-btn ${previewChannel === 'kakao' ? 'active-email' : ''}`} style={previewChannel === 'kakao' ? { borderColor: '#FEE500', color: '#B29B00', backgroundColor: '#FEE50010' } : {}}>
                            <MessageCircle size={16} /> <span className="hidden sm:inline">Kakao</span>
                        </Button>
                        <Button onClick={() => setPreviewChannel('email')} className={`tb-sandbox-btn ${previewChannel === 'email' ? 'active-email' : ''}`}>
                            <Mail size={16} /> <span className="hidden sm:inline">{t('templateBuilder.email')}</span>
                        </Button>
                    </div>

                    <div className="tb-sandbox-content">
                        {/* Preview Language Selector */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)', width: '100%', maxWidth: '360px', margin: '0 auto 1.5rem auto' }}>
                            {template?.translations.map(t => (
                                <Button
                                    key={t.language}
                                    onClick={() => setCurrentLang(t.language)}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        borderRadius: '16px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        backgroundColor: currentLang === t.language ? 'var(--primary)' : 'var(--bg-card)',
                                        color: currentLang === t.language ? 'white' : 'var(--text-muted)',
                                        boxShadow: currentLang === t.language ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    {t.language}
                                </Button>
                            ))}
                        </div>

                        {/* WebChat Mockup */}
                        {previewChannel === 'webchat' && (
                            <div className="mock-webchat">
                                <div className="mock-webchat-header">
                                    CXMind Online Support
                                    <div className="mock-webchat-status"></div>
                                </div>
                                <div className="mock-webchat-body">
                                    <div className="mock-webchat-time">Today 12:43 PM</div>
                                    <div className="mock-webchat-bubble">
                                        {hasMediaHeader && getMockMedia(template?.name || '', activeTranslation?.components.find(c => c.type === 'HEADER')?.format || 'IMAGE')}
                                        {renderedHeader && <strong>{renderedHeader}<br /><br /></strong>}
                                        <div className="mock-webchat-text" style={{ whiteSpace: 'pre-wrap' }}>{renderedBody}</div>
                                        {renderedFooter && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 8 }}>{renderedFooter}</div>}
                                        <div className="mock-webchat-buttons">
                                            {buttons.map((btn, i) => (
                                                <Button key={i} className="mock-webchat-">{injectVars(btn.text)}</Button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="mock-webchat-footer">
                                    <div className="mock-webchat-input">Reply to bot...</div>
                                </div>
                            </div>
                        )}

                        {/* WhatsApp Mockup */}
                        {previewChannel === 'whatsapp' && (
                            <div className="mock-wa">
                                <div className="mock-wa-header">
                                    <div className="mock-wa-avatar">W</div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ lineHeight: 1.1 }}>CXMind Business</span>
                                        <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 400 }}>Official business account</span>
                                    </div>
                                </div>
                                <div className="mock-wa-body">
                                    <div className="mock-wa-time">TODAY</div>
                                    <div className="mock-wa-e2e">
                                        <svg viewBox="0 0 10 12" width="10" height="12" fill="currentColor"><path d="M5 0C2.24 0 0 2.24 0 5v2.86C0 9.77 1.57 11.2 3.5 11.2h3C8.43 11.2 10 9.77 10 7.86V5c0-2.76-2.24-5-5-5zM3.5 9.7C2.4 9.7 1.5 8.8 1.5 7.7V5c0-1.93 1.57-3.5 3.5-3.5S8.5 3.07 8.5 5v2.7c0 1.1-.9 2-2 2h-3z" /></svg>
                                        Messages and calls are end-to-end encrypted.
                                    </div>
                                    <div className="mock-wa-bubble">
                                        {hasMediaHeader && getMockMedia(template?.name || '', activeTranslation?.components.find(c => c.type === 'HEADER')?.format || 'IMAGE')}
                                        {renderedHeader && <strong>{renderedHeader}<br /><br /></strong>}
                                        <div className="mock-wa-text" style={{ whiteSpace: 'pre-wrap' }}>{renderedBody}</div>
                                        {renderedFooter && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 8 }}>{renderedFooter}</div>}
                                        <div className="mock-wa-msg-meta">12:43 PM</div>
                                        {buttons.length > 0 && (
                                            <div className="mock-wa-buttons">
                                                {buttons.map((btn, i) => (
                                                    <Button key={i} className="mock-wa-">
                                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>
                                                        {injectVars(btn.text)}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="mock-wa-footer">
                                    <div className="mock-wa-fab" style={{ backgroundColor: 'transparent', color: '#54656f' }}>
                                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S7.33 8 6.5 8 5 8.67 5 9.5 5.67 1.5 6.5 1.5zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>
                                    </div>
                                    <div className="mock-wa-input">Message</div>
                                    <div className="mock-wa-fab">
                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM16 13h-3v3h-2v-3H8v-2h3V8h2v3h3v2z" /></svg>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* LINE Mockup */}
                        {previewChannel === 'line' && (
                            <div className="mock-line">
                                <div className="mock-line-header">
                                    <ArrowLeft size={18} /> CXMind Official
                                </div>
                                <div className="mock-line-body">
                                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#666', marginBottom: '1rem' }}>Today</div>
                                    <div className="mock-line-bubble">
                                        {hasMediaHeader && getMockMedia(template?.name || '', activeTranslation?.components.find(c => c.type === 'HEADER')?.format || 'IMAGE')}
                                        {renderedHeader && <strong>{renderedHeader}<br /><br /></strong>}
                                        {renderedBody}
                                        {renderedFooter && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 8 }}>{renderedFooter}</div>}
                                        {buttons.length > 0 && (
                                            <div style={{ marginTop: '0.5rem', borderTop: '1px solid #eee' }}>
                                                {buttons.map((btn, i) => (
                                                    <Button key={i} className="mock-line-">{injectVars(btn.text)}</Button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#666', marginLeft: '0.5rem' }}>12:43 PM</div>
                                </div>
                            </div>
                        )}

                        {/* Kakao Mockup */}
                        {previewChannel === 'kakao' && (
                            <div className="mock-kakao">
                                <div className="mock-kakao-header">
                                    <ArrowLeft size={18} /> CXMind 알림톡
                                </div>
                                <div className="mock-kakao-body">
                                    <div style={{ textAlign: 'center', fontSize: '0.75rem', marginBottom: '1rem', backgroundColor: '#9BB4C9', borderRadius: '12px', padding: '2px 8px', alignSelf: 'center', color: 'white' }}>2026년 2월 23일 월요일</div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 14, backgroundColor: '#fee500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>CX</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#444' }}>CXMind</div>
                                            <div className="mock-kakao-bubble">
                                                {hasMediaHeader && getMockMedia(template?.name || '', activeTranslation?.components.find(c => c.type === 'HEADER')?.format || 'IMAGE')}
                                                {renderedHeader && <strong>{renderedHeader}<br /><br /></strong>}
                                                {renderedBody}
                                                {renderedFooter && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 8 }}>{renderedFooter}</div>}
                                                {buttons.length > 0 && (
                                                    <div style={{ marginTop: '0.5rem' }}>
                                                        {buttons.map((btn, i) => (
                                                            <Button key={i} className="mock-kakao-">{injectVars(btn.text)}</Button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#666', alignSelf: 'flex-end', paddingBottom: '0.5rem' }}>오후 12:43</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Email Mockup */}
                        {previewChannel === 'email' && (
                            <div className="mock-email">
                                <div className="mock-email-header">
                                    <div className="mock-email-dots">
                                        <div className="mock-email-dot red"></div>
                                        <div className="mock-email-dot yellow"></div>
                                        <div className="mock-email-dot green"></div>
                                    </div>
                                    <div className="mock-email-bar">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={14} /> Template Preview</span>
                                    </div>
                                </div>
                                <div className="mock-email-body">
                                    <div className="mock-email-canvas">
                                        {hasMediaHeader && getMockMedia(template?.name || '', activeTranslation?.components.find(c => c.type === 'HEADER')?.format || 'IMAGE')}
                                        {renderedHeader && <h2 style={{ marginTop: 0, color: '#334155' }}>{renderedHeader}</h2>}
                                        <p style={{ whiteSpace: 'pre-wrap', color: '#475569', lineHeight: 1.6 }}>{renderedBody}</p>
                                        {buttons.length > 0 && (
                                            <div style={{ marginTop: '2rem' }}>
                                                {buttons.map((btn, i) => (
                                                    <a key={i} href="#" className="mock-email-btn" style={{ marginBottom: '0.5rem', display: 'inline-block', marginRight: '0.5rem' }}>
                                                        {injectVars(btn.text)}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                        {renderedFooter && (
                                            <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.875rem' }}>
                                                {renderedFooter}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Language Selection Modal */}
            {showLangPrompt && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)'
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '12px',
                        width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                        border: '1px solid var(--glass-border)',
                        animation: 'slideIn 0.2s ease-out'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 600 }}>{t('templateBuilder.selectLanguage')}</h3>
                        <div style={{ marginBottom: '16px', position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
                            <Input
                                type="text"
                                value={searchLangQuery}
                                onChange={(e: any) => {
                                    setSearchLangQuery(e.target.value);
                                    setNewLangCode(e.target.value);
                                }}
                                placeholder="Search languages... (e.g. English, zh_CN)"
                                autoFocus
                                onKeyDown={(e: any) => { if (e.key === 'Enter') confirmAddLanguage() }}
                                style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.9rem', paddingLeft: '36px' }}
                            />
                        </div>
                        <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '24px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'var(--bg-card-dark)' }}>
                            {SUPPORTED_LANGUAGES
                                .filter(l => l.name.toLowerCase().includes(searchLangQuery.toLowerCase()) || l.code.toLowerCase().includes(searchLangQuery.toLowerCase()))
                                .map(lang => (
                                    <Button
                                        key={lang.code}
                                        onClick={() => confirmAddLanguage(lang.code)}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            width: '100%', padding: '10px 16px', textAlign: 'left',
                                            background: 'transparent', border: 'none', borderBottom: '1px solid var(--glass-border)',
                                            color: 'var(--text-primary)', cursor: 'pointer', transition: 'background 0.2s'
                                        }}
                                        className="dropdown-item-hover"
                                    >
                                        <span style={{ fontWeight: 500 }}>{lang.name}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{lang.code}</span>
                                    </Button>
                                ))}
                            {searchLangQuery && !SUPPORTED_LANGUAGES.some(l => l.name.toLowerCase().includes(searchLangQuery.toLowerCase()) || l.code.toLowerCase().includes(searchLangQuery.toLowerCase())) && (
                                <Button
                                    onClick={() => confirmAddLanguage(searchLangQuery)}
                                    style={{
                                        display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                                        background: 'rgba(99, 102, 241, 0.1)', border: 'none', borderBottom: '1px solid var(--glass-border)',
                                        color: 'var(--primary)', cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ fontWeight: 600 }}>Use custom code:</span> "{searchLangQuery}"
                                </Button>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <Button onClick={() => setShowLangPrompt(false)} style={{ backgroundColor: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>{t('templateBuilder.cancel')}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TemplateBuilder;
