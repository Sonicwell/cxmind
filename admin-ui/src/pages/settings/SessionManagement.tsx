import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { OrganicCard } from '../../components/ui/OrganicCard';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Shield, Smartphone, Monitor, Globe, LogOut, Loader, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../components/ui/button';

interface Session {
    id: string;
    userAgent: string;
    ipAddress: string;
    lastActive: string;
    expiresAt: string;
}

const SessionManagement: React.FC = () => {
    const { t } = useTranslation();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, id: string | null }>({ isOpen: false, id: null });

    const fetchSessions = async () => {
        try {
            setIsLoading(true);
            const response = await api.get('/auth/sessions');
            setSessions(response.data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch active sessions');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleRevoke = async (id: string) => {
        try {
            setRevokingId(id);
            await api.delete(`/auth/sessions/${id}`);
            // Refresh list
            fetchSessions();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to revoke session');
        } finally {
            setRevokingId(null);
            setConfirmModal({ isOpen: false, id: null });
        }
    };

    const parseUserAgent = (uaString: string) => {
        const isMobile = /Mobile|Android|iP(ad|hone)/.test(uaString);
        let browser = 'Unknown Browser';
        if (uaString.includes('Firefox')) browser = 'Firefox';
        else if (uaString.includes('Edg')) browser = 'Edge';
        else if (uaString.includes('Chrome')) browser = 'Chrome';
        else if (uaString.includes('Safari')) browser = 'Safari';

        return {
            isMobile,
            browser,
            os: uaString.includes('Windows') ? 'Windows' : uaString.includes('Mac OS') ? 'macOS' : uaString.includes('Linux') ? 'Linux' : 'Unknown OS'
        };
    };

    if (isLoading && sessions.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Shield className="text-primary" />
                        {t('settings.sessions.title', 'Active Sessions')}
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        {t('settings.sessions.subtitle', 'Manage your active sign-ins across different devices.')}
                    </p>
                </div>
                <Button
                    onClick={fetchSessions}
                    className="flex text-sm items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                >
                    <Search size={16} />
                    {t('common.refresh', 'Refresh')}
                </Button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {sessions.map((session, index) => {
                    const uaInfo = parseUserAgent(session.userAgent);
                    const isCurrentSession = index === 0; // Assuming the most recently active token (the one we just used to fetch) is index 0. A better way is matching the current stored token id, but we don't return token IDs to the frontend for security, so "last used" is the best proxy.

                    return (
                        <OrganicCard key={session.id} className="p-5 flex items-start justify-between">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-xl ${isCurrentSession ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                                    {uaInfo.isMobile ? <Smartphone size={24} /> : <Monitor size={24} />}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                        {uaInfo.os} - {uaInfo.browser}
                                        {isCurrentSession && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 font-medium border border-green-200 dark:border-green-800">
                                                {t('settings.sessions.current', 'Current Device')}
                                            </span>
                                        )}
                                    </h3>
                                    <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                        <div className="flex items-center gap-1.5">
                                            <Globe size={14} className="opacity-70" />
                                            {session.ipAddress || 'Unknown IP'}
                                        </div>
                                        <div>
                                            {t('settings.sessions.lastActive', 'Last Active:')} {formatDistanceToNow(new Date(session.lastActive), { addSuffix: true })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {!isCurrentSession && (
                                <Button
                                    onClick={() => setConfirmModal({ isOpen: true, id: session.id })}
                                    disabled={revokingId === session.id}
                                    className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                                >
                                    {revokingId === session.id ? (
                                        <Loader size={16} className="animate-spin" />
                                    ) : (
                                        <LogOut size={16} />
                                    )}
                                    {t('settings.sessions.revoke', 'Sign Out')}
                                </Button>
                            )}
                        </OrganicCard>
                    );
                })}

                {sessions.length === 0 && !isLoading && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                        {t('settings.sessions.noActive', 'No active sessions found.')}
                    </div>
                )}
            </div>

            <ConfirmModal
                open={confirmModal.isOpen}
                title={t('settings.sessions.revokeTitle', 'Sign Out Session')}
                description={t('settings.sessions.revokeConfirm', 'Are you sure you want to log out this session?')}
                onConfirm={() => confirmModal.id && handleRevoke(confirmModal.id)}
                onClose={() => setConfirmModal({ isOpen: false, id: null })}
            />
        </div>
    );
};

export default SessionManagement;
