import { useEffect, useRef, useState, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { SmartReplyChips } from "./SmartReplyChips";
import { useApi } from "~/hooks/useApi";
import type { ChatMessage } from "~/hooks/useWebSocket";

interface ChatWindowProps {
    channelId: string;
    channelName: string;
    messages: ChatMessage[];
    onSend: (text: string) => void;
    currentUserId: string;
}

export function ChatWindow({ channelId, channelName, messages, onSend, currentUserId }: ChatWindowProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [pendingInsert, setPendingInsert] = useState("");
    const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const { fetchApi, isInitialized } = useApi();

    // Load history when channel changes
    useEffect(() => {
        setHistoryMessages([]);
        setHistoryLoaded(false);
        setHasMore(true);

        if (!isInitialized || !channelId) return;

        fetchApi<{ messages: ChatMessage[] }>(`/api/chat/messages?channelId=${encodeURIComponent(channelId)}&limit=50`)
            .then(data => {
                const msgs = data.messages || [];
                setHistoryMessages(msgs);
                setHistoryLoaded(true);
                setHasMore(msgs.length >= 50);
            })
            .catch(err => {
                console.error('[ChatWindow] Failed to load history:', err);
                setHistoryLoaded(true);
            });
    }, [channelId, isInitialized]);

    // Load earlier messages (pagination) — preserve scroll position
    const loadMore = async () => {
        if (loadingMore || !hasMore || historyMessages.length === 0) return;
        setLoadingMore(true);
        const oldest = historyMessages[0]?.createdAt;

        // Save scroll position before prepending
        const container = bottomRef.current?.parentElement;
        const prevScrollHeight = container?.scrollHeight || 0;
        const prevScrollTop = container?.scrollTop || 0;

        try {
            const data = await fetchApi<{ messages: ChatMessage[] }>(
                `/api/chat/messages?channelId=${encodeURIComponent(channelId)}&limit=50&before=${encodeURIComponent(oldest)}`
            );
            const msgs = data.messages || [];
            setHistoryMessages(prev => [...msgs, ...prev]);
            setHasMore(msgs.length >= 50);

            // Restore scroll position after DOM update
            requestAnimationFrame(() => {
                if (container) {
                    const newScrollHeight = container.scrollHeight;
                    container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
                }
            });
        } catch (err) {
            console.error('[ChatWindow] Failed to load more:', err);
        }
        setLoadingMore(false);
    };

    // Merge history + live messages, deduplicate by _id
    const channelMessages = useMemo(() => {
        const liveForChannel = messages.filter(m => m.channelId === channelId);
        const all = [...historyMessages, ...liveForChannel];
        const seen = new Set<string>();
        const deduped: ChatMessage[] = [];
        for (const msg of all) {
            const key = msg._id || `${msg.createdAt}-${msg.sender?.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(msg);
            }
        }
        deduped.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return deduped;
    }, [historyMessages, messages, channelId]);

    // Auto-scroll to bottom only for new messages (not when loading history)
    const prevCountRef = useRef(channelMessages.length);
    useEffect(() => {
        const container = bottomRef.current?.parentElement;
        if (!container) return;

        // Only auto-scroll if: new messages appended (count grew) AND user is near bottom
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        const isNewMessage = channelMessages.length > prevCountRef.current;
        prevCountRef.current = channelMessages.length;

        if (isNewMessage && isNearBottom) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [channelMessages.length, channelId]);

    // Get last received message (not from me) for smart reply context
    const lastReceivedMsg = [...channelMessages]
        .reverse()
        .find(m => m.sender.id !== currentUserId);

    const handleSmartInsert = (text: string) => {
        onSend(text);
    };

    return (
        <div className="chat-window">
            {/* Header */}
            <div className="chat-header">
                <div className="header-icon">
                    <MessageSquare size={16} />
                </div>
                <div className="header-info">
                    <h3>{channelName}</h3>
                    <p>
                        {channelId.startsWith('p2p') ? 'Direct Message' : 'Group Chat'}
                    </p>
                </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
                {/* Load more button */}
                {hasMore && historyLoaded && channelMessages.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            style={{
                                background: 'none', border: '1px solid var(--glass-border)',
                                borderRadius: 16, padding: '4px 16px', fontSize: '0.7rem',
                                color: 'var(--primary)', cursor: 'pointer', opacity: loadingMore ? 0.5 : 1
                            }}
                        >
                            {loadingMore ? 'Loading...' : '↑ Load Earlier Messages'}
                        </button>
                    </div>
                )}
                {channelMessages.length === 0 ? (
                    <div className="empty-state">
                        <MessageSquare size={32} />
                        <p className="font-medium">{historyLoaded ? 'No messages yet' : 'Loading...'}</p>
                        {historyLoaded && <p className="text-xs">Start the conversation!</p>}
                    </div>
                ) : (
                    channelMessages.map((msg) => (
                        <ChatBubble
                            key={msg._id || msg.createdAt}
                            text={msg.content.text}
                            sender={msg.sender.name}
                            timestamp={msg.createdAt}
                            isMe={msg.sender.id === currentUserId}
                        />
                    ))
                )}
                <div ref={bottomRef} />
            </div>

            {/* Smart Reply Chips */}
            <SmartReplyChips
                channelId={channelId}
                lastMessage={lastReceivedMsg?.content?.text}
                onInsert={handleSmartInsert}
            />

            {/* Input */}
            <ChatInput onSend={onSend} />
        </div>
    );
}
