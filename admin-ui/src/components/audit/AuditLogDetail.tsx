import React from 'react';
import { User, Calendar, Globe, Monitor, CheckCircle, XCircle, FileText } from 'lucide-react';
import { formatUTCToLocal } from '../../utils/date';
import type { AuditLog } from '../../types/audit';
import { useTranslation } from 'react-i18next';
import ChangesDiffView from './ChangesDiffView';

interface AuditLogDetailProps {
    log: AuditLog | null;
}

const AuditLogDetail: React.FC<AuditLogDetailProps> = ({ log }) => {
    const { t } = useTranslation();
    if (!log) return null;

    const styles = {
        statusBanner: {
            borderRadius: '0.5rem',
            padding: '1rem',
            backgroundColor: log.success === 1 ? 'rgba(var(--success-rgb), 0.1)' : 'rgba(var(--danger-rgb), 0.1)',
            border: log.success === 1 ? '1px solid var(--success)' : '1px solid var(--danger)',
            marginBottom: '1rem'
        },
        statusContent: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: log.success === 1 ? 'var(--success)' : 'var(--danger)',
            fontWeight: 500
        },
        grid: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem'
        },
        card: {
            backgroundColor: 'var(--bg-dark)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
        },
        cardLabelGroup: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem'
        },
        cardLabel: {
            fontSize: '0.875rem',
            fontWeight: 500
        },
        cardValue: {
            color: 'var(--text-primary)',
            margin: 0,
            wordBreak: 'break-all' as const
        },
        codeBlock: {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '0.25rem',
            padding: '1rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            overflowX: 'auto' as const,
            margin: 0,
            fontFamily: 'monospace',
            border: '1px solid var(--glass-border)'
        }
    };

    // Check if changes data is available and non-empty
    const hasChanges = log.changes && log.changes !== '' && log.changes !== '{}' && log.changes !== '""';

    return (
        <div className="flex flex-col gap-md">
            {/* Status Banner */}
            <div style={styles.statusBanner}>
                <div style={styles.statusContent}>
                    {log.success === 1 ? (
                        <>
                            <CheckCircle size={20} />
                            <span>{t('audit.actionSuccessful')}</span>
                        </>
                    ) : (
                        <>
                            <XCircle size={20} />
                            <span>{t('audit.actionFailed')}</span>
                        </>
                    )}
                </div>
                {log.failure_reason && (
                    <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--danger)', margin: 0 }}>
                        {t('audit.reason')}: {log.failure_reason}
                    </p>
                )}
            </div>

            {/* Basic Information */}
            <div style={styles.grid}>
                <div style={styles.card}>
                    <div style={styles.cardLabelGroup}>
                        <Calendar size={16} />
                        <span style={styles.cardLabel}>{t('audit.timestamp')}</span>
                    </div>
                    <p style={styles.cardValue}>
                        {formatUTCToLocal(log.timestamp, 'yyyy-MM-dd HH:mm:ss')}
                    </p>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardLabelGroup}>
                        <FileText size={16} />
                        <span style={styles.cardLabel}>{t('actions.category')}</span>
                    </div>
                    <p style={{ ...styles.cardValue, textTransform: 'capitalize' }}>
                        {log.category.replace('_', ' ')}
                    </p>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardLabelGroup}>
                        <User size={16} />
                        <span style={styles.cardLabel}>{t('audit.operator')}</span>
                    </div>
                    <p style={styles.cardValue}>{log.operator_name}</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem', margin: 0 }}>{log.operator_id}</p>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardLabelGroup}>
                        <FileText size={16} />
                        <span style={styles.cardLabel}>{t('actions.action')}</span>
                    </div>
                    <p style={styles.cardValue}>{log.action}</p>
                </div>
            </div>

            {/* Target Information */}
            {log.target_name && (
                <div style={styles.card}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem', margin: 0 }}>{t('audit.target')}</h3>
                    <p style={styles.cardValue}>{log.target_name}</p>
                    {log.target_id && (
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem', margin: 0 }}>ID: {log.target_id}</p>
                    )}
                </div>
            )}

            {/* Network Information */}
            <div style={styles.grid}>
                <div style={styles.card}>
                    <div style={styles.cardLabelGroup}>
                        <Globe size={16} />
                        <span style={styles.cardLabel}>{t('audit.ipAddress')}</span>
                    </div>
                    <p style={{ ...styles.cardValue, fontFamily: 'monospace' }}>{log.ip_address}</p>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardLabelGroup}>
                        <Monitor size={16} />
                        <span style={styles.cardLabel}>{t('audit.userAgent')}</span>
                    </div>
                    <p style={{ ...styles.cardValue, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.user_agent}>
                        {log.user_agent || 'N/A'}
                    </p>
                </div>
            </div>

            {/* Changes Diff View — shown when changes data is available */}
            {hasChanges && (
                <ChangesDiffView changes={log.changes!} />
            )}

            {/* Raw Data (always shown as fallback / additional detail) */}
            <div style={styles.card}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.75rem', margin: 0 }}>{t('audit.rawData')}</h3>
                <pre style={styles.codeBlock}>
                    {JSON.stringify(log, null, 2)}
                </pre>
            </div>
        </div>
    );
};

export default AuditLogDetail;

