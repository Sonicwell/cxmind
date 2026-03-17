import React from 'react';
import { Clock, User, CheckCircle, XCircle } from 'lucide-react';
import { formatUTCToLocal } from '../../utils/date';
import type { AuditLog } from '../../types/audit';
import { useTranslation } from 'react-i18next';

interface RecentAuditLogsProps {
    logs: AuditLog[];
    loading?: boolean;
    onViewDetails?: (log: AuditLog) => void;
}

const RecentAuditLogs: React.FC<RecentAuditLogsProps> = ({ logs, loading = false, onViewDetails }) => {
    const { t } = useTranslation();
    if (loading || !logs || logs.length === 0) {
        return (
            <div className="glass-panel audit-recent-logs">
                <h3>{t('audit.recentLogs')}</h3>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
                    {loading ? t('common.loading') : t('audit.noRecentLogs')}
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel audit-recent-logs">
            <h3>{t('audit.recentLogs')}</h3>
            <div className="audit-log-list">
                {logs.map((log, index) => (
                    <div
                        key={index}
                        className="audit-log-item"
                        onClick={() => onViewDetails?.(log)}
                    >
                        <div className="log-row">
                            <span className="log-badge">
                                {log.category.replace('_', ' ').toUpperCase()}
                            </span>

                            <div className="log-action">
                                <span>{log.action}</span>
                                {log.success === 1 ? (
                                    <CheckCircle size={14} color="#10b981" style={{ flexShrink: 0 }} />
                                ) : (
                                    <XCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                                )}
                                {log.failure_reason && (
                                    <span style={{ fontSize: '0.75rem', color: '#ef4444', whiteSpace: 'nowrap' }}>
                                        {log.failure_reason}
                                    </span>
                                )}
                            </div>

                            <div className="log-operator">
                                <User size={12} />
                                <span>{log.operator_name}</span>
                                {log.target_name && (
                                    <span style={{ opacity: 0.5 }}> → {log.target_name}</span>
                                )}
                            </div>

                            <div className="log-time">
                                <Clock size={11} />
                                <span>{formatUTCToLocal(log.timestamp, 'HH:mm:ss')}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RecentAuditLogs;
