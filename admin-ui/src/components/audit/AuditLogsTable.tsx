import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React from 'react';
import { formatUTCToLocal } from '../../utils/date';
import { CheckCircle, XCircle, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AuditLog } from '../../types/audit';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

interface AuditLogsTableProps {
    logs: AuditLog[];
    loading?: boolean;
    onViewDetails: (log: AuditLog) => void;
    onOperatorClick?: (operatorId: string, operatorName: string) => void;
    // Pagination
    total: number;
    limit: number;
    offset: number;
    onPageChange: (newOffset: number) => void;
}



const AuditLogsTable: React.FC<AuditLogsTableProps> = ({
    logs,
    loading = false,
    onViewDetails,
    onOperatorClick,
    total,
    limit,
    offset,
    onPageChange,
}) => {
    const { t } = useTranslation();
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    const handlePrevPage = () => {
        if (offset - limit >= 0) {
            onPageChange(offset - limit);
        }
    };

    const handleNextPage = () => {
        if (offset + limit < total) {
            onPageChange(offset + limit);
        }
    };


    const styles = {
        container: {
            backgroundColor: 'var(--bg-card)',
            borderRadius: '0.5rem',
            border: '1px solid var(--glass-border)',
            overflow: 'hidden'
        },
        tableWrapper: {
            overflowX: 'auto' as const
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse' as const
        },
        th: {
            padding: '0.75rem 1.5rem',
            textAlign: 'left' as const,
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--text-muted)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            backgroundColor: 'rgba(0,0,0,0.02)',
            borderBottom: '1px solid var(--glass-border)'
        },
        td: {
            padding: '1rem 1.5rem',
            whiteSpace: 'nowrap' as const,
            fontSize: '0.875rem',
            color: 'var(--text-primary)',
            borderBottom: '1px solid var(--glass-border)'
        },
        badge: (category: string) => {
            const colors: Record<string, { bg: string, text: string }> = {
                auth: { bg: '#eff6ff', text: '#2563eb' },
                user_management: { bg: '#f0fdf4', text: '#16a34a' },
                client_management: { bg: '#faf5ff', text: '#9333ea' },
                agent_management: { bg: '#fefce8', text: '#ca8a04' },
                call_access: { bg: '#fef2f2', text: '#dc2626' },
                knowledge_base: { bg: '#ecfeff', text: '#0891b2' },
                ai_config: { bg: '#fdf2f8', text: '#db2777' },
                monitoring: { bg: '#eef2ff', text: '#4f46e5' },
                mfa: { bg: '#f0fdfa', text: '#0d9488' },
                default: { bg: '#f3f4f6', text: '#4b5563' }
            };
            const style = colors[category] || colors.default;
            return {
                padding: '0.25rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 500,
                backgroundColor: style.bg,
                color: style.text,
                display: 'inline-block',
                border: `1px solid currentColor`
            };
        },
        statusSuccess: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: '#16a34a'
        },
        statusFailed: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: '#dc2626'
        },
        detailBtn: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: '#2563eb',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            padding: 0
        },
        pagination: {
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(0,0,0,0.02)'
        },
        pageBtn: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--glass-border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
        },
        pageInfo: {
            fontSize: '0.875rem',
            color: 'var(--text-muted)'
        },
        loadingState: {
            backgroundColor: 'var(--bg-card)',
            borderRadius: '0.5rem',
            border: '1px solid var(--glass-border)',
            padding: '1.5rem'
        },
        pulse: {
            height: '4rem',
            backgroundColor: 'hsla(0,0%,50%,0.1)',
            borderRadius: '0.25rem',
            marginBottom: '1rem',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
        },
        emptyState: {
            backgroundColor: 'var(--bg-card)',
            borderRadius: '0.5rem',
            border: '1px solid var(--glass-border)',
            padding: '3rem',
            textAlign: 'center' as const
        }
    };

    if (loading) {
        return (
            <div style={styles.loadingState}>
                <div>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} style={styles.pulse}></div>
                    ))}
                </div>
                <style>{`
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                `}</style>
            </div>
        );
    }

    if (!logs || logs.length === 0) {
        return (
            <div style={styles.emptyState}>
                <p style={{ color: 'var(--text-primary)', fontSize: '1.125rem', margin: 0 }}>{t('audit.noLogsFound')}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{t('audit.tryAdjustFilters')}</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Table */}
            <div style={styles.tableWrapper}>
                <Table style={styles.table}>
                    <TableHeader>
                        <TableRow>
                            <TableHead style={styles.th}>{t('audit.timestamp')}</TableHead>
                            <TableHead style={styles.th}>{t('actions.category')}</TableHead>
                            <TableHead style={styles.th}>{t('audit.operator')}</TableHead>
                            <TableHead style={styles.th}>{t('actions.action')}</TableHead>
                            <TableHead style={styles.th}>{t('audit.target')}</TableHead>
                            <TableHead style={styles.th}>{t('actions.statusCol')}</TableHead>
                            <TableHead style={styles.th}>{t('common.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.map((log, index) => (
                            <TableRow
                                key={index}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                style={{ transition: 'background-color 0.2s' }}
                            >
                                <TableCell style={styles.td}>
                                    {formatUTCToLocal(log.timestamp, 'yyyy-MM-dd HH:mm:ss')}
                                </TableCell>
                                <TableCell style={styles.td}>
                                    <span style={{ ...styles.badge(log.category), border: '1px solid currentColor', opacity: 0.9 }}>
                                        {log.category.replace('_', ' ')}
                                    </span>
                                </TableCell>
                                <TableCell style={styles.td}>
                                    {log.operator_name && log.operator_id ? (
                                        <Button
                                            onClick={() => onOperatorClick?.(log.operator_id, log.operator_name)}
                                            className="text-[var(--primary)] hover:underline focus:outline-none"
                                            title={t('audit.viewOperatorProfile', 'View Operator Profile')}
                                        >
                                            {log.operator_name}
                                        </Button>
                                    ) : (
                                        log.operator_name || '-'
                                    )}
                                </TableCell>
                                <TableCell style={styles.td}>
                                    {log.action}
                                </TableCell>
                                <TableCell style={{ ...styles.td, color: '#6b7280', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {log.target_name || '-'}
                                </TableCell>
                                <TableCell style={styles.td}>
                                    {log.success === 1 ? (
                                        <div style={styles.statusSuccess}>
                                            <CheckCircle size={16} />
                                            <span>{t('audit.success')}</span>
                                        </div>
                                    ) : (
                                        <div style={styles.statusFailed}>
                                            <XCircle size={16} />
                                            <span>{t('audit.failed')}</span>
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell style={styles.td}>
                                    <Button
                                        onClick={() => onViewDetails(log)}
                                        style={styles.detailBtn}
                                        onMouseEnter={(e) => e.currentTarget.style.color = '#1d4ed8'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = '#2563eb'}
                                    >
                                        <Eye size={16} />
                                        {t('actions.details')}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div style={styles.pagination}>
                <div style={styles.pageInfo}>
                    {t('audit.showingResults', { from: offset + 1, to: Math.min(offset + limit, total), total })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Button
                        onClick={handlePrevPage}
                        disabled={offset === 0}
                        style={{
                            ...styles.pageBtn,
                            opacity: offset === 0 ? 0.5 : 1,
                            cursor: offset === 0 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <ChevronLeft size={16} />
                        {t('audit.previous')}
                    </Button>
                    <span style={styles.pageInfo}>
                        {t('audit.pageOf', { current: currentPage, total: totalPages })}
                    </span>
                    <Button
                        onClick={handleNextPage}
                        disabled={offset + limit >= total}
                        style={{
                            ...styles.pageBtn,
                            opacity: offset + limit >= total ? 0.5 : 1,
                            cursor: offset + limit >= total ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {t('audit.next')}
                        <ChevronRight size={16} />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default AuditLogsTable;
