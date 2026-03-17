import { Select } from '../../components/ui/Select';
import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Send, Layout, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import '../../styles/templates.css';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { GlassModal } from '../../components/ui/GlassModal';
import { Input } from '../../components/ui/input';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

interface TemplateDef {
    _id: string;
    name: string;
    category: string;
    translations: any[];
    updatedAt: string;
}

export const OmnichannelTemplates: React.FC = () => {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<TemplateDef[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [sendTestId, setSendTestId] = useState<string | null>(null);
    const [sendChannel, setSendChannel] = useState('webchat');
    const [sendRecipient, setSendRecipient] = useState('');
    const [sendLoading, setSendLoading] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            // Fallback for demo if API route doesn't exist yet
            const res = await api.get('/templates').catch(() => ({
                data: []
            }));
            const data = res.data;
            const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.data?.data) ? data.data.data : []));
            setTemplates(arr);
        } catch (err) {
            console.warn("Failed to fetch templates", err);
        } finally {
            setLoading(false);
        }
    };

    const handlePreview = (id: string) => {
        navigate(`/templates/builder?id=${id}&mode=preview`);
    };

    const handleEdit = (id: string) => {
        navigate(`/templates/builder?id=${id}`);
    };

    const handleSendTest = (id: string) => {
        setSendTestId(id);
    };

    const submitSendTest = async () => {
        if (!sendTestId || !sendRecipient) {
            alert(t('omnichannelTemplates.requireRecipient'));
            return;
        }

        try {
            setSendLoading(true);
            const res = await api.post(`/templates/${sendTestId}/send`, {
                channel: sendChannel,
                recipient: sendRecipient,
                language: 'en_US', // Defaulting to English for demo test
                variables: {
                    '1': 'Test User',
                    '2': 'Demo Variable',
                    '3': '12345'
                }
            });
            alert(t('omnichannelTemplates.testSent') + JSON.stringify(res.data.rendered_payload, null, 2));
            setSendTestId(null);
            setSendRecipient('');
        } catch (err) {
            console.error('Failed to send test', err);
            alert(t('omnichannelTemplates.testFailed'));
        } finally {
            setSendLoading(false);
        }
    };

    const handleDelete = (id: string) => {
        setDeleteId(id);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await api.delete(`/templates/${deleteId}`);
            setTemplates(templates.filter(t => t._id !== deleteId));
            setDeleteId(null);
        } catch (err) {
            console.error('Failed to delete template', err);
            alert(t('omnichannelTemplates.deleteFailed'));
        }
    };

    return (
        <div className="tpl-page">
            <div className="tpl-header-row">
                <div>
                    <h1 className="tpl-page-title">
                        {t('omnichannelTemplates.title')}
                    </h1>
                    <p className="tpl-page-desc">
                        {t('omnichannelTemplates.description')}
                    </p>
                </div>
                <Button
                    onClick={() => navigate('/templates/builder')}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <Plus size={18} />
                    {t('omnichannelTemplates.createTemplateBtn')}
                </Button>
            </div>

            <div className="tpl-grid">
                {loading ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>{t('omnichannelTemplates.loadingTemplates')}</div>
                ) : templates.length === 0 ? (
                    <div className="tpl-empty-state">
                        <div style={{ textAlign: 'center' }}>
                            <div className="tpl-empty-icon-wrap">
                                <Layout size={32} />
                            </div>
                            <h3 className="tpl-empty-title">{t('omnichannelTemplates.noTemplates')}</h3>
                            <p className="tpl-empty-desc">
                                {t('omnichannelTemplates.createFirstDesc')}
                            </p>
                            <Button
                                onClick={() => navigate('/templates/builder')}
                                className="btn"
                                style={{ backgroundColor: 'hsla(var(--primary-hue), var(--primary-sat), 50%, 0.1)', color: 'var(--primary)', borderColor: 'transparent' }}
                            >
                                {t('omnichannelTemplates.createFirstBtn')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    templates.map(tData => (
                        <div key={tData._id} className="tpl-card">
                            <div>
                                <div className="tpl-card-top">
                                    <span className="tb-badge">
                                        {tData.category}
                                    </span>
                                    <span className="tpl-card-date">
                                        {new Date(tData.updatedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 className="tpl-card-name">{tData.name}</h3>
                                <p className="tpl-card-meta">
                                    {t('omnichannelTemplates.supportsLanguages', { count: tData.translations.length })}
                                </p>
                            </div>

                            <div className="tpl-card-actions">
                                <Button className="tpl- edit" title={t('omnichannelTemplates.previewTemplate')} onClick={() => handlePreview(tData._id)}>
                                    <Eye size={16} />
                                </Button>
                                <Button className="tpl- edit" title={t('omnichannelTemplates.editTemplate')} onClick={() => handleEdit(tData._id)}>
                                    <Edit2 size={16} />
                                </Button>
                                <Button className="tpl- send" title={t('omnichannelTemplates.sendTest')} onClick={() => handleSendTest(tData._id)}>
                                    <Send size={16} />
                                </Button>
                                <Button className="tpl- delete" title={t('omnichannelTemplates.deleteTemplate')} onClick={() => handleDelete(tData._id)}>
                                    <Trash2 size={16} />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <ConfirmModal
                open={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={confirmDelete}
                title={t('omnichannelTemplates.deleteModalTitle')}
                description={t('omnichannelTemplates.deleteModalDesc')}
                confirmText={t('omnichannelTemplates.confirmDeleteBtn')}
                cancelText={t('common.cancel')}
                isDanger={true}
            />

            <GlassModal
                open={!!sendTestId}
                onOpenChange={(v) => { if (!v) setSendTestId(null); }}
                title={t('omnichannelTemplates.sendTestTitle')}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>{t('omnichannelTemplates.channelLabel')}</label>
                        <Select
                            className="tb-input"
                            style={{ width: '100%' }}
                            value={sendChannel}
                            onChange={e => setSendChannel(e.target.value)}
                        >
                            <option value="webchat">{t('omnichannelTemplates.channelWebChat')}</option>
                            <option value="email">{t('omnichannelTemplates.channelEmail')}</option>
                            <option value="whatsapp">{t('omnichannelTemplates.channelWhatsApp')}</option>
                            <option value="line">{t('omnichannelTemplates.channelLine')}</option>
                            <option value="kakao">{t('omnichannelTemplates.channelKakao')}</option>
                        </Select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>{t('omnichannelTemplates.recipientLabel')}</label>
                        <Input
                            type="text"
                            style={{ width: '100%' }}
                            placeholder={t('omnichannelTemplates.recipientPlaceholder')}
                            value={sendRecipient}
                            onChange={(e: any) => setSendRecipient(e.target.value)}
                        />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {t('omnichannelTemplates.mockVariablesWarning')}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                    <Button onClick={() => setSendTestId(null)} style={{ padding: '0.5rem 1rem' }}>{t('common.cancel')}</Button>
                    <Button
                        onClick={submitSendTest}
                        disabled={sendLoading || !sendRecipient}
                        style={{ padding: '0.5rem 1rem' }}
                    >
                        {sendLoading ? t('omnichannelTemplates.dispatchingBtn') : t('omnichannelTemplates.sendTestBtn')}
                    </Button>
                </div>
            </GlassModal>
        </div>
    );
};

export default OmnichannelTemplates;
