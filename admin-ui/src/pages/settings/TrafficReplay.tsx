import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import React, { useState, useEffect } from 'react';
import { Play, UploadCloud, RefreshCw, CheckCircle, XCircle, Trash2, Database } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Input } from '../../components/ui/input';
import api from '../../services/api';

import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

interface Scenario {
    name: string;
    createdAt: string;
    meta: {
        call_id?: string;
    };
}

export const TrafficReplay: React.FC = () => {
    const { t } = useTranslation();
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [loading, setLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [runResult, setRunResult] = useState<{ success: boolean; output: string; error?: string } | null>(null);

    // Form states
    const [file, setFile] = useState<File | null>(null);
    const [scenarioName, setScenarioName] = useState('');
    const [targetCallId, setTargetCallId] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean, name: string | null }>({ isOpen: false, name: null });

    useEffect(() => {
        fetchScenarios();
    }, []);

    const fetchScenarios = async () => {
        setLoading(true);
        try {
            const res = await api.get('/test-manager/scenarios');
            setScenarios(res.data);
        } catch (err) {
            console.error('Failed to load scenarios', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (name: string) => {
        try {
            await api.delete(`/test-manager/scenarios/${name}`);
            await fetchScenarios();
        } catch (err) {
            console.error('Failed to delete scenario', err);
            alert(t('trafficReplay.deleteFailed'));
        } finally {
            setDeleteConfirm({ isOpen: false, name: null });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const f = e.target.files[0];
            setFile(f);
            // 从文件名自动填充 scenario name（去扩展名，空格/特殊字符转下划线）
            if (!scenarioName) {
                const baseName = f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                setScenarioName(baseName);
            }
        }
    };

    const handleRecord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !scenarioName) return;

        setIsRecording(true);
        try {
            const formData = new FormData();
            formData.append('pcap', file);
            formData.append('scenarioName', scenarioName.trim());
            formData.append('targetCallId', targetCallId.trim());

            await api.post('/test-manager/record', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // Reset form and refresh list
            setFile(null);
            setScenarioName('');
            setTargetCallId('');
            await fetchScenarios();
        } catch (err) {
            console.error('Failed to record snapshot', err);
            alert(t('trafficReplay.recordFailed'));
        } finally {
            setIsRecording(false);
        }
    };

    const handleRunTests = async () => {
        setIsRunning(true);
        setRunResult(null);
        try {
            const res = await api.post('/test-manager/run');
            setRunResult(res.data);
        } catch (err: any) {
            console.error('Run failed', err);
            setRunResult({
                success: false,
                output: err.response?.data?.output || '',
                error: err.response?.data?.error || err.message
            });
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="settings-section glass-panel header-glow">
            <div className="section-header" style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Play size={24} style={{ color: 'var(--primary)' }} />
                    {t('trafficReplay.title')}
                </h2>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    {t('trafficReplay.description')}
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>

                {/* Run Card */}
                <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <RefreshCw size={18} style={{ color: 'var(--primary)' }} />
                        {t('trafficReplay.runRegression')}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                        {t('trafficReplay.runDescription')}
                    </p>

                    <div style={{ marginTop: 'auto' }}>
                        <Button
                            onClick={handleRunTests}
                            disabled={isRunning || scenarios.length === 0}
                            style={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem',
                                fontSize: '1rem',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                                ...(scenarios.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                            }}
                        >
                            {isRunning ? <RefreshCw className="spin" size={20} /> : <Play size={20} />}
                            {isRunning ? t('trafficReplay.runningTests') : t('trafficReplay.runTestsBtn')}
                        </Button>
                    </div>

                    {/* Result Panel */}
                    {runResult && (
                        <div style={{
                            marginTop: '1.5rem',
                            padding: '1.25rem',
                            background: runResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${runResult.success ? 'var(--success)' : 'var(--danger)'}`,
                            borderRadius: 'var(--radius-md)',
                            animation: 'fadeIn 0.3s ease-out'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: runResult.success ? 'var(--success)' : 'var(--danger)' }}>
                                {runResult.success ? <CheckCircle size={20} /> : <XCircle size={20} />}
                                <h4 style={{ margin: 0, fontWeight: 600 }}>{runResult.success ? t('trafficReplay.checksumsPassed') : t('trafficReplay.regressionDetected')}</h4>
                            </div>
                            <pre style={{
                                margin: 0,
                                padding: '1rem',
                                background: 'var(--bg-dark)',
                                color: 'var(--text-secondary)',
                                borderRadius: 'var(--radius-sm)',
                                overflowX: 'auto',
                                fontSize: '0.85rem',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'monospace'
                            }}>
                                {runResult.output || runResult.error}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Record Card */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UploadCloud size={18} style={{ color: 'var(--secondary)' }} />
                        {t('trafficReplay.recordBaseline')}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        {t('trafficReplay.recordDescription')}
                    </p>

                    <form onSubmit={handleRecord} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {t('trafficReplay.scenarioIdentity')}
                            </label>
                            <div className="input-with-icon" style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔖</span>
                                <Input
                                    required
                                    placeholder={t('trafficReplay.scenarioPlaceholder')}
                                    value={scenarioName}
                                    onChange={(e: any) => setScenarioName(e.target.value.replace(/[^a-zA-Z0-9_\-\.]/g, '_'))}
                                    style={{ padding: '0.75rem 1rem 0.75rem 2.8rem', fontSize: '0.95rem' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {t('trafficReplay.bindCallId')}
                            </label>
                            <div className="input-with-icon" style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔑</span>
                                <Input
                                    placeholder={t('trafficReplay.callIdPlaceholder')}
                                    value={targetCallId}
                                    onChange={(e: any) => setTargetCallId(e.target.value)}
                                    style={{ padding: '0.75rem 1rem 0.75rem 2.8rem', fontSize: '0.95rem' }}
                                />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                                {t('trafficReplay.callIdHint')}
                            </p>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {t('trafficReplay.traceFile')}
                            </label>
                            <Input
                                type="file"
                                required
                                accept=".pcap"
                                onChange={handleFileChange}
                                style={{ padding: '0.6rem 1rem', fontSize: '0.95rem', cursor: 'pointer' }}
                            />
                        </div>

                        <div style={{ marginTop: '0.5rem' }}>
                            <Button
                                type="submit"
                                disabled={isRecording || !file || !scenarioName}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem',
                                    fontSize: '1rem',
                                    fontWeight: 500,
                                    background: 'var(--bg-surface)',
                                    borderColor: 'var(--primary-light)',
                                    color: 'var(--primary)',
                                    ...((isRecording || !file || !scenarioName) ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                                }}
                                variant="secondary"
                            >
                                {isRecording ? <RefreshCw className="spin" size={18} /> : <UploadCloud size={18} />}
                                {isRecording ? t('trafficReplay.extracting') : t('trafficReplay.uploadGenerate')}
                            </Button>
                        </div>
                    </form>
                </div>

            </div>

            {/* Scenarios Table */}
            <div className="glass-panel" style={{ padding: '2rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{t('trafficReplay.scenariosDb')}</h3>
                    <span className="badge" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                        {scenarios.length} {t('trafficReplay.scenarios')}
                    </span>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <RefreshCw className="spin" size={24} />
                    </div>
                ) : (
                    <div className="table-container" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                        <Table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHeader style={{ background: 'var(--bg-surface)' }}>
                                <TableRow>
                                    <TableHead style={{ padding: '1rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>{t('trafficReplay.colScenarioName')}</TableHead>
                                    <TableHead style={{ padding: '1rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>{t('trafficReplay.colCallId')}</TableHead>
                                    <TableHead style={{ padding: '1rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>{t('trafficReplay.colCreatedAt')}</TableHead>
                                    <TableHead style={{ padding: '1rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>{t('trafficReplay.colArtifacts')}</TableHead>
                                    <TableHead style={{ padding: '1rem', textAlign: 'center', width: '80px', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>{t('trafficReplay.colActions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {scenarios.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                <Database size={32} style={{ opacity: 0.2 }} />
                                                {t('trafficReplay.noScenarios')}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : scenarios.map(s => (
                                    <TableRow key={s.name} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <TableCell style={{ padding: '1rem' }}><strong style={{ color: 'var(--text-primary)' }}>{s.name}</strong></TableCell>
                                        <TableCell style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{s.meta?.call_id || 'N/A'}</TableCell>
                                        <TableCell style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{new Date(s.createdAt).toLocaleString()}</TableCell>
                                        <TableCell style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>input.pcap</span>
                                                <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>snapshot.json</span>
                                            </div>
                                        </TableCell>
                                        <TableCell style={{ padding: '1rem', textAlign: 'center' }}>
                                            <Button className="-icon"
                                                style={{
                                                    color: 'var(--danger)',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    padding: '0.5rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    transition: 'background 0.2s'
                                                }}
                                                variant="ghost" size="icon" onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                                onClick={() => setDeleteConfirm({ isOpen: true, name: s.name })}
                                                title={t('trafficReplay.deleteScenarioTitle')}
                                            >
                                                <Trash2 size={18} />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            <ConfirmModal
                open={deleteConfirm.isOpen}
                title={t('trafficReplay.deleteScenarioTitle')}
                description={t('trafficReplay.deleteScenarioDesc', { name: deleteConfirm.name })}
                onConfirm={() => deleteConfirm.name && handleDelete(deleteConfirm.name)}
                onClose={() => setDeleteConfirm({ isOpen: false, name: null })}
            />
        </div>
    );
};
