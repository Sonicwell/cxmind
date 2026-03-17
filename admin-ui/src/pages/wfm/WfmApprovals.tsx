import React, { useState, useEffect } from 'react';
import { Check, X, Clock, Calendar, ArrowRightLeft, Clock4, PartyPopper } from 'lucide-react';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

interface ApprovalRequest {
    id: string;
    agentName: string;
    type: 'Time Off' | 'Shift Swap' | 'Overtime';
    details: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: string;
    avatarUrl?: string;
}

const WfmApprovals: React.FC = () => {
    const { t } = useTranslation();
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [animatingId, setAnimatingId] = useState<string | null>(null);
    const [animDirection, setAnimDirection] = useState<'left' | 'right' | null>(null);

    useEffect(() => {
        const isDemo = import.meta.env.VITE_MOCK_MODE === 'true' || localStorage.getItem('cxmind:demo-mode') === 'true';
        if (isDemo) {
            const getAvatar = (name: string) => {
                return `https://api.dicebear.com/9.x/micah/svg?seed=${encodeURIComponent(name)}&backgroundColor=transparent`;
            };

            setRequests([
                { id: '1', agentName: 'Sarah Jenkins', type: 'Time Off', details: 'Medical Appointment on Oct 14, 09:00 - 12:00', status: 'pending', submittedAt: '2 hours ago', avatarUrl: getAvatar('Sarah Jenkins') },
                { id: '2', agentName: 'David Chen', type: 'Shift Swap', details: 'Swap Friday Evening (18:00 - 22:00) with Agent 8', status: 'pending', submittedAt: '4 hours ago', avatarUrl: getAvatar('David Chen') },
                { id: '3', agentName: 'Marcus Wright', type: 'Overtime', details: 'Willing to take 2 extra hours on Saturday Peak', status: 'pending', submittedAt: '1 day ago', avatarUrl: getAvatar('Marcus Wright') },
                { id: '4', agentName: 'Elena Rodriguez', type: 'Time Off', details: 'Family Emergency - Requesting tomorrow off', status: 'pending', submittedAt: '3 hours ago', avatarUrl: getAvatar('Elena Rodriguez') }
            ]);
        } else {
            // Real API: fetch pending requests
            api.get('/platform/wfm/requests?status=pending').then((res: any) => {
                const data = res?.data || [];
                setRequests(data.map((r: any) => ({
                    id: r._id,
                    agentName: r.agentName || r.agentId || 'Agent',
                    type: r.type || 'Time Off',
                    details: r.details || r.reason || '',
                    status: r.status,
                    submittedAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '',
                })));
            }).catch(() => setRequests([]));
        }
    }, []);

    const pendingRequests = requests.filter(r => r.status === 'pending');
    const currentReq = pendingRequests.length > 0 ? pendingRequests[0] : null;

    const handleAction = async (id: string, action: 'approved' | 'rejected') => {
        if (animatingId) return;

        setAnimDirection(action === 'approved' ? 'right' : 'left');
        setAnimatingId(id);

        // Call real API for non-demo mode
        const isDemo = import.meta.env.VITE_MOCK_MODE === 'true' || localStorage.getItem('cxmind:demo-mode') === 'true';
        if (!isDemo) {
            try {
                const endpoint = action === 'approved' ? 'approve' : 'reject';
                await api.patch(`/platform/wfm/requests/${id}/${endpoint}`, {});
            } catch (e) {
                console.error('Failed to update request:', e);
            }
        }

        setTimeout(() => {
            setRequests(prev => prev.map(req => req.id === id ? { ...req, status: action } : req));
            setAnimatingId(null);
            setAnimDirection(null);
        }, 300);
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'Time Off': return <Calendar size={20} color="#3b82f6" />;
            case 'Shift Swap': return <ArrowRightLeft size={20} color="#a855f7" />;
            case 'Overtime': return <Clock4 size={20} color="#f59e0b" />;
            default: return <Clock size={20} />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'Time Off': return '#3b82f6';
            case 'Shift Swap': return '#a855f7';
            case 'Overtime': return '#f59e0b';
            default: return 'var(--text-secondary)';
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            <div style={{ marginBottom: '32px', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '8px', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{t('wfmApprovals.title')}</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.125rem' }}>
                    {pendingRequests.length > 0
                        ? t('wfmApprovals.pendingCount', { count: pendingRequests.length })
                        : t('wfmApprovals.allCaughtUp')}
                </p>
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '4vh' }}>
                {currentReq ? (
                    <div style={{ position: 'relative', width: '100%', maxWidth: '480px' }}>
                        {/* Fake background cards for stack effect */}
                        {pendingRequests.length > 1 && (
                            <div style={{
                                position: 'absolute', top: '12px', left: '12px', right: '-12px', height: '100%',
                                backgroundColor: 'var(--bg-secondary)', borderRadius: '24px', zIndex: 0, opacity: 0.5, border: '1px solid var(--border-color)',
                                transform: 'scale(0.95)'
                            }} />
                        )}
                        {pendingRequests.length > 2 && (
                            <div style={{
                                position: 'absolute', top: '24px', left: '24px', right: '-24px', height: '100%',
                                backgroundColor: 'var(--bg-secondary)', borderRadius: '24px', zIndex: -1, opacity: 0.25, border: '1px solid var(--border-color)',
                                transform: 'scale(0.9)'
                            }} />
                        )}

                        <div
                            className="glass-card"
                            style={{
                                position: 'relative',
                                zIndex: 10,
                                borderRadius: '24px',
                                padding: '32px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: animatingId === currentReq.id
                                    ? `translateX(${animDirection === 'right' ? '150%' : '-150%'}) rotate(${animDirection === 'right' ? '15deg' : '-15deg'})`
                                    : 'translateX(0) rotate(0)',
                                opacity: animatingId === currentReq.id ? 0 : 1
                            }}
                        >
                            {/* Card Header (Avatar & Name) */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                                <div style={{
                                    width: '96px', height: '96px', borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 700,
                                    color: 'transparent', border: '4px solid var(--bg-primary)',
                                    boxShadow: '0 0 0 2px var(--border-color)', marginBottom: '16px',
                                    backgroundImage: currentReq.avatarUrl ? `url(${currentReq.avatarUrl})` : 'none',
                                    backgroundSize: 'cover', backgroundPosition: 'center',
                                    overflow: 'hidden'
                                }}>
                                </div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{currentReq.agentName}</h2>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>{t('wfmApprovals.submitted')} {currentReq.submittedAt}</span>
                            </div>

                            {/* Request Type Badge */}
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '8px 16px', borderRadius: '9999px',
                                backgroundColor: `${getTypeColor(currentReq.type)}15`,
                                border: `1px solid ${getTypeColor(currentReq.type)}30`,
                                color: getTypeColor(currentReq.type),
                                fontWeight: 600,
                                marginBottom: '24px'
                            }}>
                                {getTypeIcon(currentReq.type)}
                                {currentReq.type}
                            </div>

                            {/* Request Details */}
                            <div style={{
                                backgroundColor: 'var(--bg-primary)', padding: '24px', borderRadius: '16px',
                                width: '100%', textAlign: 'center', border: '1px solid var(--border-color)',
                                marginBottom: '32px'
                            }}>
                                <p style={{ fontSize: '1.125rem', lineHeight: 1.6, margin: 0, color: 'var(--text-primary)' }}>
                                    "{currentReq.details}"
                                </p>
                            </div>

                            {/* Action Buttons (Swipe emulation) */}
                            <div style={{ display: 'flex', gap: '32px', justifyContent: 'center', width: '100%' }}>
                                <Button
                                    onClick={() => handleAction(currentReq.id, 'rejected')}
                                    style={{
                                        width: '72px', height: '72px', borderRadius: '50%', border: '2px solid #ef4444',
                                        backgroundColor: 'transparent', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
                                    title="Reject Request"
                                >
                                    <X size={36} strokeWidth={2.5} />
                                </Button>

                                <Button
                                    onClick={() => handleAction(currentReq.id, 'approved')}
                                    style={{
                                        width: '72px', height: '72px', borderRadius: '50%', border: '2px solid #10b981',
                                        backgroundColor: 'transparent', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
                                    title="Approve Request"
                                >
                                    <Check size={36} strokeWidth={2.5} />
                                </Button>
                            </div>

                            <div style={{ marginTop: '24px', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {t('wfmApprovals.keyboard')}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: '64px', textAlign: 'center', borderRadius: '24px', maxWidth: '480px', width: '100%' }}>
                        <div style={{
                            width: '96px', height: '96px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: '#10b981'
                        }}>
                            <PartyPopper size={48} strokeWidth={1.5} />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>{t('wfmApprovals.inboxZero')}</h2>
                        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {t('wfmApprovals.inboxZeroDesc')}
                        </p>
                    </div>
                )}
            </div>

            {/* Keyboard Listener effect for an actual swipe feel */}
            <KeyDownHandler currentReqId={currentReq?.id} handleAction={handleAction} />
        </div>
    );
};

// 提到外面避免re-render时反复挂listener
const KeyDownHandler: React.FC<{ currentReqId?: string, handleAction: (id: string, action: 'approved' | 'rejected') => void }> = ({ currentReqId, handleAction }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!currentReqId) return;
            if (e.key === 'ArrowLeft') handleAction(currentReqId, 'rejected');
            if (e.key === 'ArrowRight') handleAction(currentReqId, 'approved');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentReqId, handleAction]);
    return null;
};

export default WfmApprovals;
