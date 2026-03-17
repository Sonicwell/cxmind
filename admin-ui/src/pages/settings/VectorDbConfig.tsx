import { Select } from '../../components/ui/Select';
import React, { useState, useEffect } from 'react';

import { Database, Save, Loader2, Play } from 'lucide-react';
import api from '../../services/api';

import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

interface VectorDbConfig {
    provider: string;
    collection: string;
    url?: string;
    apiKey?: string;
    environment?: string;
}

export const VectorDbConfig: React.FC = () => {
    const { t } = useTranslation();

    const [vectorDb, setVectorDb] = useState<VectorDbConfig>({
        provider: 'system',
        collection: 'knowledge_base'
    });
    const [savingVdb, setSavingVdb] = useState(false);
    const [testingVdb, setTestingVdb] = useState(false);
    const [vdbTestResult, setVdbTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        api.get('/platform/settings')
            .then(res => {
                if (res.data?.data?.vectorDb) {
                    setVectorDb(prev => ({ ...prev, ...res.data.data.vectorDb }));
                }
            })
            .catch(err => console.error('Failed to load Vector DB config:', err));
    }, []);

    const handleSaveVectorDb = async () => {
        setSavingVdb(true);
        try {
            await api.patch('/platform/settings', { vectorDb });
            setMessage({ type: 'success', text: t('vectorDb.saveSuccess') });
        } catch (e) {
            setMessage({ type: 'error', text: t('vectorDb.saveError') });
        } finally {
            setSavingVdb(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleTestConnection = async () => {
        setTestingVdb(true);
        setVdbTestResult(null);
        try {
            const res = await api.post('/platform/settings/vector-db/test', vectorDb);
            setVdbTestResult(res.data);
        } catch (err: any) {
            setVdbTestResult({ ok: false, message: err.response?.data?.message || t('vectorDb.testFailed') });
        } finally {
            setTestingVdb(false);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
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

            <div style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '0.75rem', background: 'hsla(var(--primary-hue, 260), 80%, 55%, 0.1)', borderRadius: 'var(--radius-md)' }}>
                        <Database size={24} color="var(--primary)" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {t('vectorDb.title')}
                            {vdbTestResult && (
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontWeight: 600, background: vdbTestResult.ok ? 'hsla(150,60%,45%,0.12)' : 'hsla(0,60%,50%,0.12)', color: vdbTestResult.ok ? 'hsl(150,60%,30%)' : 'hsl(0,60%,40%)' }}>
                                    {vdbTestResult.ok ? t('vectorDb.connected') : t('vectorDb.connectedError', { message: vdbTestResult.message })}
                                </span>
                            )}
                        </h2>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {t('vectorDb.description')}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem' }}>
                    <div className="form-group">
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('vectorDb.providerLabel')}</label>
                        <Select
                            className="input"
                            value={vectorDb.provider}
                            onChange={e => { setVectorDb({ ...vectorDb, provider: e.target.value }); setVdbTestResult(null); }}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-base)', color: 'var(--text)' }}
                        >
                            <option value="system">{t('vectorDb.providerSystem')}</option>
                            <option value="qdrant">{t('vectorDb.providerQdrant')}</option>
                            <option value="pinecone">{t('vectorDb.providerPinecone')}</option>
                            <option value="weaviate">{t('vectorDb.providerWeaviate')}</option>
                        </Select>
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('vectorDb.collectionLabel')}</label>
                        <input
                            className="input"
                            value={vectorDb.collection}
                            onChange={e => setVectorDb({ ...vectorDb, collection: e.target.value })}
                            disabled={vectorDb.provider === 'system'}
                            placeholder={t('vectorDb.collectionPlaceholder')}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-base)', color: 'var(--text)', opacity: vectorDb.provider === 'system' ? 0.6 : 1 }}
                        />
                    </div>

                    {vectorDb.provider !== 'system' && (
                        <>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('vectorDb.urlLabel')}</label>
                                <input
                                    className="input"
                                    type="url"
                                    value={vectorDb.url || ''}
                                    onChange={e => setVectorDb({ ...vectorDb, url: e.target.value })}
                                    placeholder={vectorDb.provider === 'pinecone' ? 'https://xxx.svc.pinecone.io' : vectorDb.provider === 'weaviate' ? 'https://xxx.weaviate.network' : 'https://your-cluster.cloud.qdrant.io:6333'}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-base)', color: 'var(--text)' }}
                                />
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('vectorDb.apiKeyLabel')}</label>
                                <input
                                    className="input"
                                    type="password"
                                    value={vectorDb.apiKey || ''}
                                    onChange={e => setVectorDb({ ...vectorDb, apiKey: e.target.value })}
                                    placeholder={t('vectorDb.apiKeyPlaceholder')}
                                    autoComplete="new-password"
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-base)', color: 'var(--text)' }}
                                />
                            </div>

                            {vectorDb.provider === 'pinecone' && (
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('vectorDb.envLabel')}</label>
                                    <input
                                        className="input"
                                        value={vectorDb.environment || ''}
                                        onChange={e => setVectorDb({ ...vectorDb, environment: e.target.value })}
                                        placeholder={t('vectorDb.envPlaceholder')}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-base)', color: 'var(--text)' }}
                                    />
                                </div>
                            )}

                            {(vectorDb.provider === 'pinecone' || vectorDb.provider === 'weaviate') && (
                                <div style={{ gridColumn: '1 / -1', padding: '0.75rem', background: 'hsla(40, 100%, 50%, 0.1)', border: '1px solid hsla(40, 100%, 50%, 0.3)', borderRadius: 'var(--radius-sm)', color: 'hsla(40, 100%, 30%, 1)', fontSize: '0.85rem' }}>
                                    {t('vectorDb.sdkWarning', { provider: vectorDb.provider === 'pinecone' ? 'Pinecone' : 'Weaviate' })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
                    {vectorDb.provider !== 'system' && (
                        <Button className="-outline"
                            onClick={handleTestConnection}
                            disabled={testingVdb || !vectorDb.url}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem' }}
                        >
                            {testingVdb ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            {t('vectorDb.testConnBtn')}
                        </Button>
                    )}
                    <Button
                        onClick={handleSaveVectorDb}
                        disabled={savingVdb}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem' }}
                    >
                        {savingVdb ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {t('vectorDb.saveBtn')}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default VectorDbConfig;
