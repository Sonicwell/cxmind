import { Select } from '../ui/Select';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal } from '../ui/GlassModal';
import { MotionButton } from '../ui/MotionButton';
import api from '../../services/api';
import { Trash2, Plus, Calendar, Mail, FileText, Send, Download } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Button } from '../ui/button';
import { useDemoMode } from '../../hooks/useDemoMode';

interface ScheduledReport {
    _id: string;
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    dataset: 'overview' | 'agents' | 'volume';
    nextRun: string;
    active: boolean;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ScheduledReportsModal: React.FC<Props> = ({ open, onOpenChange }) => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [reports, setReports] = useState<ScheduledReport[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<string | null>(null);
    const [emailReady, setEmailReady] = useState(false);
    const [sending, setSending] = useState<string | null>(null);

    // Form State
    const [newName, setNewName] = useState('');
    const [newFreq, setNewFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [newRecipients, setNewRecipients] = useState('');
    const [newDataset, setNewDataset] = useState<'overview' | 'agents' | 'volume'>('overview');

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await api.get('/analytics/reports');
            setReports(res.data.data);
        } catch (err) {
            console.error('Failed to fetch reports', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchReports();
            // 检查 SMTP 配置状态
            api.get('/platform/settings').then(res => {
                const se = res.data?.data?.systemEmail;
                setEmailReady(se?.provider === 'smtp' && !!se?.host);
            }).catch(() => setEmailReady(false));
        } else {
            // Bug2 fix: 关闭时重置表单视图
            setShowForm(false);
        }
    }, [open]);

    const handleCreate = async () => {
        if (!newName || !newRecipients) return;

        if (demoMode) {
            setShowForm(false);
            setNewName('');
            setNewRecipients('');
            const mockReport: ScheduledReport = {
                _id: Math.random().toString(),
                name: newName,
                frequency: newFreq,
                recipients: newRecipients.split(',').map(e => e.trim()),
                dataset: newDataset,
                nextRun: new Date().toISOString(),
                active: true
            };
            setReports([mockReport, ...reports]);
            return;
        }

        try {
            await api.post('/analytics/reports', {
                name: newName,
                frequency: newFreq,
                recipients: newRecipients.split(',').map(e => e.trim()),
                dataset: newDataset,
                format: 'csv'
            });
            setShowForm(false);
            setNewName('');
            setNewRecipients('');
            fetchReports();
        } catch (err) {
            console.error('Failed to create report', err);
        }
    };

    const handleDelete = async () => {
        if (!reportToDelete) return;
        try {
            await api.delete(`/analytics/reports/${reportToDelete}`);
            fetchReports();
        } catch (err) {
            console.error('Failed to delete report', err);
        } finally {
            setReportToDelete(null);
        }
    };

    const handleSendNow = async (reportId: string) => {
        setSending(reportId);
        try {
            await api.post(`/analytics/reports/${reportId}/send-now`);
        } catch (err) {
            console.error('Send now failed', err);
        } finally {
            setSending(null);
        }
    };

