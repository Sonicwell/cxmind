import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import React, { useState, useEffect } from 'react';
import { useVisibilityAwareInterval } from '../hooks/useVisibilityAwareInterval';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui/card';
import { MotionButton } from '../components/ui/MotionButton';
import {
    AlertTriangle, ShieldAlert, CheckCircle2,
    XCircle, RefreshCw, Clock
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { OperatorProfile } from '../components/audit/OperatorProfile';
import { Button } from '../components/ui/button';

interface AlertRecord {
    timestamp: string;
    rule_id: string;
    rule_name: string;
    severity: string;
    event_category: string;
    event_action: string;
    operator_id: string;
    operator_name: string;
    ip_address: string;
    event_summary: string;
    notification_status: 'pending' | 'sent' | 'failed' | 'none';
    resolved_status: 'open' | 'acknowledged' | 'false_positive';
    resolved_by?: string;
    resolved_at?: string;
}

const SEVERITY_COLORS = {
    critical: 'bg-red-500/10 text-red-500 border-red-500/20',
    high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    low: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
};

const STATUS_COLORS = {
    open: 'bg-red-500/10 text-red-500',
    acknowledged: 'bg-green-500/10 text-green-500',
    false_positive: 'bg-gray-500/10 text-gray-500'
};

const AlertCenter: React.FC = () => {
    const { t } = useTranslation();
    const [alerts, setAlerts] = useState<AlertRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
    const [resolving, setResolving] = useState<{ id: string, ts: string } | null>(null);
    const [profileOperator, setProfileOperator] = useState<{ id: string, name: string } | null>(null);

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.append('status', statusFilter);
            const { data } = await api.get(`/audit/alerts?${params.toString()}`);
            setAlerts(data.data || []);
        } catch (error) {
            console.error('Failed to fetch alerts:', error);
            toast.error(t('audit.fetchFailed', 'Failed to load alerts'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, [statusFilter]);
    useVisibilityAwareInterval(fetchAlerts, 30_000);

    const handleResolve = async (ruleId: string, timestamp: string, status: 'acknowledged' | 'false_positive') => {
        try {
            setResolving({ id: ruleId, ts: timestamp });
            await api.put('/audit/alerts/resolve', { ruleId, timestamp, status });
            toast.success(t('audit.alertResolved', 'Alert resolved successfully'));
            fetchAlerts();
        } catch (error) {
            console.error('Failed to resolve alert:', error);
            toast.error(t('audit.resolveFailed', 'Failed to resolve alert'));
        } finally {
            setResolving(null);
        }
    };

    return (
        <div className="p-xl max-w-7xl mx-auto space-y-md">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-sm">
                        <ShieldAlert className="text-[var(--danger)]" />
                        {t('audit.alertCenter', 'Alert Center')}
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        {t('audit.alertCenterDesc', 'Monitor and respond to security and compliance rule triggers.')}
                    </p>
                </div>

                <div className="flex items-center gap-xs bg-[var(--bg-secondary)] p-1 rounded-lg">
                    {(['open', 'resolved', 'all'] as const).map(s => (
                        <Button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === s
                                ? 'bg-[var(--bg-card)] shadow text-[var(--text-primary)]'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            {t(`audit.status_${s}`, s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' '))}
                        </Button>
                    ))}
                    <Button onClick={fetchAlerts} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <Table className="w-full text-left border-collapse">
                        <TableHeader>
                            <TableRow className="border-b border-[var(--border-color)] text-sm text-[var(--text-muted)]">
                                <TableHead className="p-md font-medium">{t('audit.timestamp', 'Time')}</TableHead>
                                <TableHead className="p-md font-medium">{t('audit.rule', 'Rule')}</TableHead>
                                <TableHead className="p-md font-medium">{t('audit.summary', 'Summary')}</TableHead>
                                <TableHead className="p-md font-medium">{t('audit.operator', 'Operator')}</TableHead>
                                <TableHead className="p-md font-medium">{t('audit.status', 'Status')}</TableHead>
                                <TableHead className="p-md font-medium text-right">{t('common.actions', 'Actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-[var(--border-color)]">
                            {alerts.map((alert) => (
                                <TableRow key={`${alert.rule_id}-${alert.timestamp}`} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                                    <TableCell className="p-md text-sm whitespace-nowrap">
                                        <div className="flex items-center gap-xs text-[var(--text-secondary)]">
                                            <Clock size={14} />
                                            {new Date(alert.timestamp).toLocaleString()}
                                        </div>
                                    </TableCell>
                                    <TableCell className="p-md">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-medium">{alert.rule_name}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full w-fit border ${SEVERITY_COLORS[alert.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.medium}`}>
                                                {alert.severity.toUpperCase()}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="p-md text-sm">
                                        {alert.event_summary}
                                        {alert.notification_status === 'failed' && (
                                            <span className="ml-2 inline-flex items-center gap-1 text-[var(--danger)] text-xs" title="Notification sending failed">
                                                <AlertTriangle size={12} /> Failed to notify
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="p-md text-sm">
                                        <div className="text-[var(--text-primary)]">
                                            {alert.operator_name && alert.operator_id ? (
                                                <Button
                                                    onClick={() => setProfileOperator({ id: alert.operator_id, name: alert.operator_name })}
                                                    className="text-[var(--primary)] hover:underline focus:outline-none"
                                                    title={t('audit.viewOperatorProfile', 'View Operator Profile')}
                                                >
                                                    {alert.operator_name}
                                                </Button>
                                            ) : (
                                                alert.operator_name || '-'
                                            )}
                                        </div>
                                        <div className="text-[var(--text-muted)] text-xs">{alert.ip_address}</div>
                                    </TableCell>
                                    <TableCell className="p-md">
                                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[alert.resolved_status]}`}>
                                            {t(`audit.status_${alert.resolved_status}`, alert.resolved_status.replace('_', ' '))}
                                        </span>
                                        {alert.resolved_status !== 'open' && alert.resolved_by && (
                                            <div className="text-xs text-[var(--text-muted)] mt-1">
                                                By: {alert.resolved_by}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="p-md text-right">
                                        {alert.resolved_status === 'open' && (
                                            <div className="flex items-center justify-end gap-2">
                                                <MotionButton
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleResolve(alert.rule_id, alert.timestamp, 'acknowledged')}
                                                    disabled={resolving?.id === alert.rule_id && resolving?.ts === alert.timestamp}
                                                    className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0"
                                                    title={t('audit.acknowledge', 'Acknowledge')}
                                                >
                                                    <CheckCircle2 size={16} />
                                                </MotionButton>
                                                <MotionButton
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleResolve(alert.rule_id, alert.timestamp, 'false_positive')}
                                                    disabled={resolving?.id === alert.rule_id && resolving?.ts === alert.timestamp}
                                                    title={t('audit.markFalsePositive', 'Mark as False Positive')}
                                                >
                                                    <XCircle size={16} className="text-[var(--text-secondary)]" />
                                                </MotionButton>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {alerts.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={6} className="p-xl text-center text-[var(--text-muted)]">
                                        <ShieldAlert size={48} className="mx-auto mb-4 opacity-20" />
                                        <p>{t('audit.noAlerts', 'No alerts found for the selected filter.')}</p>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

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

export default AlertCenter;
