import React, { useState, useEffect } from 'react';
import { Copy, Key, Server, UploadCloud, RefreshCw, KeyRound, Download, AlertCircle, ShieldCheck } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';
import { copyToClipboard } from '../../utils/clipboard';

interface LicenseStatus {
    plan: string;
    maxSeats: number;
    burstAllowed: number;
    features: string[];
    modules: string[];
    expiresAt: string | null;
    activatedAt?: string;
    isGracePeriod: boolean;
    activeChannels?: number;
}

const LicenseSettings: React.FC = () => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<LicenseStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [fingerprint, setFingerprint] = useState('');
    const [licenseKey, setLicenseKey] = useState('');
    const [offlineCert, setOfflineCert] = useState('');
    const [activeTab, setActiveTab] = useState<'status' | 'activate'>('status');
    const [activating, setActivating] = useState(false);

    useEffect(() => {
        fetchStatus();
        fetchFingerprint();
    }, []);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const res = await api.get('/license/status');
            setStatus(res.data);
        } catch (error) {
            toast.error(t('licenseSettings.toast.loadFailed', 'Failed to load license status'));
        } finally {
            setLoading(false);
        }
    };

    const fetchFingerprint = async () => {
        try {
            const res = await api.get('/license/fingerprint');
            setFingerprint(JSON.stringify(res.data, null, 2));
        } catch (error) {
            toast.error(t('licenseSettings.toast.fingerprintFailed', 'Failed to generate machine fingerprint'));
        }
    };

    const handleCopyFingerprint = () => {
        copyToClipboard(fingerprint);
        toast.success(t('licenseSettings.toast.fingerprintCopied', 'Machine fingerprint copied to clipboard'));
    };

    const handleDownloadFingerprint = () => {
        const blob = new Blob([fingerprint], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `machine-fingerprint-${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleOnlineActivate = async () => {
        if (!licenseKey.trim()) {
            toast.error(t('licenseSettings.toast.enterKey', 'Please enter a license key'));
            return;
        }
        try {
            setActivating(true);
            await api.post('/license/activate', { licenseKey: licenseKey.trim() });
            toast.success(t('licenseSettings.toast.activated', 'License activated successfully'));
            setLicenseKey('');
            fetchStatus();
            setActiveTab('status');
        } catch (error: any) {
            const errMessage = error.response?.data?.error || t('licenseSettings.toast.activationFailed', 'Activation failed');
            toast.error(errMessage === 'error_license_network' ? t('error_license_network') : errMessage);
        } finally {
            setActivating(false);
        }
    };

    const handleOfflineActivate = async () => {
        if (!offlineCert.trim()) {
            toast.error(t('licenseSettings.toast.enterCert', 'Please paste the offline certificate data'));
            return;
        }
        try {
            setActivating(true);
            await api.post('/license/import', { certData: offlineCert.trim() });
            toast.success(t('licenseSettings.toast.certImported', 'Offline certificate imported successfully'));
            setOfflineCert('');
            fetchStatus();
            setActiveTab('status');
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('licenseSettings.toast.certFailed', 'Failed to import certificate'));
        } finally {
            setActivating(false);
        }
    };

    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return t('licenseSettings.neverLifetime', 'Never / Lifetime');
        return new Date(dateStr).toLocaleString();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <RefreshCw className="animate-spin text-primary opacity-50 w-8 h-8" />
            </div>
        );
    }

    const isFree = status?.plan === 'free';
    const totalAllowed = (status?.maxSeats || 5) + (status?.burstAllowed || 0);

    return (
        <div className="settings-page max-w-5xl mx-auto p-6 space-y-8">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold mb-2">{t('licenseSettings.title', 'License & Entitlements')}</h1>
                    <p className="text-gray-500">{t('licenseSettings.subtitle', 'Manage your system seat capacity, hardware bindings, and burst policies.')}</p>
                </div>
            </div>

            <div className="flex gap-4 mb-6">
                <Button
                    onClick={() => setActiveTab('status')}
                    style={{
                        padding: '8px 20px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid ' + (activeTab === 'status' ? 'var(--primary)' : 'var(--glass-border)'),
                        background: activeTab === 'status' ? 'rgba(108,75,245,0.08)' : 'transparent',
                        color: activeTab === 'status' ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: activeTab === 'status' ? 600 : 400,
                        cursor: 'pointer', fontSize: '0.88rem',
                        transition: 'all 0.15s ease',
                    }}
                >
                    {t('licenseSettings.tabStatus', 'Subscription Status')}
                </Button>
                <Button
                    onClick={() => setActiveTab('activate')}
                    style={{
                        padding: '8px 20px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid ' + (activeTab === 'activate' ? 'var(--primary)' : 'var(--glass-border)'),
                        background: activeTab === 'activate' ? 'rgba(108,75,245,0.08)' : 'transparent',
                        color: activeTab === 'activate' ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: activeTab === 'activate' ? 600 : 400,
                        cursor: 'pointer', fontSize: '0.88rem',
                        transition: 'all 0.15s ease',
                    }}
                >
                    {t('licenseSettings.tabActivate', 'Activation & Licensing')}
                </Button>
            </div>

            {activeTab === 'status' && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.5rem' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                {isFree ? <AlertCircle size={24} className="text-amber-500" /> : <ShieldCheck size={24} className="text-emerald-500" />}
                                {t('licenseSettings.currentPlan', 'Current License Plan:')} <span className="uppercase text-primary ml-1">{status?.plan}</span>
                            </h2>
                            <div className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
                                {t('licenseSettings.planDescription', 'Manage your system seat entitlements and module access.')}
                            </div>
                        </div>
                        {isFree && (
                            <Button onClick={() => window.open('https://billing.sonicwell.com', '_blank')}>
                                {t('licenseSettings.upgradePlan', 'Upgrade Plan')}
                            </Button>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('licenseSettings.coreSeats', 'Core Seats (Base Plan)')}</p>
                            <p className="text-2xl font-semibold">{status?.maxSeats || 5}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('licenseSettings.burstSeats', 'Burst Grace Seats (30 Days)')}</p>
                            <p className="text-xl font-semibold">{status?.burstAllowed || 5}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{t('licenseSettings.burstSeatsDesc', 'Extra seats can be dynamically generated up to this limit but will expire 30 days after creation.')}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('licenseSettings.totalCapacity', 'Total Maximum Capacity')}</p>
                            <p className="text-2xl font-semibold text-primary">{totalAllowed}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('licenseSettings.expirationDate', 'Expiration Date')}</p>
                            <p className="text-lg font-medium">{formatDate(status?.expiresAt)}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>{t('licenseSettings.activatedAt', 'Activated At')}</p>
                            <p style={{ color: 'var(--text)' }}>{formatDate(status?.activatedAt)}</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'activate' && (
                <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>

                    {/* Online Activation */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <KeyRound size={24} className="text-primary" />
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('licenseSettings.onlineActivation', 'Online Activation')}</h2>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
                            {t('licenseSettings.onlineDesc', 'Activate using a License Key provided by the vendor. This server requires internet access to connect to the sonicwell.com licensing server.')}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('licenseSettings.licenseKey', 'License Key')}</label>
                                <input
                                    className="input"
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }}
                                    placeholder={t('licenseSettings.placeholder.key', 'SK-XXXXX-XXXXX')}
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value)}
                                />
                            </div>
                            <Button className="- w-full"
                                onClick={handleOnlineActivate}
                                disabled={activating || !licenseKey.trim()}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                {activating ? <RefreshCw className="animate-spin w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
                                {t('licenseSettings.btn.onlineActivate', 'Activate via Internet')}
                            </Button>
                        </div>
                    </div>

                    {/* Offline Activation */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <Server size={24} className="text-amber-500" />
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('licenseSettings.offlineActivation', 'Offline Air-Gapped Activation')}</h2>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
                            {t('licenseSettings.offlineDesc', 'For environments without internet access. Export the machine fingerprint to generate a certificate payload out-of-band.')}
                        </div>

                        <div className="space-y-6">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('licenseSettings.fingerprintPayload', 'Machine Fingerprint Payload')}</label>
                                    <div className="flex gap-2">
                                        <Button className="-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={handleCopyFingerprint}>
                                            <Copy className="w-3 h-3" /> {t('licenseSettings.btn.copy', 'Copy')}
                                        </Button>
                                        <Button className="-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={handleDownloadFingerprint}>
                                            <Download className="w-3 h-3" /> {t('licenseSettings.btn.downloadJson', 'Download .json')}
                                        </Button>
                                    </div>
                                </div>
                                <pre style={{ fontSize: '0.75rem', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', overflowY: 'auto', maxHeight: '120px', color: 'var(--text-secondary)', userSelect: 'all' }}>
                                    {fingerprint}
                                </pre>
                            </div>

                            <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('licenseSettings.importSignedCert', 'Import Signed Certificate (.json payload)')}</label>
                                <input
                                    className="input"
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', marginBottom: '1rem' }}
                                    placeholder={t('licenseSettings.placeholder.cert', 'eyJhbGciOiJFZERTQS... or raw JSON string')}
                                    value={offlineCert}
                                    onChange={(e) => setOfflineCert(e.target.value)}
                                />
                                <Button className="- w-full"
                                    onClick={handleOfflineActivate}
                                    disabled={activating || !offlineCert.trim()}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                    variant="secondary">
                                    {activating ? <RefreshCw className="animate-spin w-4 h-4" /> : <Key className="w-4 h-4" />}
                                    {t('licenseSettings.btn.offlineActivate', 'Import & Activate')}
                                </Button>
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default LicenseSettings;