    const handleDownloadReport = async (dataset: string) => {
        try {
            const res = await api.get(`/analytics/sla/export?days=7&dataset=${dataset}`, {
                responseType: 'blob'
            });
            const blob = new Blob([res.data], { type: 'text/csv' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `report_${dataset}_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error('Download failed', err);
        }
    };

    return (
        <GlassModal open={open} onOpenChange={onOpenChange} title={t('analytics.scheduledReports', 'Scheduled Reports')} className="max-w-[600px]">
            <div className="space-y-6">
                {!showForm ? (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-slate-500">
                                {t('analytics.reportsDesc', 'Automatically receive CSV exports via email.')}
                            </p>
                            <MotionButton size="sm" onClick={() => setShowForm(true)}>
                                <Plus size={14} className="mr-1" /> {t('analytics.newSchedule', 'New Schedule')}
                            </MotionButton>
                        </div>

                        {loading ? <div>{t('common.loading', 'Loading...')}</div> : reports.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 bg-slate-50/50 rounded-lg">
                                {t('analytics.noReportsYet', 'No scheduled reports yet.')}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {reports.map(r => (
                                    <div key={r._id} className="flex justify-between items-center p-3 bg-white/50 border border-slate-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md">
                                                <FileText size={18} />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-slate-800 text-sm">{r.name}</h4>
                                                <div className="flex gap-3 text-xs text-slate-500 mt-1">
                                                    <span className="flex items-center gap-1"><Calendar size={10} /> {r.frequency === 'daily' ? t('analytics.freqDaily', 'Daily') : r.frequency === 'weekly' ? t('analytics.freqWeekly', 'Weekly') : t('analytics.freqMonthly', 'Monthly')}</span>
                                                    <span className="flex items-center gap-1"><Mail size={10} /> {r.recipients.length} {t('analytics.recipientsCount', 'recipients')}</span>
                                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 uppercase text-[10px] tracking-wide">
                                                        {r.dataset === 'overview' ? t('analytics.datasetOverview', 'Overview KPIs') : r.dataset === 'agents' ? t('analytics.datasetAgents', 'Agent Leaderboard') : t('analytics.datasetVolume', 'Call Volume')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                onClick={() => handleDownloadReport(r.dataset)}
                                                className="text-slate-400 hover:text-indigo-600 transition-colors p-2"
                                                title={t('analytics.downloadReport', 'Download Report')}
                                            >
                                                <Download size={16} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={() => handleSendNow(r._id)}
                                                className={`transition-colors p-2 ${emailReady ? 'text-slate-400 hover:text-green-600' : 'text-slate-200 cursor-not-allowed'}`}
                                                title={emailReady ? t('analytics.sendNow', 'Send Now') : t('analytics.configureEmailFirst', 'Please configure SMTP in System Settings first')}
                                                disabled={!emailReady || sending === r._id}
                                            >
                                                <Send size={16} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={() => setReportToDelete(r._id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors p-2"
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!emailReady && reports.length > 0 && (
                            <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                                <Mail size={12} /> {t('analytics.configureEmailFirst', 'Please configure SMTP in System Settings first')}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h3 className="font-medium text-slate-800">{t('analytics.newReportTitle', 'New Report Schedule')}</h3>

                        <div className="grid gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t('analytics.reportName', 'Report Name')}</label>
                                <input
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder={t('analytics.namePlaceholder', 'e.g. Weekly Executive Summary')}
                                    value={newName} onChange={e => setNewName(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t('analytics.frequency', 'Frequency')}</label>
                                    <Select
                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={newFreq} onChange={e => setNewFreq(e.target.value as any)}
                                    >
                                        <option value="daily">{t('analytics.freqDaily', 'Daily')}</option>
                                        <option value="weekly">{t('analytics.freqWeekly', 'Weekly')}</option>
                                        <option value="monthly">{t('analytics.freqMonthly', 'Monthly')}</option>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t('analytics.dataset', 'Dataset')}</label>
                                    <Select
                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={newDataset} onChange={e => setNewDataset(e.target.value as any)}
                                    >
                                        <option value="overview">{t('analytics.datasetOverview', 'Overview KPIs')}</option>
                                        <option value="agents">{t('analytics.datasetAgents', 'Agent Leaderboard')}</option>
                                        <option value="volume">{t('analytics.datasetVolume', 'Call Volume')}</option>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t('analytics.recipientsLabel', 'Recipients (comma separated)')}</label>
                                <input
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder={t('analytics.recipientsPlaceholder', 'boss@company.com, me@company.com')}
                                    value={newRecipients} onChange={e => setNewRecipients(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200">
                            <MotionButton variant="ghost" size="sm" onClick={() => setShowForm(false)}>{t('common.cancel', 'Cancel')}</MotionButton>
                            <MotionButton size="sm" onClick={handleCreate} disabled={!newName || !newRecipients}>{t('analytics.saveSchedule', 'Save Schedule')}</MotionButton>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                open={!!reportToDelete}
                onClose={() => setReportToDelete(null)}
                onConfirm={handleDelete}
                title={t('analytics.deleteReportTitle', 'Delete Scheduled Report')}
                description={t('analytics.deleteReportDesc', 'Are you sure you want to delete this scheduled report? This action cannot be undone.')}
                confirmText={t('analytics.deleteReportConfirm', 'Delete Report')}
            />
        </GlassModal>
    );
};
