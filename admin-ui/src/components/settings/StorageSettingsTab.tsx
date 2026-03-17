import { Input } from "../ui/input";
import { Button } from '../ui/button';
import { Checkbox } from '../ui/Checkbox';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import {
    Database, Plus, Edit3, Trash2, CheckCircle, Info, Loader2,
    Zap, Save,
} from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { RecordingUploadPanel } from './RecordingUploadPanel';

// ── Types ──

type StorageProviderType = 's3' | 'azure' | 'gcs' | 'oss' | 'local';

interface IStorageVendorConfig {
    id: string;
    provider: StorageProviderType;
    name: string;
    endpoint?: string;
    region?: string;
    bucketName?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle?: boolean;
    connectionString?: string;
    containerName?: string;
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
    ossRegion?: string;
    ossBucket?: string;
    ossAccessKeyId?: string;
    ossAccessKeySecret?: string;
    isBuiltIn?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const EMPTY_VENDOR: Partial<IStorageVendorConfig> = {
    provider: 's3', name: '', bucketName: '', region: '', accessKey: '', secretKey: '', endpoint: '', forcePathStyle: false,
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--glass-border)', fontSize: '0.9rem',
    background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600,
    marginBottom: '0.25rem', color: 'var(--text-secondary)',
};

export const StorageSettingsTab: React.FC = () => {
    const { t } = useTranslation();
    const [vendors, setVendors] = useState<IStorageVendorConfig[]>([]);
    const [activeVendorId, setActiveVendorId] = useState('local-default');
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<IStorageVendorConfig>>(EMPTY_VENDOR);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
    const [testing, setTesting] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const fetchVendors = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/platform/storage-vendors');
            if (res.data?.data) {
                setVendors(res.data.data.vendors || []);
                setActiveVendorId(res.data.data.activeVendorId || 'local-default');
            }
        } catch (err) {
            console.warn('Failed to fetch storage vendors (mock mode or offline)', err);
            // Default to empty/default state in case of mock mode failure
            setVendors([]);
            setActiveVendorId('local-default');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchVendors(); }, [fetchVendors]);

    const handleSave = async () => {
        try {
            setSaving(true);
            if (editingId) {
                await api.put(`/platform/storage-vendors/${editingId}`, form);
            } else {
                await api.post('/platform/storage-vendors', form);
            }
            setShowForm(false);
            setEditingId(null);
            setForm(EMPTY_VENDOR);
            setTestResult(null);
            await fetchVendors();
        } catch (err) {
            console.error('Save failed', err);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (vendor: IStorageVendorConfig) => {
        setEditingId(vendor.id);
        setForm({
            provider: vendor.provider,
            name: vendor.name,
            endpoint: vendor.endpoint || '',
            region: vendor.region || '',
            bucketName: vendor.bucketName || '',
            accessKey: '',
            secretKey: '',
            forcePathStyle: vendor.forcePathStyle || false,
            connectionString: '',
            containerName: vendor.containerName || '',
            projectId: vendor.projectId || '',
            clientEmail: vendor.clientEmail || '',
            privateKey: '',
            ossRegion: vendor.ossRegion || '',
            ossBucket: vendor.ossBucket || '',
            ossAccessKeyId: '',
            ossAccessKeySecret: '',
        });
        setShowForm(true);
        setTestResult(null);
    };

    const handleTest = async () => {
        try {
            setTesting(true);
            setTestResult(null);
            const res = await api.post('/platform/storage-vendors/test', form);
            setTestResult(res.data.data);
        } catch (err: any) {
            setTestResult({ success: false, error: err.response?.data?.error || err.message });
        } finally {
            setTesting(false);
        }
    };

    const handleActivate = async (vendorId: string) => {
        try {
            await api.post(`/platform/storage-vendors/${vendorId}/activate`);
            await fetchVendors();
        } catch (err) {
            console.error('Activate failed', err);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await api.delete(`/platform/storage-vendors/${deleteId}`);
            setDeleteId(null);
            await fetchVendors();
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    return (
        <>
            {/* ─── Data Storage Providers ─── */}
            <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Database size={20} color="var(--primary)" />
                        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{t('settingsPage.storage.title')}</h3>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '0.2rem 0.6rem', borderRadius: '1rem', border: '1px solid var(--glass-border)' }}>
                            {t('settingsPage.storage.configured', { count: vendors.length })}
                        </span>
                    </div>
                    <Button

                        onClick={() => {
                            setEditingId(null);
                            setForm(EMPTY_VENDOR);
                            setShowForm(!showForm);
                            setTestResult(null);
                        }}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    >
                        <Plus size={16} />
                        {t('settingsPage.storage.addProvider')}
                    </Button>
                </div>

                {/* Add/Edit Form */}
                {showForm && (
                    <div style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary)', background: 'hsla(210, 100%, 97%, 1)', marginBottom: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>{editingId ? t('settingsPage.storage.editTitle') : t('settingsPage.storage.newTitle')}</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                                <label style={labelStyle}>{t('settingsPage.storage.type')}</label>
                                <Select
                                    value={form.provider}
                                    onChange={e => setForm({ ...form, provider: e.target.value as StorageProviderType })}
                                    style={{ ...inputStyle }}
                                    disabled={!!editingId && form.provider === 'local'}
                                >
                                    <option value="s3">{t('settingsPage.storage.s3Compatible')}</option>
                                    <option value="azure">{t('settingsPage.storage.azureBlob')}</option>
                                    <option value="gcs">{t('settingsPage.storage.googleCloud')}</option>
                                    <option value="oss">{t('settingsPage.storage.aliyunOss')}</option>
                                    {(!editingId || form.provider === 'local') && <option value="local">{t('settingsPage.storage.localStorage')}</option>}
                                </Select>
                            </div>
                            <div>
                                <label style={labelStyle}>{t('settingsPage.storage.displayName')}</label>
                                <Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. MinIO Primary" style={inputStyle} />
                            </div>

                            {/* S3 Fields */}
                            {form.provider === 's3' && (
                                <>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.endpointUrl')}</label><Input value={form.endpoint || ''} onChange={e => setForm({ ...form, endpoint: e.target.value })} placeholder="https://s3.amazonaws.com" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.region')}</label><Input value={form.region || ''} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="us-east-1" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.bucketName')}</label><Input value={form.bucketName || ''} onChange={e => setForm({ ...form, bucketName: e.target.value })} placeholder="my-bucket" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.accessKey')}</label><Input value={form.accessKey || ''} onChange={e => setForm({ ...form, accessKey: e.target.value })} placeholder="AKI..." style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.secretKey')}</label><Input type="password" value={form.secretKey || ''} onChange={e => setForm({ ...form, secretKey: e.target.value })} placeholder="Secret..." autoComplete="new-password" style={inputStyle} /></div>
                                    <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
                                        <Checkbox id="forcePathStyle" checked={!!form.forcePathStyle} onChange={e => setForm({ ...form, forcePathStyle: e.target.checked })} />
                                        <label htmlFor="forcePathStyle" style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>{t('settingsPage.storage.forcePathStyle')}</label>
                                    </div>
                                </>
                            )}
                            {/* Azure Fields */}
                            {form.provider === 'azure' && (
                                <>
                                    <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>{t('settingsPage.storage.connectionString')}</label><Input value={form.connectionString || ''} onChange={e => setForm({ ...form, connectionString: e.target.value })} placeholder="DefaultEndpointsProtocol=https;AccountName=..." style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.containerName')}</label><Input value={form.containerName || ''} onChange={e => setForm({ ...form, containerName: e.target.value })} placeholder="my-container" style={inputStyle} /></div>
                                </>
                            )}
                            {/* GCS Fields */}
                            {form.provider === 'gcs' && (
                                <>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.projectId')}</label><Input value={form.projectId || ''} onChange={e => setForm({ ...form, projectId: e.target.value })} placeholder="my-gcp-project" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.bucketName')}</label><Input value={form.bucketName || ''} onChange={e => setForm({ ...form, bucketName: e.target.value })} placeholder="my-bucket" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.clientEmail')}</label><Input value={form.clientEmail || ''} onChange={e => setForm({ ...form, clientEmail: e.target.value })} placeholder="sa@project.iam.gserviceaccount.com" style={inputStyle} /></div>
                                    <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>{t('settingsPage.storage.privateKey')}</label><Textarea rows={3} value={form.privateKey || ''} onChange={e => setForm({ ...form, privateKey: e.target.value })} placeholder="-----BEGIN PRIVATE KEY-----..." style={{ ...inputStyle, fontFamily: 'monospace' }} /></div>
                                </>
                            )}
                            {/* OSS Fields */}
                            {form.provider === 'oss' && (
                                <>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.ossRegion')}</label><Input value={form.ossRegion || ''} onChange={e => setForm({ ...form, ossRegion: e.target.value })} placeholder="oss-cn-hangzhou" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.ossBucket')}</label><Input value={form.ossBucket || ''} onChange={e => setForm({ ...form, ossBucket: e.target.value })} placeholder="my-bucket" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.ossAccessKeyId')}</label><Input value={form.ossAccessKeyId || ''} onChange={e => setForm({ ...form, ossAccessKeyId: e.target.value })} placeholder="LTAI..." style={inputStyle} /></div>
                                    <div><label style={labelStyle}>{t('settingsPage.storage.ossAccessKeySecret')}</label><Input type="password" value={form.ossAccessKeySecret || ''} onChange={e => setForm({ ...form, ossAccessKeySecret: e.target.value })} placeholder="Secret..." autoComplete="new-password" style={inputStyle} /></div>
                                </>
                            )}
                        </div>

                        {testResult && (
                            <div style={{
                                marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-card)',
                                border: `1px solid ${testResult.success ? 'hsl(150, 60%, 40%)' : 'hsl(0, 60%, 40%)'}`,
                                display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                                color: testResult.success ? 'hsl(150, 60%, 30%)' : 'hsl(0, 60%, 40%)',
                            }}>
                                {testResult.success ? <CheckCircle size={16} /> : <Info size={16} />}
                                <span>{testResult.success ? t('settingsPage.storage.testPassed', { latencyMs: testResult.latencyMs }) : t('settingsPage.storage.testFailed', { error: testResult.error })}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                            <Button variant="secondary" disabled={testing || saving} onClick={() => setShowForm(false)}>{t('settingsPage.storage.cancel')}</Button>
                            {form.provider !== 'local' && (
                                <Button variant="secondary" onClick={handleTest} disabled={testing || saving}>
                                    {testing ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
                                    {t('settingsPage.storage.testConnection')}
                                </Button>
                            )}
                            <Button onClick={handleSave} disabled={testing || saving}>
                                {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                                {t('settingsPage.storage.saveProvider')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Vendor List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {vendors.map(vendor => {
                        const isActive = vendor.id === activeVendorId;
                        return (
                            <div key={vendor.id} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '1rem 1.25rem', background: 'var(--bg-panel)',
                                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--glass-border)'}`,
                                borderRadius: 'var(--radius-md)',
                                boxShadow: isActive ? '0 0 0 1px var(--primary)' : 'var(--shadow-sm)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
                                        border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Database size={20} color={vendor.provider === 'local' ? 'var(--text-secondary)' : 'var(--primary)'} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{vendor.name}</h4>
                                            {isActive && (
                                                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'hsl(150, 60%, 15%)', color: 'hsl(150, 60%, 60%)', border: '1px solid hsl(150, 60%, 25%)' }}>
                                                    {t('settingsPage.storage.active')}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                            {vendor.provider.toUpperCase()} {vendor.region ? `• ${vendor.region}` : ''} {vendor.endpoint ? `• ${vendor.endpoint}` : ''} {vendor.provider === 'local' ? `• ${t('settingsPage.storage.localFileSystem')}` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {!isActive && vendor.provider !== 'local' && (
                                        <Button variant="secondary" onClick={() => handleActivate(vendor.id)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                                            <CheckCircle size={14} /> {t('settingsPage.storage.activate')}
                                        </Button>
                                    )}
                                    <Button variant="secondary" size="icon" onClick={() => handleEdit(vendor)} title="Edit"><Edit3 size={14} /></Button>
                                    <Button variant="destructive" size="icon" onClick={() => setDeleteId(vendor.id)} title="Delete" disabled={isActive || vendor.isBuiltIn}><Trash2 size={14} /></Button>
                                </div>
                            </div>
                        );
                    })}
                    {vendors.length === 0 && !loading && (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--glass-border)' }}>
                            {t('settingsPage.storage.noProviders')}
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                open={!!deleteId}
                title={t('settingsPage.confirm.deleteStorageTitle')}
                description={t('settingsPage.confirm.deleteStorageDesc')}
                onConfirm={handleDelete}
                onClose={() => setDeleteId(null)}
                confirmText={t('settingsPage.confirm.deleteStorageConfirm')}
                cancelText={t('settingsPage.storage.cancel')}
            />

            {/* ─── Recording Upload Status ─── */}
            <RecordingUploadPanel />
        </>
    );
};
