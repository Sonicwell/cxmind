import { useState, useEffect, useCallback } from "react"
import { useApi } from "~/hooks/useApi"
import { useModules } from "~/hooks/useModules"
import { transformApiSop, type SOPNode, type SOPEdge, type SOPBlueprint } from "~/utils/sopTransform"
import { ClipboardList, ChevronDown, ChevronUp, Copy, Check, ArrowRight, Mic, LayoutTemplate, Zap, GitBranch, PhoneForwarded, Bot, Flag } from "lucide-react"

interface SOPGuideState {
    selectedSopId: string | null
    sopData: SOPBlueprint | null
    currentNodeId: string | null
    visitedNodes: string[]
    collapsed: boolean
}

// ─── Node type config ───

const NODE_ICONS: Record<string, { icon: typeof Mic; color: string; bg: string }> = {
    VOICE_PROMPT: { icon: Mic, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    TEMPLATE_SUGGESTION: { icon: LayoutTemplate, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
    LLM_REWRITE: { icon: Bot, color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
    CONDITION: { icon: GitBranch, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    API_CALL: { icon: Zap, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    HUMAN_HANDOFF: { icon: PhoneForwarded, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
}

// ─── Component ───

interface SOPGuidePanelProps {
    hasActiveCall?: boolean
    callId?: string
    contactId?: string
}

export function SOPGuidePanel({ hasActiveCall, callId, contactId }: SOPGuidePanelProps) {
    const { fetchApi, isInitialized } = useApi()
    const { isModuleEnabled } = useModules()
    const [state, setState] = useState<SOPGuideState>({
        selectedSopId: null,
        sopData: null,
        currentNodeId: null,
        visitedNodes: [],
        collapsed: true,
    })
    const [sopList, setSopList] = useState<SOPBlueprint[]>([])
    const [loading, setLoading] = useState(false)
    const [copied, setCopied] = useState(false)
    const [showSelector, setShowSelector] = useState(false)
    const [flaggedSteps, setFlaggedSteps] = useState<Set<string>>(new Set())

    // Load SOP list (等 storage 读完真实 apiUrl 后再请求)
    useEffect(() => {
        if (!isInitialized || !isModuleEnabled('sop')) return
        fetchApi<{ data: SOPBlueprint[] }>('/api/sops')
            .then(res => {
                const published = (res.data || []).filter(s => s.status === 'PUBLISHED')
                setSopList(published)
            })
            .catch(() => { })
    }, [fetchApi, isInitialized])

    // Sync state to background for PiP
    const broadcastSopState = useCallback((newState: SOPGuideState) => {
        try {
            chrome.runtime.sendMessage({
                type: 'sop:stateUpdate',
                data: {
                    sopName: newState.sopData?.name || null,
                    currentNodeId: newState.currentNodeId,
                    currentNode: newState.sopData?.nodes.find(n => n.id === newState.currentNodeId) || null,
                    outEdges: newState.sopData?.edges.filter(e => e.source === newState.currentNodeId).map(e => ({
                        ...e,
                        targetNode: newState.sopData?.nodes.find(n => n.id === e.target)
                    })) || [],
                    visitedNodes: newState.visitedNodes,
                    totalNodes: newState.sopData?.nodes.length || 0,
                    collapsed: newState.collapsed,
                }
            }).catch(() => { })
        } catch { /* PiP not open */ }
    }, [])

    // Listen for PiP actions (branch selection from PiP) + auto-select from demo
    useEffect(() => {
        const listener = (msg: any) => {
            if (msg.type === 'sop:selectBranch' && msg.targetNodeId) {
                navigateToNode(msg.targetNodeId)
            }
            if (msg.type === 'sop:requestState') {
                broadcastSopState(state)
            }
            // demo-streamer 自动选中 SOP（仅在无 SOP 选中时）
            if (msg.type === 'sop:autoSelect' && msg.data?.sopId && !state.selectedSopId) {
                selectSOP(msg.data.sopId)
            }
        }
        chrome.runtime.onMessage.addListener(listener)
        const handleMock = (e: any) => listener(e.detail);
        window.addEventListener('playwright_mock_bus', handleMock);
        
        return () => {
            chrome.runtime.onMessage.removeListener(listener)
            window.removeEventListener('playwright_mock_bus', handleMock);
        }
    }, [state, broadcastSopState])

    // Select an SOP
    const selectSOP = async (sopId: string) => {
        setLoading(true)
        setShowSelector(false)
        try {
            const res = await fetchApi<{ data: SOPBlueprint }>(`/api/sops/${sopId}`)
            const sop = transformApiSop(res.data)

            const startNode = sop.startNodeId || (sop.nodes.length > 0 ? sop.nodes[0].id : null)
            const newState: SOPGuideState = {
                selectedSopId: sopId,
                sopData: sop,
                currentNodeId: startNode,
                visitedNodes: startNode ? [startNode] : [],
                collapsed: false,
            }
            setState(newState)
            broadcastSopState(newState)
        } catch (err) {
            console.error('[SOPGuide] Failed to load SOP:', err)
        } finally {
            setLoading(false)
        }
    }

    // Navigate to a node
    const navigateToNode = useCallback((nodeId: string) => {
        setState(prev => {
            const newState: SOPGuideState = {
                ...prev,
                currentNodeId: nodeId,
                visitedNodes: prev.visitedNodes.includes(nodeId) ? prev.visitedNodes : [...prev.visitedNodes, nodeId],
            }
            broadcastSopState(newState)
            // Emit telemetry
            fetchApi('/api/telemetry/events', {
                method: 'POST',
                body: JSON.stringify({
                    callId,
                    contactId,
                    eventType: 'sop_step_completed',
                    eventData: { sopId: prev.selectedSopId, stepId: nodeId }
                })
            }).catch(console.error)
            return newState
        })
    }, [broadcastSopState, fetchApi])

    // Go back to a visited node
    const goBack = useCallback((nodeId: string) => {
        setState(prev => {
            const idx = prev.visitedNodes.indexOf(nodeId)
            const newVisited = idx >= 0 ? prev.visitedNodes.slice(0, idx + 1) : prev.visitedNodes
            const newState: SOPGuideState = {
                ...prev,
                currentNodeId: nodeId,
                visitedNodes: newVisited,
            }
            broadcastSopState(newState)
            return newState
        })
    }, [broadcastSopState])

    // 折叠/展开
    const toggleCollapse = () => {
        setState(prev => {
            const newState = { ...prev, collapsed: !prev.collapsed }
            broadcastSopState(newState)
            return newState
        })
    }

    // Close/reset SOP
    const closeSOP = () => {
        const newState: SOPGuideState = {
            selectedSopId: null,
            sopData: null,
            currentNodeId: null,
            visitedNodes: [],
            collapsed: true,
        }
        setState(newState)
        broadcastSopState(newState)
    }

    // Copy script text
    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // Get current node and outgoing edges
    const currentNode = state.sopData?.nodes.find(n => n.id === state.currentNodeId)
    const outEdges = state.sopData?.edges.filter(e => e.source === state.currentNodeId) || []
    const stepIndex = state.visitedNodes.indexOf(state.currentNodeId || '') + 1
    const totalNodes = state.sopData?.nodes.length || 0

    // Get script text from node
    const getScriptText = (node: SOPNode): string | null => {
        const d = node.data
        if (!d) return null
        switch (d.type) {
            case 'VOICE_PROMPT': return d.prompt || d.description || null
            case 'TEMPLATE_SUGGESTION': return d.templateName ? `Send template: ${d.templateName}` : d.description || null
            case 'LLM_REWRITE': return d.prompt || d.description || null
            case 'HUMAN_HANDOFF': return d.description || 'Transfer to specialist'
            case 'API_CALL': return d.apiEndpoint ? `Call API: ${d.apiEndpoint}` : d.description || null
            case 'CONDITION': return d.description || 'Evaluate condition'
            default: return d.description || d.label || null
        }
    }

    // Edge label (human-readable)
    const getEdgeLabel = (edge: SOPEdge): string => {
        if (edge.data?.label) return edge.data.label
        if (edge.data?.conditionValue) return edge.data.conditionValue
        if (edge.data?.conditionType === 'DEFAULT') return 'Continue'
        if (edge.data?.conditionType === 'INTENT') return `Intent: ${edge.data.conditionValue || '...'}`
        return 'Next'
    }

    if (!isModuleEnabled('sop')) {
        return null
    }

    // ─── No SOP selected: show compact header ───
    if (!state.sopData) {
        return (
            <div className="glass-panel" style={{ padding: '10px 14px', marginTop: 8, overflow: 'visible', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <ClipboardList size={14} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: 600 }}>SOP Guide</span>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowSelector(!showSelector)}
                            style={{
                                background: 'var(--primary)', color: 'white', border: 'none',
                                padding: '4px 10px', borderRadius: 6, fontSize: '0.65rem',
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            {loading ? '...' : 'Select SOP'}
                        </button>

                        {showSelector && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                background: 'var(--glass-bg, white)', border: '1px solid var(--glass-border, #e5e7eb)',
                                borderRadius: 8, minWidth: 200, maxHeight: 200, overflowY: 'auto',
                                padding: 4, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            }}>
                                {sopList.length > 0 ? sopList.map(sop => (
                                    <button key={sop._id} onClick={() => selectSOP(sop._id)} style={{
                                        display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left',
                                        background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6,
                                        color: 'var(--text-primary, #1a1a1a)',
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>{sop.name}</div>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #9ca3af)' }}>
                                            {sop.category} • {sop.nodes.length} steps
                                        </div>
                                    </button>
                                )) : (
                                    <div style={{ padding: '8px 10px', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                        No published SOPs
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // ─── SOP Active: collapsed header ───
    if (state.collapsed) {
        return (
            <div className="glass-panel" style={{ padding: '10px 14px', marginTop: 8, cursor: 'pointer' }} onClick={toggleCollapse}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ClipboardList size={14} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {state.sopData.name}
                        </span>
                        <span style={{
                            fontSize: '0.58rem', background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                            padding: '1px 6px', borderRadius: 8, fontWeight: 600,
                        }}>
                            Step {stepIndex}/{totalNodes}
                        </span>
                    </div>
                    <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                </div>
            </div>
        )
    }

    // ─── SOP Active: expanded view ───
    const nodeConfig = NODE_ICONS[currentNode?.data?.type || ''] || NODE_ICONS.VOICE_PROMPT
    const NodeIcon = nodeConfig.icon
    const scriptText = currentNode ? getScriptText(currentNode) : null

    return (
        <div className="glass-panel" style={{ marginTop: 8, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderBottom: '1px solid var(--glass-border)',
                background: 'rgba(99,102,241,0.04)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ClipboardList size={14} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{state.sopData.name}</span>
                    <span style={{
                        fontSize: '0.55rem', background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                        padding: '1px 6px', borderRadius: 8, fontWeight: 600,
                    }}>
                        {stepIndex}/{totalNodes}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={toggleCollapse} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}>
                        <ChevronUp size={14} />
                    </button>
                    <button onClick={closeSOP} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        ✕
                    </button>
                </div>
            </div>

            {/* Current Node */}
            {currentNode && (
                <div style={{ padding: '10px 14px' }}>
                    {/* Node type badge + label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: nodeConfig.bg, color: nodeConfig.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <NodeIcon size={14} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                                {currentNode.data?.label || currentNode.data?.type}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: nodeConfig.color, fontWeight: 500 }}>
                                {currentNode.data?.type}
                            </div>
                        </div>
                        {/* ⚑ Flag: 一键标记步骤有问题 */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setFlaggedSteps(prev => {
                                    const s = new Set(prev)
                                    const isFlagging = !s.has(currentNode.id)
                                    if (!isFlagging) { s.delete(currentNode.id) } else { s.add(currentNode.id) }

                                    // Emit telemetry
                                    fetchApi('/api/telemetry/events', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            callId,
                                            contactId,
                                            eventType: isFlagging ? 'sop_step_flagged' : 'sop_step_unflagged',
                                            eventData: { sopId: state.selectedSopId, stepId: currentNode.id, label: currentNode.data?.label }
                                        })
                                    }).catch(console.error)

                                    return s
                                })
                            }}
                            title={flaggedSteps.has(currentNode.id) ? 'Unflag this step' : 'Flag issue with this step'}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                color: flaggedSteps.has(currentNode.id) ? '#ef4444' : 'var(--text-muted)',
                                opacity: flaggedSteps.has(currentNode.id) ? 1 : 0.4,
                                transition: 'all 0.15s', flexShrink: 0,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = flaggedSteps.has(currentNode.id) ? '1' : '0.4')}
                        >
                            <Flag size={12} />
                        </button>
                    </div>

                    {/* Script text */}
                    {scriptText && (
                        <div style={{
                            background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                            borderRadius: 8, padding: '8px 12px', fontSize: '0.75rem', lineHeight: 1.5,
                            color: 'var(--text-primary)', position: 'relative',
                        }}>
                            <div style={{ paddingRight: 28 }}>{scriptText}</div>
                            <button
                                onClick={() => handleCopy(scriptText)}
                                style={{
                                    position: 'absolute', top: 6, right: 6,
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: copied ? '#10b981' : 'var(--text-muted)',
                                    padding: 2,
                                }}
                                title="Copy to clipboard"
                            >
                                {copied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                        </div>
                    )}

                    {/* Branch Selection */}
                    {outEdges.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>
                                {outEdges.length === 1 ? 'Next Step' : 'Choose Path'}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {outEdges.map(edge => (
                                    <button
                                        key={edge.id}
                                        onClick={() => navigateToNode(edge.target)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '5px 10px', borderRadius: 6,
                                            border: '1px solid rgba(99,102,241,0.3)',
                                            background: 'rgba(99,102,241,0.06)',
                                            color: '#6366f1', fontSize: '0.68rem', fontWeight: 500,
                                            cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                    >
                                        <ArrowRight size={10} />
                                        {getEdgeLabel(edge)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No outgoing edges — SOP complete + Follow-Up */}
                    {outEdges.length === 0 && state.visitedNodes.length > 1 && (() => {
                        // P1: Detect unvisited nodes for follow-up suggestions
                        const allNodeIds = state.sopData?.nodes.map(n => n.id) || []
                        const skippedNodes = (state.sopData?.nodes || []).filter(n =>
                            !state.visitedNodes.includes(n.id) &&
                            ['TEMPLATE_SUGGESTION', 'VOICE_PROMPT', 'LLM_REWRITE'].includes(n.data?.type || '')
                        )
                        return (
                            <>
                                <div style={{
                                    marginTop: 10, padding: '8px 12px', borderRadius: 8,
                                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                                    fontSize: '0.7rem', color: '#10b981', fontWeight: 500,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <Check size={14} /> SOP Complete — {state.visitedNodes.length}/{allNodeIds.length} steps completed
                                </div>

                                {/* Follow-Up suggestions for skipped steps */}
                                {skippedNodes.length > 0 && (
                                    <div style={{
                                        marginTop: 8, padding: '8px 12px', borderRadius: 8,
                                        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                                    }}>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#f59e0b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            ⚡ AI Follow-Up — {skippedNodes.length} step{skippedNodes.length > 1 ? 's' : ''} skipped
                                        </div>
                                        {skippedNodes.map(node => {
                                            const nConfig = NODE_ICONS[node.data?.type || ''] || NODE_ICONS.VOICE_PROMPT
                                            const NIcon = nConfig.icon
                                            return (
                                                <div key={node.id} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '4px 0', borderTop: '1px solid rgba(0,0,0,0.03)',
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                                                        <NIcon size={10} style={{ color: nConfig.color }} />
                                                        <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)' }}>
                                                            {node.data?.label || node.data?.type}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 3 }}>
                                                        {node.data?.type === 'TEMPLATE_SUGGESTION' && (
                                                            <button style={{
                                                                fontSize: '0.55rem', padding: '2px 6px', borderRadius: 4,
                                                                border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.06)',
                                                                color: '#8b5cf6', cursor: 'pointer', fontWeight: 500,
                                                            }}>📤 Schedule Send</button>
                                                        )}
                                                        <button style={{
                                                            fontSize: '0.55rem', padding: '2px 6px', borderRadius: 4,
                                                            border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)',
                                                            color: '#6366f1', cursor: 'pointer', fontWeight: 500,
                                                        }}>📋 Add to CRM</button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </>
                        )
                    })()}
                </div>
            )}

            {/* Visited Steps Trail */}
            {state.visitedNodes.length > 1 && (
                <div style={{
                    padding: '6px 14px 10px', borderTop: '1px solid var(--glass-border)',
                }}>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                        Completed Steps
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {state.visitedNodes.slice(0, -1).map(nid => {
                            const node = state.sopData?.nodes.find(n => n.id === nid)
                            return (
                                <button
                                    key={nid}
                                    onClick={() => goBack(nid)}
                                    style={{
                                        fontSize: '0.58rem', padding: '2px 6px', borderRadius: 4,
                                        background: 'var(--glass-highlight)', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', textDecoration: 'line-through',
                                    }}
                                    title="Go back to this step"
                                >
                                    {node?.data?.label || node?.data?.type || nid}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <style>{`
                .sop-branch-btn:hover {
                    background: rgba(99,102,241,0.12) !important;
                    transform: translateY(-1px);
                }
            `}</style>
        </div>
    )
}
