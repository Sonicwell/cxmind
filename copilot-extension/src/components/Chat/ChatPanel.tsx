import { useState, useMemo, useEffect } from "react";
import { ChatList } from "./ChatList";
import { ChatWindow } from "./ChatWindow";
import { InboxPanel } from "./InboxPanel";
import { useWebSocket } from "~/hooks/useWebSocket";
import { useAuth } from "~/hooks/useAuth";
import { ChevronLeft } from "lucide-react";
import { useApi } from "~/hooks/useApi";
import { type ChecklistItem } from "~/types";
import { useModules } from "~/hooks/useModules";

interface ChatPanelProps {
    groupChatUnread?: number;
    onGroupChatSeen?: () => void;
    chatBadge?: 'none' | 'assigned' | 'unread' | 'active';
    queueCount?: number;
    initialView?: string | null;
    onInitialViewConsumed?: () => void;
    omniComplianceItems?: ChecklistItem[];
    omniCompletedComplianceItems?: string[];
    omniComplianceConvId?: string | null;
}

export function ChatPanel({ groupChatUnread = 0, onGroupChatSeen, chatBadge = 'none', queueCount = 0, initialView, onInitialViewConsumed, omniComplianceItems = [], omniCompletedComplianceItems = [], omniComplianceConvId = null }: ChatPanelProps) {
    const { chatMessages } = useWebSocket();
    const { agentInfo } = useAuth();
    const { isModuleEnabled } = useModules();
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [autoOpened, setAutoOpened] = useState(false);

    // Deep navigation: auto-open a specific channel view
    useEffect(() => {
        if (initialView) {
            setActiveChannelId(initialView); // e.g. 'inbox'
            onInitialViewConsumed?.();
        }
    }, [initialView]);

    // B1: 所有组 ID（agent 有一个，supervisor 可能有多个）
    const myGroupIds: string[] = agentInfo?.groupIds || [];
    const [groupNameMap, setGroupNameMap] = useState<Record<string, string>>({});

    // B1: 获取组名 — dep 用 stringify 确保换组同长度也触发
    const { fetchApi, isInitialized } = useApi();
    const chatGroupIdsKey = JSON.stringify(myGroupIds);
    useEffect(() => {
        if (myGroupIds.length === 0 || !isInitialized) return;
        fetchApi<{ data: any[] }>('/api/groups')
            .then(res => {
                const groups = res?.data || [];
                const names: Record<string, string> = {};
                for (const g of groups) {
                    if (myGroupIds.includes(g._id?.toString())) {
                        names[g._id.toString()] = g.name || `Group ${g._id.toString().slice(-4)}`;
                    }
                }
                setGroupNameMap(names);
            })
            .catch(() => { });
    }, [chatGroupIdsKey, isInitialized]);

    // Build unified channel list — all channels in one flat list
    const channels = useMemo(() => {
        const allChannels: Array<{ id: string; name: string; type: 'broadcast' | 'p2p' | 'group' | 'inbox'; unreadCount: number; lastMessage?: string; timestamp?: string }> = [];
        if (isModuleEnabled('inbox')) {
            allChannels.push({ id: 'inbox', name: 'Customer Inbox', type: 'inbox' as any, unreadCount: chatBadge !== 'none' ? Math.max(1, queueCount) : queueCount, lastMessage: chatBadge !== 'none' ? (chatBadge === 'assigned' ? 'New assignment' : chatBadge === 'active' ? 'Active conversation' : 'Unread messages') : undefined });
        }
        // B1: 为每个管理的组生成频道条目
        for (const gid of myGroupIds) {
            allChannels.push({
                id: `group:${gid}`,
                name: groupNameMap[gid] || `Group Chat`,
                type: 'group',
                unreadCount: gid === myGroupIds[0] ? groupChatUnread : 0
            });
        }
        return allChannels.map(ch => {
            if (ch.id === 'inbox') return ch; // Inbox doesn't use chatMessages
            const lastMsg = chatMessages
                .filter(m => {
                    if (ch.id === 'p2p:supervisor') return m.channelId.includes('p2p') && !m.channelId.includes('group');
                    if (ch.id === 'system') return m.channelId === 'broadcast:all' || m.sender.role === 'system';
                    return m.channelId === ch.id;
                })
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            return { ...ch, lastMessage: lastMsg?.content.text, timestamp: lastMsg?.createdAt };
        });
    }, [chatMessages, myGroupIds, groupNameMap, groupChatUnread, queueCount, chatBadge]);

    // Auto-open: if exactly 1 channel has unreads, skip list and open it directly
    useEffect(() => {
        if (autoOpened || activeChannelId) return;
        const unreadChannels = channels.filter(c => c.unreadCount > 0);
        if (unreadChannels.length === 1) {
            const targetId = unreadChannels[0].id;
            setActiveChannelId(targetId);
            if (targetId.startsWith('group:') && onGroupChatSeen) onGroupChatSeen();
            setAutoOpened(true);
        }
    }, [channels]);

    // 选channel时清group badge
    const handleSelectChannel = (channelId: string) => {
        setActiveChannelId(channelId);
        if (channelId.startsWith('group:') && onGroupChatSeen) {
            onGroupChatSeen();
        }
    };

    const handleSend = (text: string) => {
        if (!activeChannelId) return;
        const recipientType = activeChannelId.startsWith('p2p') ? 'user' : 'group';
        const recipientId = activeChannelId.split(':')[1];
        chrome.runtime.sendMessage({
            type: 'chat:send',
            data: { recipientType, recipientId, content: { text }, messageType: 'internal' }
        });
    };

    // Customer Inbox view
    if (activeChannelId === 'inbox') {
        if (!isModuleEnabled('inbox')) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    <div>Inbox module is not enabled for your account.</div>
                </div>
            );
        }
        return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ flex: 1, overflowY: "auto" }}>
                    <InboxPanel onBack={() => setActiveChannelId(null)} omniComplianceItems={omniComplianceItems} omniCompletedComplianceItems={omniCompletedComplianceItems} omniComplianceConvId={omniComplianceConvId} />
                </div>
            </div>
        );
    }

    // Active channel view — show ChatWindow
    if (activeChannelId) {
        const activeChannel = channels.find(c => c.id === activeChannelId) || { id: activeChannelId, name: 'Chat', type: 'p2p' };
        return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: 8, borderBottom: "1px solid var(--glass-border)" }}>
                    <button onClick={() => setActiveChannelId(null)} className="chat-back-btn">
                        <ChevronLeft size={16} /> Back to list
                    </button>
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                    <ChatWindow
                        channelId={activeChannelId}
                        channelName={activeChannel.name}
                        messages={chatMessages}
                        onSend={handleSend}
                        currentUserId={(agentInfo as any)?.userId || ''}
                    />
                </div>
            </div>
        );
    }

    // Channel list view — unified list
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 16px 8px" }}>
                <h2 className="text-lg font-semibold gradient-text">Messages</h2>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
                <ChatList
                    channels={channels}
                    activeChannelId={activeChannelId}
                    onSelectChannel={handleSelectChannel}
                />
            </div>
        </div>
    );
}
