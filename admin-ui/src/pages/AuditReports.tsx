import { DatePicker } from '../components/ui/DatePicker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import React, { useState } from 'react';
import { FileText, Calendar, Download } from 'lucide-react';
import auditService from '../services/auditService';
import './AuditReports.css';
import { useTranslation } from 'react-i18next';

import { Button } from '../components/ui/button';

interface ReportData {
    period: { start: string; end: string };
    summary: Array<{
        category: string;
        action: string;
        total_events: number;
        failed_events: number;
        failure_rate: number;
        unique_operators: number;
    }>;
    generated_at: string;
}

const AuditReports: React.FC = () => {
    const { t } = useTranslation();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<ReportData | null>(null);

    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!startDate || !endDate) return;

        try {
            setLoading(true);
            setError(null);
            const data = await auditService.getComplianceReport(startDate, endDate);
            // 校验数据结构
            if (!data || !data.period || !Array.isArray(data.summary)) {
                setError('The server returned an unexpected data format. Please try again later.');
                setReport(null);
                return;
            }
            setReport(data);
        } catch (err) {
            console.error('Failed to generate report:', err);
            setError('Failed to generate report. Please check your connection and try again.');
            setReport(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPDF = async () => {
        // Mock download - in real implementation this would call an API that generates PDF
        alert('PDF download feature coming soon!');
    };

    const badgeClass = (failureRate: number) =>
        failureRate > 10 ? 'badge badge-danger' : 'badge badge-success';

    return (
        <div className="audit-reports-page">
            {/* Header */}
            <div className="audit-reports-header">
                <div className="audit-reports-title-group">
                    <FileText size={32} color="var(--primary)" />
                    <div>
                        <h1>{t('audit.reportsTitle')}</h1>
                        <p>{t('audit.reportsSubtitle')}</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="audit-reports-controls">
                <div className="audit-reports-controls-grid">
                    <div className="audit-reports-input-group">
                        <label>{t('audit.startDate')}</label>
                        <div className="audit-reports-input-wrapper">
                            <Calendar size={18} className="input-icon" />
                            <DatePicker
                                
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="audit-reports-input"
                            />
                        </div>
                    </div>
                    <div className="audit-reports-input-group">
                        <label>{t('audit.endDate')}</label>
                        <div className="audit-reports-input-wrapper">
                            <Calendar size={18} className="input-icon" />
                            <DatePicker
                                
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="audit-reports-input"
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleGenerate}
                        disabled={loading || !startDate || !endDate} className="audit-reports-generate-"
                    >
                        {loading ? t('audit.generating') : t('audit.generateReport')}
                    </Button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)' }}>
                    {error}
                </div>
            )}

            {/* Report Display */}
            {report && (
                <div className="audit-report-container">
                    {/* Report Header */}
                    <div className="audit-report-header">
                        <div>
                            <h2>{t('audit.reportDetails')}</h2>
                            <p className="audit-report-meta">
                                {t('audit.period')}: {report.period.start} — {report.period.end}
                            </p>
                            <p className="audit-report-meta-small">
                                {t('audit.generated')}: {new Date(report.generated_at).toLocaleString()}
                            </p>
                        </div>
                        <Button
                            onClick={handleDownloadPDF} className="audit-report-download-"
                        >
                            <Download size={18} />
                            {t('audit.downloadPdf')}
                        </Button>
                    </div>

                    {/* Summary Stats */}
                    <div className="audit-report-stats-grid">
                        <div className="audit-report-stat-card">
                            <p className="audit-report-stat-label">{t('audit.totalEvents')}</p>
                            <p className="audit-report-stat-value">
                                {report.summary.reduce((acc, curr) => acc + curr.total_events, 0).toLocaleString()}
                            </p>
                        </div>
                        <div className="audit-report-stat-card">
                            <p className="audit-report-stat-label">{t('audit.actionCategories')}</p>
                            <p className="audit-report-stat-value">
                                {new Set(report.summary.map(s => s.category)).size}
                            </p>
                        </div>
                        <div className="audit-report-stat-card">
                            <p className="audit-report-stat-label">{t('audit.avgFailureRate')}</p>
                            <p className="audit-report-stat-value audit-report-stat-value--accent">
                                {(report.summary.reduce((acc, curr) => acc + curr.failure_rate, 0) / (report.summary.length || 1)).toFixed(2)}%
                            </p>
                        </div>
                        <div className="audit-report-stat-card">
                            <p className="audit-report-stat-label">{t('audit.uniqueOperators')}</p>
                            <p className="audit-report-stat-value">
                                {report.summary.length > 0 ? Math.max(...report.summary.map(s => s.unique_operators)) : 0}
                            </p>
                        </div>
                    </div>

                    {/* Detailed Table */}
                    <div className="glass-panel" style={{ overflow: 'hidden', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <Table className="data-table">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('actions.category')}</TableHead>
                                        <TableHead>{t('actions.action')}</TableHead>
                                        <TableHead className="text-right">{t('audit.totalEvents')}</TableHead>
                                        <TableHead className="text-right">{t('audit.failures')}</TableHead>
                                        <TableHead className="text-right">{t('audit.failureRate')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {report.summary.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>{item.category}</TableCell>
                                            <TableCell>{item.action}</TableCell>
                                            <TableCell className="text-right text-mono" style={{ color: 'var(--text-primary)' }}>{item.total_events}</TableCell>
                                            <TableCell className="text-right text-mono" style={{ color: 'var(--danger)' }}>{item.failed_events}</TableCell>
                                            <TableCell className="text-right">
                                                <span className={badgeClass(item.failure_rate)}>
                                                    {item.failure_rate.toFixed(2)}%
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditReports;
