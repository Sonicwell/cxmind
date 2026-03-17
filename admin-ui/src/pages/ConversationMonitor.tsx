import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import {
    Activity, Clock, CheckCircle,
    AlertCircle, Phone, MessageSquare, ShieldAlert, XCircle, ArrowRightLeft,
    Eye
} from 'lucide-react';
import { useWebSocket } from '../context/WebSocketContext';

import MetricCard from '../components/ui/MetricCard';
import ChartPanel from '../components/ui/ChartPanel';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { MiniChatMonitor } from '../components/ui/MiniChatMonitor';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import '../styles/dashboard.css';
import { Button } from '../components/ui/button';

interface MonitorSnapshot {
    timestamp: string;
    metrics: {
        queuedCount: number;
        activeCount: number;
        slaBreachedCount: number;
        resolvedToday: number;
    };
    agents: {
        agentId: string;
        displayName: string;
        status: string; // 'im_available', 'im_busy', 'im_offline'
        activeCount: number;
        capacity: number;
        activeCalls: number;
    }[];
    streams: {
        id: string;
        channel: string;
        status: string;
        assignedAgentId?: string;
        assignedAgentName?: string;
        visitorName?: string;
        queueTimeSeconds: number;
        activeTimeSeconds: number;
        isSlaBreached: boolean;
        intent?: string;
    }[];
}

