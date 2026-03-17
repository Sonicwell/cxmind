
import React, { useEffect, useState, useRef } from 'react';
import { ActionDraftCard, type ActionDraft } from './ActionDraftCard';
import { useWebSocket } from '~/hooks/useWebSocket';
import { useApi } from '~/hooks/useApi';
import { Send, Zap, AlertCircle } from 'lucide-react';
import { useMessageBus } from '~/hooks/useMessageBus';
import { useModules } from '~/hooks/useModules';

// 模块级缓存: remount 时恢复 drafts (挂机 → 回顾)
const _draftCache = new Map<string, ActionDraft[]>();

interface ActionListProps {
    callId: string;
}

export const ActionList: React.FC<ActionListProps> = ({ callId }) => {
    const [drafts, setDrafts] = useState<ActionDraft[]>(() => _draftCache.get(callId) || []);
    const [loading, setLoading] = useState(!_draftCache.has(callId));
    const { fetchApi, isInitialized } = useApi();
    const { isModuleEnabled } = useModules();

    // ref 保证 unmount cleanup 时闭包仍指向最新值
    const callIdRef = useRef(callId);
    useEffect(() => { callIdRef.current = callId; }, [callId]);
    const fetchApiRef = useRef(fetchApi);
    useEffect(() => { fetchApiRef.current = fetchApi; }, [fetchApi]);

    // 同步 drafts 到模块缓存
    useEffect(() => {
        if (callId && drafts.length > 0) _draftCache.set(callId, drafts);
    }, [drafts, callId]);

    // 1. Initial Fetch — 缓存有数据时跳过 (挂机 remount 场景)
    useEffect(() => {
        if (!callId || !isInitialized || !isModuleEnabled('action_center')) return;
        if (_draftCache.has(callId)) { setLoading(false); return; }

        const fetchDrafts = async () => {
            try {
                const data = await fetchApi(`/api/platform/actions/active/${callId}`);
                if (Array.isArray(data)) {
                    setDrafts(data);
                }
            } catch (error) {
                console.error('Failed to fetch drafts', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDrafts();
    }, [callId, isInitialized]);

    const [newDraftIds, setNewDraftIds] = useState<Set<string>>(new Set());

    // 2. Message Bus Listeners (Background script forwards socket events here)
    useEffect(() => {
        const handleMessage = (msg: any) => {
            if (msg.type === 'omni:action_draft' && msg.data) {
                const data = msg.data;
                console.log('[ActionList] New Draft Received:', data);
                setDrafts(prev => {
                    if (prev.find(d => d.actionId === data.actionId)) return prev;
                    const newDraft: ActionDraft = {
                        actionId: data.actionId,
                        intentSlug: data.intentSlug,
                        intentName: data.intentSlug.replace(/_/g, ' ').toUpperCase(),
                        status: data.status,
                        draft: data.draft,
                        originalDraft: data.originalDraft
                    };
                    return [newDraft, ...prev];
                });
                setNewDraftIds(prev => new Set(prev).add(data.actionId));
                setTimeout(() => {
                    setNewDraftIds(prev => {
                        const next = new Set(prev);
                        next.delete(data.actionId);
                        return next;
                    });
                }, 2500);
            }

            if (msg.type === 'omni:action_draft_update' && msg.data) {
                const data = msg.data;
                console.log('[ActionList] Draft Update Received:', data);
                setDrafts(prev => prev.map(d => {
                    if (d.actionId !== data.actionId) return d;

                    let mergedDraft = d.draft;
                    if (data.draft && typeof data.draft === 'object') {
                        mergedDraft = { ...d.draft };
                        for (const [key, newVal] of Object.entries(data.draft)) {
                            const currentVal = mergedDraft[key];
                            if (currentVal == null || currentVal === '' || currentVal === undefined) {
                                mergedDraft[key] = newVal;
                            }
                        }
                    }

                    return {
                        ...d,
                        status: data.status || d.status,
                        draft: mergedDraft,
                    };
                }));
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);
        const handleMock = (e: any) => handleMessage(e.detail);
        window.addEventListener('playwright_mock_bus', handleMock);
        
        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
            window.removeEventListener('playwright_mock_bus', handleMock);
        };
    }, []);

    // 3. Handlers — 用 ref 确保 unmount 时 ActionDraftCard cleanup 调用仍有效
    const handleConfirm = async (id: string, payload: any) => {
        const cid = callIdRef.current;
        // Optimistic UI + 同步到模块缓存（跨 wide/narrow remount 保留状态）
        setDrafts(prev => prev.map(d => d.actionId === id ? { ...d, status: 'confirmed' } : d));
        const cached = _draftCache.get(cid);
        if (cached) {
            _draftCache.set(cid, cached.map(d => d.actionId === id ? { ...d, status: 'confirmed' } : d));
        }

        try {
            await fetchApiRef.current(`/api/platform/actions/${id}/execute`, {
                method: 'POST',
                body: JSON.stringify({ payload }),
            });
        } catch (error) {
            console.error('Execution failed', error);
            setDrafts(prev => prev.map(d => d.actionId === id ? { ...d, status: 'edited' } : d));
            const c2 = _draftCache.get(cid);
            if (c2) _draftCache.set(cid, c2.map(d => d.actionId === id ? { ...d, status: 'edited' } : d));
        }
    };

    const handleReject = async (id: string, reason: string) => {
        setDrafts(prev => prev.map(d => d.actionId === id ? { ...d, status: 'rejected' } : d));
        try {
            await fetchApi(`/api/platform/actions/${id}/reject`, {
                method: 'POST',
                body: JSON.stringify({ reason }),
            });
        } catch (error) { console.error(error); }
    };

    const handleUpdate = (id: string, payload: any) => {
        setDrafts(prev => prev.map(d => d.actionId === id ? { ...d, draft: payload, status: 'edited' } : d));
        // Optional: Debounce sync to backend
    };

    const handleReset = (id: string) => {
        setDrafts(prev => prev.map(d => {
            if (d.actionId === id) {
                return { ...d, draft: d.originalDraft, status: 'suggested' };
            }
            return d;
        }));
    };

    if (loading) return <div className="text-center p-4 text-slate-500">Loading actions...</div>;

    if (drafts.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.75rem', color: 'var(--text-muted, #9ca3af)', opacity: 0.7 }}>
                <Zap size={14} />
                <span>Listening for intent…</span>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            {drafts.map(draft => (
                <ActionDraftCard
                    key={draft.actionId}
                    draft={draft}
                    onConfirm={handleConfirm}
                    onReject={handleReject}
                    onUpdate={handleUpdate}
                    onReset={handleReset}
                    isNew={newDraftIds.has(draft.actionId)}
                />
            ))}
        </div>
    );
};
