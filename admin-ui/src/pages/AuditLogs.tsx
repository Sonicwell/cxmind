import React, { useEffect, useState } from 'react';
import { FileText, Download, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AuditFilters from '../components/audit/AuditFilters';
import AuditLogsTable from '../components/audit/AuditLogsTable';
import AuditLogDetail from '../components/audit/AuditLogDetail';
import { OperatorProfile } from '../components/audit/OperatorProfile';
import { auditService } from '../services/auditService';
import type { AuditLog, AuditLogQuery } from '../types/audit';
import { GlassModal } from '../components/ui/GlassModal';
import { MotionButton } from '../components/ui/MotionButton';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { useTranslation } from 'react-i18next';

const AuditLogs: React.FC = () => {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [limit] = useState(50);
    const [offset, setOffset] = useState(0);

    // 从URL query params解析初始filter (如AuditAnomalies的Investigate链接)
    const getInitialFilters = (): AuditLogQuery => {
        const initial: AuditLogQuery = {};
        const category = searchParams.get('category');
        const action = searchParams.get('action');
        const startDate = searchParams.get('start_date');
        const endDate = searchParams.get('end_date');
        const operatorId = searchParams.get('operator_id');
        if (category) initial.category = category;
        if (action) initial.action = action;
        if (startDate) initial.start_date = startDate;
        if (endDate) initial.end_date = endDate;
        if (operatorId) initial.operator_id = operatorId;
        return initial;
    };

    const [filters, setFilters] = useState<AuditLogQuery>(getInitialFilters);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [profileOperator, setProfileOperator] = useState<{ id: string, name: string } | null>(null);

    const fetchLogs = async (newFilters?: AuditLogQuery, newOffset?: number) => {
        try {
            setRefreshing(true);
            const query: AuditLogQuery = {
                ...newFilters,
                limit,
                offset: newOffset ?? offset,
            };

            const response = await auditService.getLogs(query);
            setLogs(response.logs);
            setTotal(response.total);
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchLogs(filters, 0);
    }, []);

    const handleFilterChange = (newFilters: AuditLogQuery) => {
        setFilters(newFilters);
        setOffset(0);
        fetchLogs(newFilters, 0);
    };

    const handlePageChange = (newOffset: number) => {
        setOffset(newOffset);
        fetchLogs(filters, newOffset);
    };

    const handleRefresh = () => {
        fetchLogs(filters, offset);
    };

    const handleExport = async (format: 'csv' | 'pdf') => {
        try {
            const blob = format === 'csv'
                ? await auditService.exportToCSV(filters)
                : await auditService.exportToPDF(filters);

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit_logs_${Date.now()}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error(`Failed to export ${format.toUpperCase()}:`, error);
        }
    };

    return (
        <div className="page-content">
            {/* Header */}
            <div className="page-header flex justify-between items-center" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="p-2 rounded-lg bg-primary/10">
                        <FileText size={24} className="text-primary" />
                    </div>
                    <div>
                        <h1 className="page-title" style={{ margin: 0, fontSize: '1.5rem' }}>{t('audit.logsTitle')}</h1>
                        <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>{t('audit.logsSubtitle')}</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <MotionButton
                        variant="secondary"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-sm"
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                        {t('actions.refresh')}
                    </MotionButton>
                    <DropdownMenu
                        trigger={
                            <MotionButton
                                variant="primary"
                                className="flex items-center gap-sm"
                            >
                                <Download size={18} />
                                {t('audit.export')}
                            </MotionButton>
                        }
                        items={[
                            { label: t('audit.exportAsCsv'), onClick: () => handleExport('csv') },
                            { label: t('audit.exportAsPdf'), onClick: () => handleExport('pdf') },
                        ]}
                        align="end"
                    />
                </div>
            </div>

            {/* Filters */}
            <AuditFilters onFilterChange={handleFilterChange} loading={refreshing} />

            {/* Results Summary */}
            <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {total > 0 ? (
                    <span>{t('audit.foundLogs', { count: total })}</span>
                ) : (
                    <span>{t('audit.noLogsFound')}</span>
                )}
            </div>

            {/* Table */}
            <div className="glass-panel rounded-lg" style={{ overflow: 'visible' }}>
                <AuditLogsTable
                    logs={logs}
                    loading={loading}
                    onViewDetails={setSelectedLog}
                    onOperatorClick={(id, name) => setProfileOperator({ id, name })}
                    total={total}
                    limit={limit}
                    offset={offset}
                    onPageChange={handlePageChange}
                />
            </div>

            {/* Detail Modal */}
            <GlassModal
                open={!!selectedLog}
                onOpenChange={(open) => !open && setSelectedLog(null)}
                title={t('audit.logDetails')}
                className="max-w-[700px]"
            >
                <AuditLogDetail log={selectedLog} />
            </GlassModal>

            {/* Operator Profile Modal */}
            <OperatorProfile
                isOpen={!!profileOperator}
                onClose={() => setProfileOperator(null)}
                operatorId={profileOperator?.id || ''}
                operatorName={profileOperator?.name || ''}
            />
        </div>
    );
};

export default AuditLogs;
