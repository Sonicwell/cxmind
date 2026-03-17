import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Button } from '../ui/button';
import {
    Upload, RefreshCw, CheckCircle, AlertTriangle, Clock, XCircle,
    ArrowUpCircle, Loader2, Pause,
} from 'lucide-react';

interface RecordingUploadStatus {
    enabled: boolean;
    queueLength: number;
    stats: Record<string, number>;
    recent: Array<{
        callId: string;
        localPath: string;
        cloudUri: string;
        status: string;
        attempts: number;
        lastError?: string;
        fileSize: number;
        realm: string;
        uploadedAt?: string;
        updatedAt: string;
    }>;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
    queued: <Clock size={14} color="var(--warning)" />,
    uploading: <Loader2 size={14} color="var(--primary)" className="spin" />,
    uploaded: <CheckCircle size={14} color="var(--success)" />,
    failed: <XCircle size={14} color="var(--danger)" />,
};

const STATUS_COLORS: Record<string, string> = {
    queued: 'var(--warning)',
    uploading: 'var(--primary)',
    uploaded: 'var(--success)',
    failed: 'var(--danger)',
};

function formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const sec = diff / 1000;
    if (sec < 60) return `${Math.floor(sec)}s ago`;
    const min = sec / 60;
    if (min < 60) return `${Math.floor(min)}m ago`;
    const hr = min / 60;
    if (hr < 24) return `${Math.floor(hr)}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}

export const RecordingUploadPanel: React.FC = () => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<RecordingUploadStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [retrying, setRetrying] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/platform/recording-uploads/status');
            setStatus(res.data.data);
        } catch (err) {
            console.error('Failed to fetch recording upload status', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const timer = setInterval(fetchStatus, 30000); // Auto-refresh every 30s
        return () => clearInterval(timer);
    }, [fetchStatus]);

    const handleRetry = async (callId: string) => {
        try {
            setRetrying(callId);
            await api.post(`/platform/recording-uploads/${callId}/retry`);
            await fetchStatus();
        } catch (err) {
            console.error('Retry failed', err);
        } finally {
            setRetrying(null);
        }
    };

    if (!status) return null;

    const totalUploaded = status?.stats?.['uploaded'] || 0;
    const totalFailed = status?.stats?.['failed'] || 0;
    const totalQueued = (status?.stats?.['queued'] || 0) + (status?.stats?.['uploading'] || 0);

    return (
        <div style={{ margin: '2.5rem 0 0', borderTop: '1px solid var(--glass-border)', paddingTop: '2rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ArrowUpCircle size={20} color="var(--primary)" />
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{t('settingsPage.recordingUpload.title')}</h3>
                    {!status.enabled && (
                        <span style={{
                            fontSize: '0.75rem', color: 'var(--text-tertiary)',
                            background: 'var(--bg-card)', padding: '0.15rem 0.5rem',
                            borderRadius: '1rem', border: '1px solid var(--glass-border)',
                        }}>
                            <Pause size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                            {t('settingsPage.recordingUpload.disabled')}
                        </span>
                    )}
                </div>
                <Button
                    onClick={fetchStatus}
                    disabled={loading}
                    style={{
                        background: 'transparent', border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.8rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                        fontSize: '0.8rem', color: 'var(--text-secondary)',
                    }}
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    {t('settingsPage.recordingUpload.refresh')}
                </Button>
            </div>

            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <StatCard label={t('settingsPage.recordingUpload.queued')} value={totalQueued} color="var(--warning)" icon={<Clock size={16} />} />
                <StatCard label={t('settingsPage.recordingUpload.uploading')} value={status.queueLength} color="var(--primary)" icon={<Upload size={16} />} />
                <StatCard label={t('settingsPage.recordingUpload.uploaded')} value={totalUploaded} color="var(--success)" icon={<CheckCircle size={16} />} />
                <StatCard label={t('settingsPage.recordingUpload.failed')} value={totalFailed} color="var(--danger)" icon={<AlertTriangle size={16} />} />
            </div>

            {/* Recent uploads table */}
            {status?.recent?.length > 0 && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                        color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)',
                        background: 'var(--bg-body)',
                    }}>
                        {t('settingsPage.recordingUpload.recentUploads')}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <Table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <TableHeader>
                                <TableRow style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                    <TableHead style={thStyle}>{t('settingsPage.recordingUpload.status')}</TableHead>
                                    <TableHead style={thStyle}>{t('settingsPage.recordingUpload.callId')}</TableHead>
                                    <TableHead style={thStyle}>{t('settingsPage.recordingUpload.size')}</TableHead>
                                    <TableHead style={thStyle}>{t('settingsPage.recordingUpload.attempts')}</TableHead>
                                    <TableHead style={thStyle}>{t('settingsPage.recordingUpload.updatedAt')}</TableHead>
                                    <TableHead style={thStyle}>{t('settingsPage.recordingUpload.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {status?.recent?.map((rec) => (
                                    <TableRow key={rec.callId} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                        <TableCell style={tdStyle}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                {STATUS_ICONS[rec.status] || null}
                                                <span style={{ color: STATUS_COLORS[rec.status] || 'var(--text-secondary)', fontWeight: 500 }}>
                                                    {t(`settingsPage.recordingUpload.${rec.status}`, rec.status)}
                                                </span>
                                            </span>
                                        </TableCell>
                                        <TableCell style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.78rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            title={rec.callId}
                                        >
                                            {rec.callId.length > 28 ? rec.callId.slice(0, 28) + '…' : rec.callId}
                                        </TableCell>
                                        <TableCell style={tdStyle}>{formatBytes(rec.fileSize)}</TableCell>
                                        <TableCell style={tdStyle}>{rec.attempts}</TableCell>
                                        <TableCell style={{ ...tdStyle, color: 'var(--text-tertiary)' }}>
                                            {timeAgo(rec.updatedAt)}
                                        </TableCell>
                                        <TableCell style={tdStyle}>
                                            {rec.status === 'failed' && (
                                                <Button
                                                    onClick={() => handleRetry(rec.callId)}
                                                    disabled={retrying === rec.callId}
                                                    style={{
                                                        background: 'transparent', border: '1px solid var(--danger)',
                                                        borderRadius: 'var(--radius-sm)', padding: '0.2rem 0.5rem',
                                                        cursor: 'pointer', fontSize: '0.75rem', color: 'var(--danger)',
                                                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                                                    }}
                                                    title={rec.lastError || t('settingsPage.recordingUpload.retryUpload')}
                                                >
                                                    <RefreshCw size={12} className={retrying === rec.callId ? 'spin' : ''} />
                                                    {t('settingsPage.recordingUpload.retry')}
                                                </Button>
                                            )}
                                            {rec.status === 'uploaded' && (
                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>✓</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Empty state handle */}
            {(!status?.recent || status.recent.length === 0) && status?.enabled && (
                <div style={{
                    textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)',
                    fontSize: '0.85rem', background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
                }}>
                    {t('settingsPage.recordingUpload.noRecords')}
                </div>
            )}
        </div>
    );
};

// ── Helpers ──

const StatCard: React.FC<{ label: string; value: number; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
    <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-md)', padding: '0.8rem 1rem',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
    }}>
        <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color,
        }}>
            {icon}
        </div>
        <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>{label}</div>
        </div>
    </div>
);

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.75rem',
    fontWeight: 600, color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', whiteSpace: 'nowrap',
};