const ConversationMonitor: React.FC = () => {
    const { t } = useTranslation();
    const { connected, subscribe } = useWebSocket();


    const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(Date.now());

    // Transfer Modal State
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [transferTargetConv, setTransferTargetConv] = useState<string | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<string>('');
    const [transferring, setTransferring] = useState(false);

    // Confirm Modal State
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null);

    // Monitor Workspace State (God Mode)
    const [activeMonitors, setActiveMonitors] = useState<string[]>([]);

    const fetchSnapshot = async () => {
        try {
            const res = await api.get('/conversations/monitor/overview');
            if (res.data?.data) {
                setSnapshot(res.data.data);
                setLastRefresh(Date.now());
            }
        } catch (error) {
            console.error('Failed to fetch monitor snapshot:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSnapshot();
        // WS在线时不轮询, 仅WS push失联时fallback
        if (connected) return;
        const interval = setInterval(fetchSnapshot, 5000);
        return () => clearInterval(interval);
    }, [connected]);

    // WS push事件
    useEffect(() => {
        const unsubscribe = subscribe('admin:monitor_snapshot', (msg: any) => {
            if (msg?.data) {
                setSnapshot(msg.data);
                setLastRefresh(Date.now());
            }
        });
        return () => unsubscribe();
    }, [subscribe]);

    const handleForceTransfer = async () => {
        if (!transferTargetConv || !selectedAgent) return;
        setTransferring(true);
        try {
            await api.post(`/api/conversations/${transferTargetConv}/force-transfer`, {
                targetAgentId: selectedAgent
            });
            toast.success(t('conversationMonitor.transferSuccess'));
            setTransferModalOpen(false);
            setTransferTargetConv(null);
            setSelectedAgent('');
            fetchSnapshot();
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('conversationMonitor.transferFailed'));
        } finally {
            setTransferring(false);
        }
    };

    const handleForceClose = async () => {
        if (!confirmTargetId) return;
        try {
            await api.post(`/api/conversations/${confirmTargetId}/resolve`, { reason: 'admin_forced' });
            toast.success(t('conversationMonitor.closeSuccess'));
            fetchSnapshot();
        } catch (error: any) {
            toast.error(t('conversationMonitor.closeFailed'));
        } finally {
            setConfirmModalOpen(false);
            setConfirmTargetId(null);
        }
    };

    const handleMonitorAgent = (agentId: string) => {
        const agentDisplayName = agents.find(a => a.agentId === agentId)?.displayName;
        const agentStreams = streams.filter(s => s.assignedAgentId === agentId || (s.assignedAgentName && s.assignedAgentName === agentDisplayName));

        if (agentStreams.length === 0) {
            toast(t('conversationMonitor.noActiveStreams'), { icon: 'ℹ️' });
            return;
        }

        setActiveMonitors(prev => {
            const newMonitors = new Set(prev);
            agentStreams.forEach(s => newMonitors.add(s.id));
            const result = Array.from(newMonitors).slice(0, 6);
            if (newMonitors.size > 6) {
                toast.success(t('conversationMonitor.workspaceFull'));
            }
            return result;
        });
    };

    const toggleMonitor = (streamId: string) => {
        setActiveMonitors(prev => {
            if (prev.includes(streamId)) {
                return prev.filter(id => id !== streamId);
            }
            if (prev.length >= 6) {
                toast.error(t('conversationMonitor.maxMonitors'));
                return prev;
            }
            return [...prev, streamId];
        });
    };

    const { queuedCount = 0, activeCount = 0, slaBreachedCount = 0, resolvedToday = 0 } = snapshot?.metrics || {};
    const metrics = { queuedCount, activeCount, slaBreachedCount, resolvedToday };
    const agents = snapshot?.agents || [];
    const streams = snapshot?.streams || [];

    const formatDuration = (seconds: number) => {
        if (!seconds) return '0s';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>

            {/* Standard Dashboard Panel - Shrinks when God Mode is active */}
            <div
                className="p-6 flex flex-col overflow-y-auto"
                style={{
                    flex: activeMonitors.length > 0 ? '0 0 55%' : '1 1 100%',
                    gap: '1.5rem',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    borderRight: activeMonitors.length > 0 ? '1px solid var(--border-light)' : 'none',
                    background: 'var(--bg-base)'
                }}
            >
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="font-semibold mb-1" style={{ fontSize: '1.5rem', color: 'var(--text-primary)' }}>{t('conversationMonitor.title')}</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('conversationMonitor.subtitle')}</p>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="status-dot pulsing-dot" style={{ background: 'var(--success)' }}></span>
                        {t('conversationMonitor.liveSync', { time: new Date(lastRefresh).toLocaleTimeString() })}
                    </div>
                </div>

                {/* KPI Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <MetricCard
                        label={t('conversationMonitor.waitingQueue')}
                        value={metrics.queuedCount.toString()}
                        icon={<Clock size={16} />}
                        sub={metrics.queuedCount > 10 ? t('conversationMonitor.high') : t('conversationMonitor.normal')}
                        color={metrics.queuedCount > 0 ? "var(--warning)" : "var(--primary)"}
                    />
                    <MetricCard
                        label={t('conversationMonitor.activeSessions')}
                        value={metrics.activeCount.toString()}
                        icon={<Activity size={16} />}
                        color="var(--primary)"
                    />
                    <MetricCard
                        label={t('conversationMonitor.slaBreached')}
                        value={metrics.slaBreachedCount.toString()}
                        icon={<AlertCircle size={16} />}
                        color={metrics.slaBreachedCount > 0 ? "var(--danger)" : "var(--success)"}
                    />
                    <MetricCard
                        label={t('conversationMonitor.resolvedToday')}
                        value={metrics.resolvedToday.toString()}
                        icon={<CheckCircle size={16} />}
                        color="var(--success)"
                    />
                </div>

                {/* Main Content Grid */}
                <div className="flex" style={{ flexWrap: 'wrap', gap: '1.5rem', flex: 1, minHeight: 0 }}>
                    {/* Left Col: Agent Load */}
                    <div className="flex flex-col" style={{ flex: '1 1 300px', gap: '1rem' }}>
                        <ChartPanel title={t('conversationMonitor.agentLoad')}>
                            <div className="flex flex-col overflow-y-auto custom-scrollbar" style={{ gap: '1rem', maxHeight: '500px', paddingRight: '0.5rem' }}>
                                {agents.length === 0 && !loading && (
                                    <div className="text-center" style={{ padding: '2rem 0', color: 'var(--text-muted)' }}>{t('conversationMonitor.noAgentsOnline')}</div>
                                )}
                                {agents.map(agent => (
                                    <div key={agent.agentId} className="flex flex-col border" style={{ gap: '0.5rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)', borderColor: 'var(--border-light)', background: 'var(--bg-card)' }}>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center" style={{ gap: '0.5rem' }}>
                                                <div style={{ position: 'relative' }}>
                                                    <div className="flex items-center justify-center font-bold" style={{ width: '32px', height: '32px', borderRadius: '50%', fontSize: '0.75rem', background: 'var(--glass-border)', color: 'var(--text-primary)' }}>
                                                        {agent.displayName.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <Activity size={12} style={{ position: 'absolute', bottom: -2, right: -2, color: agent.status === 'im_busy' ? 'var(--warning)' : (agent.status === 'im_available' ? 'var(--success)' : 'var(--text-muted)') }} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium" style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{agent.displayName}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {agent.status === 'im_busy' ? t('conversationMonitor.statusBusy') : (agent.status === 'im_available' ? t('conversationMonitor.statusAvailable') : t('conversationMonitor.statusOffline'))}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center" style={{ gap: '0.5rem' }}>
                                                {agent.activeCalls > 0 && (
                                                    <div className="flex items-center rounded" style={{ gap: '0.25rem', fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'hsla(var(--danger-hue), var(--danger-sat), 50%, 0.1)', color: 'var(--danger)' }}>
                                                        <Phone size={10} className="animate-pulse" /> {t('conversationMonitor.inCall')}
                                                    </div>
                                                )}
                                                {/* Global Monitor Button for Agent */}
                                                <Button
                                                    onClick={() => handleMonitorAgent(agent.agentId)}
                                                    title={t('conversationMonitor.monitorAllAgentStreams')}
                                                    style={{
                                                        background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: '4px', padding: '4px', color: 'var(--primary-color)', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}
                                                >
                                                    <Eye size={14} />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Capacity Bar */}
                                        <div className="w-full overflow-hidden" style={{ height: '0.5rem', borderRadius: '9999px', marginTop: '0.25rem', background: 'var(--bg-light)' }}>
                                            <div
                                                className="h-full transition-all"
                                                style={{
                                                    borderRadius: '9999px',
                                                    transitionDuration: '500ms',
                                                    width: `${Math.min(100, (agent.activeCount / Math.max(1, agent.capacity)) * 100)}%`,
                                                    background: agent.activeCount >= agent.capacity ? 'var(--danger)' : 'var(--primary)'
                                                }}
                                            />
                                        </div>
                                        <div className="flex justify-between" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <span>{t('conversationMonitor.capacityLabel', { active: agent.activeCount, capacity: agent.capacity })}</span>
                                            <span>{t('conversationMonitor.loadLabel', { percent: Math.round((agent.activeCount / Math.max(1, agent.capacity)) * 100) })}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ChartPanel>
                    </div>

                    {/* Right Col: Live Streams */}
                    <div className="flex flex-col" style={{ flex: '2 1 500px', gap: '1rem' }}>
                        <ChartPanel title={t('conversationMonitor.liveStreams')} style={{ flex: 1 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <Table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <TableHeader>
                                        <TableRow style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                                            <TableHead style={{ paddingBottom: '0.75rem', paddingLeft: '1rem', paddingRight: '1rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{t('conversationMonitor.colChannel')}</TableHead>
                                            <TableHead style={{ paddingBottom: '0.75rem', paddingLeft: '1rem', paddingRight: '1rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{t('conversationMonitor.colCustomer')}</TableHead>
                                            <TableHead style={{ paddingBottom: '0.75rem', paddingLeft: '1rem', paddingRight: '1rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{t('conversationMonitor.colStatus')}</TableHead>
                                            <TableHead style={{ paddingBottom: '0.75rem', paddingLeft: '1rem', paddingRight: '1rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{t('conversationMonitor.colDuration')}</TableHead>
                                            <TableHead style={{ paddingBottom: '0.75rem', paddingLeft: '1rem', paddingRight: '1rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{t('conversationMonitor.colAgent')}</TableHead>
                                            <TableHead style={{ paddingBottom: '0.75rem', paddingLeft: '1rem', paddingRight: '1rem', fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>{t('conversationMonitor.colActions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {streams.length === 0 && !loading && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center" style={{ padding: '2rem 0', color: 'var(--text-muted)' }}>
                                                    {t('conversationMonitor.noConversations')}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {streams.map(stream => (
                                            <TableRow key={stream.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.2s', ...((activeMonitors.includes(stream.id)) ? { background: 'var(--primary-glow)' } : {}) }}>
                                                <TableCell style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                                    <div className="flex items-center" style={{ gap: '0.5rem' }}>
                                                        {stream.channel === 'whatsapp' ? <MessageSquare size={14} color="#25D366" /> : <MessageSquare size={14} color="var(--primary)" />}
                                                        <span style={{ textTransform: 'capitalize' }}>{stream.channel}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                                    <div className="flex items-center" style={{ gap: '0.5rem' }}>
                                                        <span>{stream.visitorName || t('conversationMonitor.unknownVisitor')}</span>
                                                        {stream.intent && <span className="rounded shadow-sm" style={{ fontSize: '0.65rem', padding: '0.125rem 0.375rem', background: 'var(--glass-border)', border: '1px solid var(--border-light)' }}>{stream.intent}</span>}
                                                    </div>
                                                </TableCell>
                                                <TableCell style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                                    {stream.status === 'queued' ? (
                                                        <span className="flex items-center" style={{ gap: '0.25rem', color: stream.isSlaBreached ? 'var(--danger)' : 'var(--warning)' }}>
                                                            <Clock size={12} /> {t('conversationMonitor.statusQueued')}
                                                            {stream.isSlaBreached && <ShieldAlert size={12} style={{ marginLeft: '0.25rem' }} />}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center" style={{ gap: '0.25rem', color: 'var(--success)' }}>
                                                            <Activity size={12} /> {t('conversationMonitor.statusActive')}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {stream.status === 'queued' ? formatDuration(stream.queueTimeSeconds) : formatDuration(stream.activeTimeSeconds)}
                                                </TableCell>
                                                <TableCell style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {stream.assignedAgentName || '-'}
                                                </TableCell>
                                                <TableCell style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div className="flex" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                        <Button
                                                            title={t('conversationMonitor.bargeInBtn')}
                                                            onClick={() => toggleMonitor(stream.id)}
                                                            style={{
                                                                padding: '0.375rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                                                                background: activeMonitors.includes(stream.id) ? 'var(--primary-color-alpha)' : 'transparent',
                                                                color: activeMonitors.includes(stream.id) ? 'var(--primary-color)' : 'var(--text-muted)'
                                                            }}
                                                        >
                                                            <Eye size={16} />
                                                        </Button>
                                                        <Button
                                                            title={t('conversationMonitor.transferBtn')}
                                                            onClick={() => {
                                                                setTransferTargetConv(stream.id);
                                                                setTransferModalOpen(true);
                                                            }}
                                                            style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none', color: 'var(--chart-blue)', cursor: 'pointer' }}
                                                        >
                                                            <ArrowRightLeft size={16} />
                                                        </Button>
                                                        <Button
                                                            title={t('conversationMonitor.closeBtn')}
                                                            onClick={() => {
                                                                setConfirmTargetId(stream.id);
                                                                setConfirmModalOpen(true);
                                                            }}
                                                            style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                                                        >
                                                            <XCircle size={16} />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </ChartPanel>
                    </div>
                </div>

                {/* Transfer Modal */}
                {transferModalOpen && (
                    <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
                        <div className="glass-card" style={{ width: '100%', maxWidth: '28rem', padding: '1.5rem', background: 'var(--bg-card)' }}>
                            <h3 className="font-semibold" style={{ fontSize: '1.125rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>{t('conversationMonitor.transferModalTitle')}</h3>
                            <p style={{ fontSize: '0.875rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>{t('conversationMonitor.transferModalDesc')}</p>

                            <div className="flex flex-col custom-scrollbar" style={{ gap: '0.75rem', marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                                {agents.map(agent => (
                                    <Button
                                        key={agent.agentId}
                                        onClick={() => setSelectedAgent(agent.agentId)}
                                        className="flex items-center justify-between"
                                        style={{
                                            padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'left',
                                            transition: 'all 0.2s', border: `1px solid ${selectedAgent === agent.agentId ? 'var(--primary)' : 'var(--glass-border)'}`,
                                            background: selectedAgent === agent.agentId ? 'var(--primary-glow)' : 'transparent'
                                        }}
                                    >
                                        <div className="flex items-center" style={{ gap: '0.75rem' }}>
                                            <div className="flex items-center justify-center font-bold" style={{ width: '32px', height: '32px', borderRadius: '50%', fontSize: '0.75rem', background: 'var(--bg-light)', color: 'var(--text-primary)' }}>
                                                {agent.displayName.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>{agent.displayName}</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                    {agent.activeCount >= agent.capacity ? t('conversationMonitor.fullCapacity') : t('conversationMonitor.slotsAvailable', { slots: agent.capacity - agent.activeCount })}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: agent.status === 'im_available' ? 'var(--success)' : (agent.status === 'im_busy' ? 'var(--warning)' : 'var(--text-muted)') }} />
                                    </Button>
                                ))}
                            </div>

                            <div className="flex justify-end" style={{ gap: '0.75rem' }}>
                                <Button
                                    onClick={() => { setTransferModalOpen(false); setSelectedAgent(''); setTransferTargetConv(null); }}
                                    className="font-medium"
                                    style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    onClick={handleForceTransfer}
                                    disabled={!selectedAgent || transferring}
                                    className="font-medium"
                                    style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s', background: 'var(--primary)', color: 'white', border: 'none', opacity: (!selectedAgent || transferring) ? 0.5 : 1 }}
                                >
                                    {transferring ? t('conversationMonitor.transferring') : t('conversationMonitor.confirmTransfer')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                <ConfirmModal
                    open={confirmModalOpen}
                    onClose={() => {
                        setConfirmModalOpen(false);
                        setConfirmTargetId(null);
                    }}
                    onConfirm={handleForceClose}
                    title={t('conversationMonitor.closeModalTitle')}
                    description={t('conversationMonitor.closeModalDesc')}
                    isDanger={true}
                    confirmText={t('conversationMonitor.confirmClose')}
                />
            </div>

            {/* Right/Bottom Side: God Mode Workspace */}
            {activeMonitors.length > 0 && (
                <div style={{
                    flex: '1 1 45%',
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
                    padding: '1.5rem',
                    overflowY: 'auto',
                    display: 'grid',
                    gridTemplateColumns: activeMonitors.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '1.5rem',
                    alignContent: 'start',
                    boxShadow: 'inset 20px 0 30px -20px rgba(0,0,0,0.5)'
                }}>
                    {activeMonitors.map(id => {
                        const streamData = streams.find(s => s.id === id);
                        return (
                            <MiniChatMonitor
                                key={id}
                                streamId={id}
                                channel={(streamData?.channel as any) || 'webchat'}
                                agentName={streamData?.assignedAgentName || '-'}
                                customerName={streamData?.visitorName || t('conversationMonitor.unknownVisitor')}
                                isSlaBreached={streamData?.status === 'queued' && (streamData?.queueTimeSeconds || 0) > 60}
                                onClose={toggleMonitor}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ConversationMonitor;
