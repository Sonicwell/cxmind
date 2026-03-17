import { Users, User, Bell, MessageCircle } from "lucide-react";

interface ChatChannel {
    id: string;
    name: string;
    type: 'p2p' | 'group' | 'broadcast' | 'inbox';
    unreadCount: number;
    lastMessage?: string;
    timestamp?: string;
}

interface ChatListProps {
    channels: ChatChannel[];
    activeChannelId: string | null;
    onSelectChannel: (channelId: string) => void;
}

export function ChatList({ channels, activeChannelId, onSelectChannel }: ChatListProps) {
    return (
        <div className="chat-list">
            {channels.map(channel => (
                <div
                    key={channel.id}
                    className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                    onClick={() => onSelectChannel(channel.id)}
                >
                    <div className="channel-avatar">
                        {channel.type === 'inbox' && <MessageCircle size={18} />}
                        {channel.type === 'group' && <Users size={18} />}
                        {channel.type === 'p2p' && <User size={18} />}
                        {channel.type === 'broadcast' && <Bell size={18} />}
                    </div>
                    <div className="channel-info">
                        <div className="channel-header">
                            <h4 className="channel-name">{channel.name}</h4>
                            {channel.timestamp && (
                                <span className="channel-time">
                                    {new Date(channel.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                        <p className="channel-preview">
                            {channel.lastMessage || 'No messages'}
                        </p>
                    </div>
                    {channel.unreadCount > 0 && (
                        <div className="unread-badge">
                            {channel.unreadCount}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
