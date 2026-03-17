import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, Activity, Users, CheckCircle, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import auditService from '../services/auditService';
import { MotionButton } from '../components/ui/MotionButton';
import { useDemoMode } from '../hooks/useDemoMode';
import { getMockAuditAnomalies } from '../services/mock-data';
import '../styles/audit-dashboard.css';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

const AuditAnomalies: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [anomalies, setAnomalies] = useState<any[]>([]);

    const fetchAnomalies = async () => {
        try {
            setRefreshing(true);
            if (demoMode) {
                const data = await getMockAuditAnomalies();
                setAnomalies(data);
            } else {
                const data = await auditService.getAnomalies(24);
                setAnomalies(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Failed to fetch anomalies:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchAnomalies();
    }, []);

    const getRiskLevel = (anomaly: any) => {
        if (anomaly.action_count > 500) return 'critical';
        if (anomaly.unique_ips > 2) return 'high';
        return 'medium';
    };

    const riskLabels: Record<string, string> = {
        critical: t('audit.riskCritical'),
        high: t('audit.riskHigh'),
        medium: t('audit.riskMedium'),
    };

    if (loading) {
        return (
            <div className="audit-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
        );
    }

    const uniqueActors = new Set(anomalies.map(a => a.operator_id)).size;
    const affectedCategories = new Set(anomalies.map(a => a.category)).size;

    return (
        <div className="audit-page">
            {/* Header */}
            <div className="audit-page-header">
                <div className="title-group">
                    <AlertTriangle size={28} style={{ color: '#fbbf24' }} />
                    <div>
                        <h1>{t('audit.anomalyTitle')}</h1>
                        <p>{t('audit.anomalySubtitle')}</p>
                    </div>
                </div>
                <div className="actions">
                    <MotionButton
                        variant="secondary"
                        onClick={fetchAnomalies}
                        disabled={refreshing}
                        className="flex items-center gap-sm"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        {t('actions.refresh')}
                    </MotionButton>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="audit-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="glass-panel audit-stat-card">
                    <div className="stat-info">
                        <p>{t('audit.totalAnomalies')}</p>
                        <p className="stat-value">{anomalies.length}</p>
                    </div>
                    <div className="stat-icon red">
                        <ShieldAlert size={20} />
                    </div>
                </div>
                <div className="glass-panel audit-stat-card">
                    <div className="stat-info">
                        <p>{t('audit.highRiskActors')}</p>
                        <p className="stat-value">{uniqueActors}</p>
                    </div>
                    <div className="stat-icon amber">
                        <Users size={20} />
                    </div>
                </div>
                <div className="glass-panel audit-stat-card">
                    <div className="stat-info">
                        <p>{t('audit.affectedCategories')}</p>
                        <p className="stat-value">{affectedCategories}</p>
                    </div>
                    <div className="stat-icon blue">
                        <Activity size={20} />
                    </div>
                </div>
            </div>

            {/* Anomalies List */}
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--glass-border)' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {t('audit.detectedAnomalies')}
                    </h3>
                </div>

                {anomalies.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <CheckCircle size={48} color="#10b981" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            {t('audit.noAnomalies')}
                        </h3>
                        <p>{t('audit.noAnomaliesDesc')}</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <Table className="audit-anomaly-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('audit.operator')}</TableHead>
                                    <TableHead>{t('actions.category')}</TableHead>
                                    <TableHead>{t('audit.actionCount')}</TableHead>
                                    <TableHead>{t('audit.uniqueActions')}</TableHead>
                                    <TableHead>{t('audit.uniqueIPs')}</TableHead>
                                    <TableHead>{t('audit.riskLevel')}</TableHead>
                                    <TableHead>{t('common.actions', 'Actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {anomalies.map((anomaly, index) => {
                                    const risk = getRiskLevel(anomaly);
                                    return (
                                        <TableRow key={index}>
                                            <TableCell>
                                                <div>
                                                    <span style={{ fontWeight: 500 }}>{anomaly.operator_name}</span>
                                                    <br />
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {anomaly.operator_id}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="log-badge" style={{ background: 'rgba(99,102,241,0.1)' }}>
                                                    {anomaly.category}
                                                </span>
                                            </TableCell>
                                            <TableCell className="mono">{anomaly.action_count}</TableCell>
                                            <TableCell className="mono" style={{ color: 'var(--text-muted)' }}>{anomaly.unique_actions}</TableCell>
                                            <TableCell className="mono" style={{ color: 'var(--text-muted)' }}>{anomaly.unique_ips}</TableCell>
                                            <TableCell>
                                                <div className="risk-indicator">
                                                    <span className={`risk-dot ${risk}`} />
                                                    <span className={`risk-label ${risk}`} style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                                        {riskLabels[risk]}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    onClick={() => {
                                                        const params = new URLSearchParams();
                                                        if (anomaly.operator_id) params.set('operator_id', anomaly.operator_id);
                                                        if (anomaly.category) params.set('category', anomaly.category);
                                                        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                                                        params.set('start_date', oneDayAgo);
                                                        navigate(`/audit/logs?${params.toString()}`);
                                                    }}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.35rem',
                                                        padding: '0.35rem 0.65rem',
                                                        borderRadius: 'var(--radius-sm, 6px)',
                                                        border: '1px solid var(--glass-border)',
                                                        backgroundColor: 'transparent',
                                                        color: 'var(--primary)',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
                                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                        e.currentTarget.style.borderColor = 'var(--glass-border)';
                                                    }}
                                                    title={t('audit.investigateAnomaly', 'View related audit logs')}
                                                >
                                                    <Eye size={14} />
                                                    {t('audit.investigate', 'Investigate')}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditAnomalies;
