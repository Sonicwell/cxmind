import React, { useEffect, useState, useRef } from 'react';
import { MessageSquare, Phone, X, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import './MiniChatMonitor.css';

import { Button } from './button';

interface Message {
    id: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: string;
    isTyping?: boolean;
    audioLevel?: number;
}

interface MiniChatMonitorProps {
    streamId: string;
    agentName?: string;
    customerName?: string;
    channel: 'whatsapp' | 'webchat' | 'sms' | 'voice' | 'email';
    isSlaBreached?: boolean;
    onClose: (id: string) => void;
}

// Typing Indicator Sub-Component
const TypingIndicator = () => (
    <div className="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
    </div>
);

// Audio Waveform Sub-Component
const AudioWaveform = ({ level = 50 }: { level?: number }) => {
    // Generate bars that react to the audio level
    const bars = Array.from({ length: 10 }).map((_, i) => {
        const height = Math.random() * (level / 100) * 20 + 4; // Min 4px, height scales with level
        return (
            <div
                key={i}
                className="waveform-bar"
                style={{
                    height: `${height}px`,
                    animationDelay: `${i * 0.1}s`
                }}
            />
        );
    });

    return <div className="audio-waveform">{bars}</div>;
};

export const MiniChatMonitor: React.FC<MiniChatMonitorProps> = ({
    streamId,
    agentName = 'Agent',
    customerName = 'Customer',
    channel,
    isSlaBreached = false,
    onClose
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial fetch
    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const res = await api.get(`/api/conversations/${streamId}/messages`);
                const msgData = res.data?.data || res.data || [];
                setMessages(Array.isArray(msgData) ? msgData : []);
            } catch (error) {
                console.error('Failed to fetch messages for monitor:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMessages();

        // 降频 + 页面不可见时暂停
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchMessages();
            }
        }, 10_000);

        return () => clearInterval(interval);
    }, [streamId]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const isVoice = channel === 'voice';

    return (
        <div className={`mini-chat-monitor glass-card ${isSlaBreached ? 'sla-breach-pulse' : ''}`}>
            {/* Header */}
            <div className="monitor-header">
                <div className="header-info">
                    <span className="channel-icon">
                        {isVoice ? <Phone size={14} /> : <MessageSquare size={14} />}
                    </span>
                    <div className="names">
                        <span className="customer-name">{customerName}</span>
                        <span className="separator">•</span>
                        <span className="agent-name">{agentName}</span>
                    </div>
                </div>

                <div className="header-actions">
                    {isSlaBreached && (
                        <div className="sla-warning" title="SLA Breached">
                            <AlertCircle size={14} className="warning-icon" />
                            <span>SLA Breach</span>
                        </div>
                    )}
                    <Button className="close-" onClick={() => onClose(streamId)}>
                        <X size={16} />
                    </Button>
                </div>
            </div>

            {/* Conversation Area */}
            <div className="monitor-body custom-scrollbar" ref={scrollRef}>
                {loading && messages.length === 0 ? (
                    <div className="loading-state">Syncing stream...</div>
                ) : (
                    <div className="messages-list">
                        {messages.map((msg) => {
                            const isUser = msg.role === 'user';

                            // Handling real-time dynamic states simulated by the mock
                            if (msg.isTyping) {
                                return (
                                    <div key={msg.id} className="message-wrapper agent">
                                        <div className="message-bubble typing-bubble">
                                            <TypingIndicator />
                                        </div>
                                    </div>
                                );
                            }

                            if (msg.audioLevel !== undefined && msg.content === '') {
                                return (
                                    <div key={msg.id} className="message-wrapper agent">
                                        <div className="message-bubble audio-bubble">
                                            <AudioWaveform level={msg.audioLevel} />
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={msg.id} className={`message-wrapper ${isUser ? 'user' : 'agent'}`}>
                                    <div className="message-bubble">
                                        {msg.content}
                                    </div>
                                    {/* Only show time on last message or messages far apart */}
                                    <div className="message-time">
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer Status Line */}
            <div className="monitor-footer">
                <div className="connection-status">
                    <span className="pulse-dot"></span>
                    Live Syncing
                </div>
            </div>
        </div>
    );
};
