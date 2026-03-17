import React, { useEffect, useState, useRef } from 'react';
import { Activity, Pause, Play, Trash2 } from 'lucide-react';
import { formatUTCToLocal } from '../../utils/date';
import type { AuditLog } from '../../types/audit';
import { Button } from '../ui/button';

interface RealtimeAuditFeedProps {
    socket?: any; // WebSocket instance
}

const MAX_EVENTS = 100;

const CATEGORY_COLORS = {
    auth: 'border-l-blue-500',
    user_management: 'border-l-green-500',
    client_management: 'border-l-purple-500',
    agent_management: 'border-l-yellow-500',
    call_access: 'border-l-red-500',
    knowledge_base: 'border-l-cyan-500',
    ai_config: 'border-l-pink-500',
    monitoring: 'border-l-indigo-500',
    mfa: 'border-l-teal-500',
};

const RealtimeAuditFeed: React.FC<RealtimeAuditFeedProps> = ({ socket }) => {
    const [events, setEvents] = useState<AuditLog[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const [autoScroll] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!socket) return;

        const handleNewAudit = (event: AuditLog) => {
            if (!isPaused) {
                setEvents((prev) => {
                    const newEvents = [event, ...prev];
                    return newEvents.slice(0, MAX_EVENTS);
                });
            }
        };

        socket.on('audit:new', handleNewAudit);

        return () => {
            socket.off('audit:new', handleNewAudit);
        };
    }, [socket, isPaused]);

    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [events, autoScroll]);

    const handleClear = () => {
        setEvents([]);
    };

    const handleTogglePause = () => {
        setIsPaused(!isPaused);
    };

    return (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Activity size={20} className="text-blue-400" />
                    <h3 className="text-lg font-semibold text-white">Real-time Audit Feed</h3>
                    {!isPaused && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                            Live
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleTogglePause}
                        className="flex items-center gap-1 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                    >
                        {isPaused ? (
                            <>
                                <Play size={14} />
                                Resume
                            </>
                        ) : (
                            <>
                                <Pause size={14} />
                                Pause
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={handleClear}
                        disabled={events.length === 0}
                        className="flex items-center gap-1 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={14} />
                        Clear
                    </Button>
                </div>
            </div>

            {/* Event Count */}
            <div className="mb-4 text-sm text-gray-400">
                {events.length} event{events.length !== 1 ? 's' : ''} (max {MAX_EVENTS})
            </div>

            {/* Events List */}
            <div
                ref={containerRef}
                className="space-y-2 max-h-96 overflow-y-auto"
            >
                {events.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                        {isPaused ? 'Feed paused' : 'Waiting for audit events...'}
                    </div>
                ) : (
                    events.map((event, index) => (
                        <div
                            key={`${event.timestamp}-${index}`}
                            className={`bg-gray-700/50 rounded-lg p-3 border-l-4 ${CATEGORY_COLORS[event.category as keyof typeof CATEGORY_COLORS] || 'border-l-gray-500'} animate-fade-in`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium text-gray-400">
                                            {event.category.replace('_', ' ').toUpperCase()}
                                        </span>
                                        <span className="text-gray-500">•</span>
                                        <span className="text-sm text-white">{event.action}</span>
                                        {event.success === 0 && (
                                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                                                Failed
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-300">
                                        {event.operator_name}
                                        {event.target_name && (
                                            <>
                                                <span className="text-gray-500 mx-1">→</span>
                                                {event.target_name}
                                            </>
                                        )}
                                    </div>
                                    {event.failure_reason && (
                                        <div className="mt-1 text-xs text-red-400">
                                            {event.failure_reason}
                                        </div>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500 whitespace-nowrap ml-4">
                                    {formatUTCToLocal(event.timestamp, 'HH:mm:ss')}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
        </div>
    );
};

export default RealtimeAuditFeed;
