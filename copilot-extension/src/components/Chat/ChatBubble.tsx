import { normalizeSIP, getInitials } from "../../utils/sip";

interface ChatBubbleProps {
    text: string;
    sender: string;
    timestamp: string;
    isMe: boolean;
}

export function ChatBubble({ text, sender, timestamp, isMe }: ChatBubbleProps) {
    const initials = getInitials(sender);

    return (
        <div className={`chat-row ${isMe ? "right" : "left"}`}>
            <div
                className="chat-avatar"
                style={{
                    background: isMe ? 'var(--primary)' : '#9ca3af',
                    flexShrink: 0
                }}
            >
                {initials}
            </div>

            <div style={{ maxWidth: '85%' }}>
                <div className="chat-bubble">
                    {text}
                    <div className="chat-meta" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }}>
                        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </div>
    );
}
