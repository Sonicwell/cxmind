import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    type Node,
    type Edge,
    type Connection,
    type NodeTypes,
    Handle,
    Position,
    type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
    ArrowLeft, Save, Settings, FileText,
    Hand as HandIcon, Link2, Sparkles, GitBranch, PhoneCall,
    Zap, X, CheckCircle, AlertTriangle, Loader2, Tag, Trash2, RefreshCw
} from 'lucide-react';
import api from '../../services/api';
import '../../styles/sop-builder.css';
import { LLMSuggestPanel, type LLMSuggestion } from '../../components/ui/LLMSuggestPanel';
import { STORAGE_KEYS } from '../../constants/storage-keys';

import { Button } from '../../components/ui/button';
import { useDemoMode } from '../../hooks/useDemoMode';
import { getMockSOPs } from '../../services/mock-data';

interface OutlinePhase {
    name: string;
    type: 'VOICE_PROMPT' | 'CONDITION' | 'LLM_REWRITE';
    summary: string;
    agentLines?: string[];
    branches?: string[];
    parentBranch?: string; // Newly added to support parallel branching from flat LLM output
}

interface SopOutline {
    sopName: string;
    description: string;
    category: string;
    phases: OutlinePhase[];
    hotwords: string[];
}

/* ═══════════════════════════════════════════════════
   Node Type Definitions
   ═══════════════════════════════════════════════════ */
const NODE_TYPE_DEFS = [
    { type: 'VOICE_PROMPT', label: 'Voice Prompt', desc: 'TTS text for the agent', cssClass: 'voice', icon: <PhoneCall size={16} /> },
    { type: 'TEMPLATE_SUGGESTION', label: 'Template Suggestion', desc: 'Suggest a message template', cssClass: 'template', icon: <FileText size={16} /> },
    { type: 'LLM_REWRITE', label: 'LLM Rewrite', desc: 'AI rewrites based on context', cssClass: 'llm', icon: <Sparkles size={16} /> },
    { type: 'CONDITION', label: 'Condition', desc: 'Evaluate & branch logic', cssClass: 'condition', icon: <GitBranch size={16} /> },
    { type: 'API_CALL', label: 'API Call', desc: 'Fetch external CRM data', cssClass: 'api', icon: <Link2 size={16} /> },
    { type: 'HUMAN_HANDOFF', label: 'Human Handoff', desc: 'Escalate to live agent', cssClass: 'handoff', icon: <HandIcon size={16} /> },
];

const EDGE_CONDITION_TYPES = ['DEFAULT', 'INTENT', 'ENTITY_MATCH', 'API_SUCCESS', 'API_FAILURE'];

const CATEGORIES = [
    { value: 'CUSTOMER_SERVICE', label: 'Customer Service' },
    { value: 'SALES', label: 'Sales' },
    { value: 'TECH_SUPPORT', label: 'Tech Support' },
    { value: 'BILLING', label: 'Billing' },
];

/* ═══════════════════════════════════════════════════
   Custom Node Component
   ═══════════════════════════════════════════════════ */
function CustomSOPNode({ data, selected }: any) {
    const { t } = useTranslation();
    const def = NODE_TYPE_DEFS.find(d => d.type === data.type) || NODE_TYPE_DEFS[0];
    const preview = data.voicePrompt || data.rewriteInstruction || data.apiEndpoint || '';

    return (
        <div className={`sop-node ${selected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} />
            <div className={`sop-node-header ${def.cssClass}`}>
                {def.icon}
                <span>{t(`sopBuilder.nodeTypes.${def.type}.label`, { defaultValue: def.label })}</span>
            </div>
            <div className="sop-node-body">
                <p className="sop-node-label">{data.label || t('sopBuilder.untitled')}</p>
                {preview && <p className="sop-node-preview">{preview}</p>}
            </div>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

const nodeTypes: NodeTypes = { custom: CustomSOPNode };

/* ═══════════════════════════════════════════════════
   Toast Component
   ═══════════════════════════════════════════════════ */
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3000);
        return () => clearTimeout(t);
    }, [onClose]);

    return (
        <div className={`sop-toast ${type}`}>
            {type === 'success' ? <CheckCircle size={18} color="#10b981" /> : <AlertTriangle size={18} color="#ef4444" />}
            <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>{message}</span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   Main SOPBuilder Component
   ═══════════════════════════════════════════════════ */
const SOPBuilder: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const id = searchParams.get('id');
    const { demoMode } = useDemoMode();

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const [sopName, setSopName] = useState(t('sopBuilder.untitledWorkflow'));
    const [sopDesc, setSopDesc] = useState('');
    const [sopCategory, setSopCategory] = useState('CUSTOMER_SERVICE');
    const [loading, setLoading] = useState(false);
    const [isNewMode, setIsNewMode] = useState(!id);

    // Outline preview mode (from calls)
    const fromCalls = searchParams.get('from') === 'calls';
    const [outlineMode, setOutlineMode] = useState(fromCalls);
    const [outline, setOutline] = useState<SopOutline | null>(null);
    const [outlineLoading, setOutlineLoading] = useState(false);
    const [outlineError, setOutlineError] = useState<string | null>(null);

    // 从 calls 跳转时自动加载 outline
    const fetchOutline = useCallback(() => {
        const cart = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOP_CART) || '{"calls":[]}');
        const callIds = (cart.calls || []).map((c: any) => c.callId);
        if (callIds.length === 0) {
            setOutline(null);
            setOutlineError(t('sopBuilder.cart.noCallsInCart'));
            return;
        }
        setOutlineLoading(true);
        setOutlineError(null);
        setOutline(null);
        api.post('/sops/generate/outline', { callIds })
            .then(res => {
                const o = res.data.outline;
                setOutlineError(null);
                setOutline(o);
                setOutlineLoading(false);
                setSopName(o.sopName || '');
                setSopDesc(o.description || '');
                setSopCategory(o.category || 'CUSTOMER_SERVICE');
            })
            .catch(err => {
                setOutlineError(err.response?.data?.error || 'Failed to generate outline');
                setOutlineLoading(false);
            });
    }, [t]);

    // 从 calls 跳转时自动加载 outline
    useEffect(() => {
        if (!fromCalls || outline) return;
        fetchOutline();
    }, [fromCalls]);

    // Outline → nodes/edges 纯代码映射
    const buildFromOutline = () => {
        if (!outline) return;
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        const baseX = 250;
        const gapY = 150;
        const gapX = 250;
        let nodeCounter = 1;

        // Tracks the ID of the last CONDITION node to connect branches back to it
        let lastConditionNodeId: string | null = null;
        let lastConditionBranches: string[] = [];
        
        // Tracks the IDs of all branch node ends so they can be merged when a common node appears
        let activeBranchEnds: Map<string, string> = new Map(); // branchName -> lastNodeIdOnThisBranch
        
        let previousCommonNodeId: string | null = null;

        // calculate max Y so far to position common nodes properly after parallel branches
        let maxY = 50; 

        for (let i = 0; i < outline.phases.length; i++) {
            const phase = outline.phases[i];
            const nodeId = `node_${nodeCounter++}`;
            const nodeType = phase.type === 'CONDITION' ? 'CONDITION'
                : phase.type === 'LLM_REWRITE' ? 'LLM_REWRITE'
                : 'VOICE_PROMPT';

            let nodeX = baseX;
            let nodeY = maxY;

            // Handle Parallel Branch Node
            if (phase.parentBranch && lastConditionNodeId && lastConditionBranches.includes(phase.parentBranch)) {
                // Find horizontal index for this branch to spread them out
                const branchIndex = lastConditionBranches.indexOf(phase.parentBranch);
                nodeX = baseX + (branchIndex - (lastConditionBranches.length - 1) / 2) * gapX;
                
                // For vertical positioning on parallel tracks, we need to track depth per branch or just increment based on previous node on THIS branch
                const prevNodeIdOnBranch = activeBranchEnds.get(phase.parentBranch);
                if (prevNodeIdOnBranch) {
                    const prevNode = newNodes.find(n => n.id === prevNodeIdOnBranch);
                    nodeY = (prevNode?.position.y || maxY) + gapY;
                } else {
                     // First node directly after the CONDITION on this branch
                    nodeY = maxY; 
                }

                newNodes.push({
                    id: nodeId,
                    type: 'custom',
                    position: { x: nodeX, y: nodeY },
                    data: {
                        label: phase.name,
                        type: nodeType,
                        voicePrompt: phase.agentLines?.join('\n') || phase.summary || '',
                        rewriteInstruction: phase.type === 'LLM_REWRITE' ? phase.summary : '',
                        apiEndpoint: '',
                        templateId: null,
                    },
                });

                // Connect to previous node on this branch, or the root condition node
                if (prevNodeIdOnBranch) {
                     newEdges.push({
                        id: `edge_${prevNodeIdOnBranch}_${nodeId}`,
                        source: prevNodeIdOnBranch,
                        target: nodeId,
                        label: 'DEFAULT',
                        data: { conditionType: 'DEFAULT' },
                    });
                } else {
                     newEdges.push({
                        id: `edge_${lastConditionNodeId}_${nodeId}`,
                        source: lastConditionNodeId,
                        target: nodeId,
                        label: phase.parentBranch,
                        data: { conditionType: 'INTENT', conditionValue: phase.parentBranch },
                    });
                }
                
                activeBranchEnds.set(phase.parentBranch, nodeId);
                maxY = Math.max(maxY, nodeY + gapY);

            } else {
                // Handle Common Sequential Node (or branch terminator merging back)
                // If there were active branches, merge them to this common node
                nodeY = maxY;

                newNodes.push({
                    id: nodeId,
                    type: 'custom',
                    position: { x: nodeX, y: nodeY },
                    data: {
                        label: phase.name,
                        type: nodeType,
                        voicePrompt: phase.agentLines?.join('\n') || phase.summary || '',
                        rewriteInstruction: phase.type === 'LLM_REWRITE' ? phase.summary : '',
                        apiEndpoint: '',
                        templateId: null,
                    },
                });

                if (activeBranchEnds.size > 0) {
                    // Merge all parallel branches back to this common node
                    for (const [, branchTailId] of activeBranchEnds) {
                        newEdges.push({
                            id: `edge_${branchTailId}_${nodeId}`,
                            source: branchTailId,
                            target: nodeId,
                            label: 'DEFAULT',
                            data: { conditionType: 'DEFAULT' },
                        });
                    }
                    activeBranchEnds.clear();
                } else if (previousCommonNodeId) {
                    // Just a regular sequential node
                     newEdges.push({
                        id: `edge_${previousCommonNodeId}_${nodeId}`,
                        source: previousCommonNodeId,
                        target: nodeId,
                        label: 'DEFAULT',
                        data: { conditionType: 'DEFAULT' },
                    });
                }

                if (phase.type === 'CONDITION' && phase.branches && phase.branches.length > 0) {
                    lastConditionNodeId = nodeId;
                    lastConditionBranches = phase.branches;
                } else {
                    lastConditionNodeId = null;
                    lastConditionBranches = [];
                }

                previousCommonNodeId = nodeId;
                maxY = nodeY + gapY;
            }
        }

        setNodes(newNodes);
        setEdges(newEdges);
        if (outline.hotwords) setSopHotwords(outline.hotwords.join(', '));

        // 清空 cart
        localStorage.removeItem(STORAGE_KEYS.SOP_CART);
        setOutlineMode(false);
        setIsNewMode(false);
        setToast({ message: t('sopBuilder.cart.builtSuccess', { count: outline.phases.length }), type: 'success' });
    };

    // Properties panel
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

    // Template list for TEMPLATE_SUGGESTION nodes
    const [templateOptions, setTemplateOptions] = useState<any[]>([]);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const res = await api.get('/templates');
                const templates = Array.isArray(res.data?.data) ? res.data.data : [];
                setTemplateOptions(templates);
            } catch (err) {
                console.error('Failed to fetch templates:', err);
            }
        };
        fetchTemplates();
    }, []);

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // ASR Hotwords & Details
    const [sopHotwords, setSopHotwords] = useState('');
    const [extracting, setExtracting] = useState(false);
    const [llmSuggestions, setLlmSuggestions] = useState<LLMSuggestion[]>([]);
    const [llmRemovals, setLlmRemovals] = useState<LLMSuggestion[]>([]);
    const [showSuggestPanel, setShowSuggestPanel] = useState(false);
    const [paletteTab, setPaletteTab] = useState<'nodes' | 'details'>('nodes');

    // ── Fetch SOP data ──
    useEffect(() => {
        if (id) {
            setIsNewMode(false);
            fetchSOP();
        }
    }, [id]);

    // ── Fetch available templates ──
    useEffect(() => {
        api.get('/templates').then(res => {
            setTemplateOptions(res.data.data || res.data || []);
        }).catch(() => { });
    }, []);

    const fetchSOP = async () => {
        setLoading(true);
        try {
            let raw: any;
            if (demoMode && id?.startsWith('sop_demo_')) {
                const mockData = await getMockSOPs();
                raw = mockData.find((s: any) => s._id === id);
                if (!raw) throw new Error('Mock SOP not found');
            } else {
                const res = await api.get(`/sops/${id}`);
                raw = res.data;
            }
            
            const data = Array.isArray(raw) ? raw : (raw?.data || raw);
            setSopName(data.name || 'Untitled');
            setSopDesc(data.description || '');
            setSopCategory(data.category || 'CUSTOMER_SERVICE');
            setSopHotwords((data.hotwords || []).join(', '));

            const flowNodes = (data.nodes || []).map((n: any) => ({
                id: n.id,
                type: 'custom',
                position: { x: n.metadata?.x || 100, y: n.metadata?.y || 100 },
                data: {
                    label: n.label,
                    type: n.type,
                    voicePrompt: n.voicePrompt,
                    rewriteInstruction: n.rewriteInstruction,
                    apiEndpoint: n.apiEndpoint,
                    templateId: n.templateId,
                }
            }));

            const flowEdges = (data.edges || []).map((e: any) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                label: e.label || '',
                type: 'smoothstep',
                animated: e.conditionType === 'DEFAULT',
                data: { conditionType: e.conditionType || 'DEFAULT', conditionValue: e.conditionValue || '' },
                style: { stroke: getEdgeColor(e.conditionType), strokeWidth: 2 },
                labelStyle: { fill: '#64748b', fontWeight: 600, fontSize: 12 },
                labelBgPadding: [8, 4] as [number, number],
                labelBgBorderRadius: 4,
            }));

            setNodes(flowNodes);
            setEdges(flowEdges);
        } catch (err) {
            console.error(t('sopBuilder.toast.loadFailed'), err);
            setToast({ message: 'Failed to load SOP', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // ── Edge color helper ──
    function getEdgeColor(conditionType: string) {
        switch (conditionType) {
            case 'INTENT': return '#ec4899';
            case 'ENTITY_MATCH': return '#f59e0b';
            case 'API_SUCCESS': return '#10b981';
            case 'API_FAILURE': return '#ef4444';
            default: return '#64748b';
        }
    }

    // ── Connection handler ──
    const onConnect = useCallback((connection: Connection) => {
        const newEdge = {
            ...connection,
            type: 'smoothstep',
            animated: true,
            data: { conditionType: 'DEFAULT', conditionValue: '' },
            style: { stroke: '#64748b', strokeWidth: 2 },
        };
        setEdges((eds: Edge[]) => addEdge(newEdge, eds));
    }, [setEdges]);

    // ── Drag & Drop from Palette ──
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const nodeType = event.dataTransfer!.getData('application/sop-node-type');
        if (!nodeType || !rfInstance || !reactFlowWrapper.current) return;

        const position = rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        const def = NODE_TYPE_DEFS.find(d => d.type === nodeType);
        const newNode: Node = {
            id: `node_${Date.now()}`,
            type: 'custom',
            position,
            data: { label: def ? t(`sopBuilder.nodeTypes.${def.type}.label`, { defaultValue: def.label }) : t('sopBuilder.newNode'), type: nodeType, voicePrompt: '', rewriteInstruction: '', apiEndpoint: '', templateId: null },
        };

        setNodes((nds: Node[]) => [...nds, newNode]);
    }, [rfInstance, setNodes]);

    // ── Update node data ──
    const updateNodeData = (nodeId: string, key: string, value: any) => {
        setNodes((nds: Node[]) => nds.map((n: Node) => {
            if (n.id === nodeId) {
                return { ...n, data: { ...n.data, [key]: value } };
            }
            return n;
        }));
    };

    // ── Update edge data ──
    const updateEdgeData = (edgeId: string, key: string, value: any) => {
        setEdges((eds: Edge[]) => eds.map((e: Edge) => {
            if (e.id === edgeId) {
                const newData = { ...e.data, [key]: value };
                return {
                    ...e,
                    data: newData,
                    label: key === 'label' ? value : (e.label || ''),
                    animated: newData.conditionType === 'DEFAULT',
                    style: { stroke: getEdgeColor(newData.conditionType), strokeWidth: 2 },
                };
            }
            return e;
        }));
    };

    // ── Edge click ──
    const onEdgeClick = useCallback((_: any, edge: Edge) => {
        setSelectedEdgeId(edge.id);
        // Deselect all nodes
        setNodes((nds: Node[]) => nds.map(n => ({ ...n, selected: false })));
    }, [setNodes]);

    // ── Node click — deselect edge (single click = select only, no edit panel) ──
    const onNodeClick = useCallback(() => {
        setSelectedEdgeId(null);
    }, []);

    // ── Node double-click — open edit panel ──
    const onNodeDoubleClick = useCallback((_: any, node: Node) => {
        setSelectedEdgeId(null);
        setEditingNodeId(node.id);
    }, []);

    // ── Canvas click — deselect edge & close edit panel ──
    const onPaneClick = useCallback(() => {
        setSelectedEdgeId(null);
        setEditingNodeId(null);
    }, []);

    // ── Save ──
    const handleSave = async () => {
        setLoading(true);
        try {
            const payloadNodes = nodes.map((n: Node) => ({
                id: n.id,
                type: n.data.type,
                label: n.data.label || t('sopBuilder.untitledNode'),
                voicePrompt: n.data.voicePrompt || undefined,
                rewriteInstruction: n.data.rewriteInstruction || undefined,
                apiEndpoint: n.data.apiEndpoint || undefined,
                templateId: n.data.templateId || undefined,
                metadata: { x: n.position.x, y: n.position.y },
            }));

            const payloadEdges = edges.map((e: Edge) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                label: (e.label as string) || (e.data?.conditionValue as string) || undefined,
                conditionType: e.data?.conditionType || 'DEFAULT',
                conditionValue: e.data?.conditionValue || undefined,
            }));

            const payload = {
                name: sopName,
                description: sopDesc,
                category: sopCategory,
                introduction: sopDesc, // 同步 introduction = description
                hotwords: sopHotwords.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                nodes: payloadNodes,
                edges: payloadEdges,
                startNodeId: payloadNodes.length > 0 ? payloadNodes[0].id : 'node_start',
            };

            if (!id) {
                // Create new SOP
                const res = await api.post('/sops', { ...payload, status: 'DRAFT' });
                const newId = res.data.data?._id || res.data._id;
                setToast({ message: t('sopBuilder.toast.created'), type: 'success' });
                navigate(`/sop/builder?id=${newId}`, { replace: true });
            } else {
                await api.put(`/sops/${id}`, payload);
                setToast({ message: t('sopBuilder.toast.saved'), type: 'success' });
            }
        } catch (err) {
            console.error('Failed to save SOP:', err);
            setToast({ message: t('sopBuilder.toast.saveError'), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // ── Create New SOP form ──
    const handleCreateStart = () => {
        if (!sopName.trim()) return;
        setIsNewMode(false); // Enter canvas mode (still no id until first save)
    };

    const editingNode = editingNodeId ? nodes.find((n: Node) => n.id === editingNodeId) : null;
    const selectedEdge = edges.find((e: Edge) => e.id === selectedEdgeId);
    const showNodeProps = !!editingNode && !selectedEdgeId;
    const showEdgeProps = !!selectedEdge;

    /* ── Outline Preview Screen (from calls) ── */
    if (outlineMode && !id) {
        return (
            <div className="sop-builder">
                <div className="sop-header">
                    <div className="sop-header-left">
                        <Button onClick={() => { setOutlineMode(false); navigate('/sop'); }} className="sop-header-back"><ArrowLeft size={20} /></Button>
                        <div>
                            <h1 className="sop-header-title">{t('sopBuilder.cart.outlineTitle')}</h1>
                            <span className="sop-header-sub">{t('sopBuilder.cart.outlineSub')}</span>
                        </div>
                    </div>
                </div>

                <div className="sop-create-form">
                    <div className="sop-create-card" style={{ maxWidth: '700px' }}>
                        {outlineLoading && (
                            <div style={{ padding: '3rem', textAlign: 'center' }}>
                                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('sopBuilder.cart.analyzing')}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{t('sopBuilder.cart.analyzingHint')}</div>
                            </div>
                        )}

                        {outlineError && (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>
                                <AlertTriangle size={28} style={{ color: 'var(--danger)', marginBottom: '0.75rem' }} />
                                <div style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '1rem' }}>{outlineError}</div>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                    <Button onClick={fetchOutline}>
                                        <RefreshCw size={14} /> {t('sopBuilder.cart.retry')}
                                    </Button>
                                    <Button variant="outline" onClick={() => { setOutlineError(null); setOutlineMode(false); navigate('/sop'); }}>
                                        {t('sopBuilder.cart.backToLibrary')}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {outline && !outlineLoading && !outlineError && (
                            <>
                                {/* SOP Name / Description / Category */}
                                <div className="sop-field" style={{ marginBottom: '0.75rem' }}>
                                    <label>{t('sopBuilder.cart.sopName')}</label>
                                    <Input value={sopName} onChange={e => setSopName(e.target.value)} />
                                </div>
                                <div className="sop-field" style={{ marginBottom: '0.75rem' }}>
                                    <label>{t('sopBuilder.cart.description')}</label>
                                    <Textarea rows={2} value={sopDesc} onChange={e => setSopDesc(e.target.value)} />
                                </div>
                                <div className="sop-field" style={{ marginBottom: '1rem' }}>
                                    <label>{t('sopBuilder.cart.category')}</label>
                                    <Select value={sopCategory} onChange={e => setSopCategory(e.target.value)}>
                                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </Select>
                                </div>

                                {/* Phase Stepper */}
                                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <GitBranch size={16} /> {t('sopBuilder.cart.phases')} ({outline.phases.length})
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {outline.phases.map((phase, idx) => (
                                            <div key={idx} style={{
                                                display: 'flex', gap: '10px', alignItems: 'flex-start',
                                                padding: '0.75rem', borderRadius: '8px',
                                                background: 'var(--bg-dark)', border: '1px solid var(--glass-border)',
                                            }}>
                                                {/* Step number */}
                                                <div style={{
                                                    width: '24px', height: '24px', borderRadius: '50%',
                                                    background: 'var(--primary)', color: 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.7rem', fontWeight: 700, flexShrink: 0, marginTop: '2px',
                                                }}>
                                                    {idx + 1}
                                                </div>

                                                <div style={{ flex: 1 }}>
                                                    {/* Phase name + type */}
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                                                        <input
                                                            value={phase.name}
                                                            onChange={e => {
                                                                const updated = [...outline.phases];
                                                                updated[idx] = { ...updated[idx], name: e.target.value };
                                                                setOutline({ ...outline, phases: updated });
                                                            }}
                                                            style={{
                                                                flex: 1, background: 'transparent', border: 'none',
                                                                fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)',
                                                                outline: 'none', borderBottom: '1px solid transparent',
                                                            }}
                                                            onFocus={e => e.target.style.borderBottom = '1px solid var(--primary)'}
                                                            onBlur={e => e.target.style.borderBottom = '1px solid transparent'}
                                                        />
                                                        <span style={{
                                                            fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px',
                                                            background: phase.type === 'CONDITION' ? 'rgba(245,158,11,0.15)' :
                                                                phase.type === 'LLM_REWRITE' ? 'rgba(168,85,247,0.15)' :
                                                                    'rgba(99,102,241,0.15)',
                                                            color: phase.type === 'CONDITION' ? '#f59e0b' :
                                                                phase.type === 'LLM_REWRITE' ? '#a855f7' : 'var(--primary)',
                                                        }}>
                                                            {phase.type}
                                                        </span>
                                                    </div>

                                                    {/* Summary */}
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: phase.branches ? '4px' : 0 }}>
                                                        {phase.summary}
                                                    </div>

                                                    {/* Branches for CONDITION */}
                                                    {phase.branches && (
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                            {phase.branches.map((b, bi) => (
                                                                <span key={bi} style={{
                                                                    fontSize: '0.65rem', padding: '2px 6px',
                                                                    borderRadius: '4px', background: 'rgba(245,158,11,0.1)',
                                                                    color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)',
                                                                }}>
                                                                    → {b}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Agent lines */}
                                                    {phase.agentLines && phase.agentLines.length > 0 && (
                                                        <div style={{ marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                            💬 {phase.agentLines[0]}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Delete */}
                                                <button
                                                    onClick={() => {
                                                        const updated = outline.phases.filter((_, i) => i !== idx);
                                                        setOutline({ ...outline, phases: updated });
                                                    }}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-muted)', padding: '4px', flexShrink: 0,
                                                    }}
                                                    title={t('sopBuilder.cart.removePhase')}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Hotwords preview */}
                                {outline.hotwords && outline.hotwords.length > 0 && (
                                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Tag size={14} /> {t('sopBuilder.cart.hotwords')}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {outline.hotwords.map((hw, i) => (
                                                <span key={i} style={{
                                                    fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px',
                                                    background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
                                                    border: '1px solid rgba(99,102,241,0.2)',
                                                }}>
                                                    {hw}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Build button */}
                                <Button
                                    onClick={buildFromOutline}
                                    disabled={outline.phases.length === 0}
                                    style={{
                                        marginTop: '1.5rem', padding: '0.75rem', borderRadius: '8px',
                                        fontWeight: 600, fontSize: '0.9rem', width: '100%',
                                    }}
                                >
                                    <CheckCircle size={16} /> {t('sopBuilder.cart.confirmBuildCount', { count: outline.phases.length })}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ── Create New SOP Screen ── */
    if (isNewMode && !id) {
        return (
            <div className="sop-builder">
                <div className="sop-header">
                    <div className="sop-header-left">
                        <Button onClick={() => navigate('/sop')} className="sop-header-back"><ArrowLeft size={20} /></Button>
                        <div>
                            <h1 className="sop-header-title">{t('sopBuilder.createNewSop')}</h1>
                            <span className="sop-header-sub">{t('sopBuilder.defineBasicInfo')}</span>
                        </div>
                    </div>
                </div>

                <div className="sop-create-form">
                    <div className="sop-create-card">
                        <h2 className="sop-create-title">{t('sopBuilder.newWorkflowTitle')}</h2>
                        <p className="sop-create-desc">{t('sopBuilder.newWorkflowDesc')}</p>

                        <div className="sop-field">
                            <label>{t('sopBuilder.workflowName')}</label>
                            <Input type="text" value={sopName} onChange={e => setSopName(e.target.value)} placeholder={t('sopBuilder.placeholders.workflowName')} />
                        </div>

                        <div className="sop-field">
                            <label>{t('sopBuilder.description')}</label>
                            <Textarea rows={3} value={sopDesc} onChange={e => setSopDesc(e.target.value)} placeholder={t('sopBuilder.placeholders.description')} />
                        </div>

                        <div className="sop-field">
                            <label>{t('sopBuilder.category')}</label>
                            <Select value={sopCategory} onChange={e => setSopCategory(e.target.value)}>
                                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{t(`sopBuilder.categories.${c.value}`, { defaultValue: c.label })}</option>)}
                            </Select>
                        </div>

                        <Button
                            style={{ marginTop: '0.5rem', padding: '0.75rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem' }}
                            onClick={handleCreateStart}
                            disabled={!sopName.trim()}
                        >
                            <Zap size={16} /> {t('sopBuilder.openCanvasBuilder')}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    /* ── Main Builder ── */
    return (
        <div className="sop-builder">
            {/* Header */}
            <div className="sop-header">
                <div className="sop-header-left">
                    <Button onClick={() => navigate('/sop')} className="sop-header-back"><ArrowLeft size={20} /></Button>
                    <div>
                        <Input
                            value={sopName}
                            onChange={e => setSopName(e.target.value)}
                            style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none', width: '300px' }}
                        />
                        <span className="sop-header-sub">{t('sopBuilder.sopBuilderCanvas')}</span>
                    </div>
                </div>

                <div className="sop-header-actions">
                    <Button onClick={handleSave} disabled={loading}>
                        <Save size={16} /> {loading ? t('sopBuilder.saving') : t('sopBuilder.saveWorkflow')}
                    </Button>
                </div>
            </div>

            <div className="sop-body">
                {/* Left: Tabbed Panel */}
                <div className="sop-palette">
                    {/* Tab Bar */}
                    <div style={{ display: 'flex', borderBottom: '2px solid var(--border-primary, #e2e8f0)', marginBottom: 10 }}>
                        <button
                            onClick={() => setPaletteTab('nodes')}
                            style={{
                                flex: 1, padding: '8px 4px', fontSize: '0.72rem', fontWeight: 600,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: paletteTab === 'nodes' ? '#6366f1' : 'var(--text-muted)',
                                borderBottom: paletteTab === 'nodes' ? '2px solid #6366f1' : '2px solid transparent',
                                marginBottom: -2, transition: 'all 0.15s ease',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}
                        >
                            <Zap size={12} /> {t('sopBuilder.panel.nodes')}
                        </button>
                        <button
                            onClick={() => setPaletteTab('details')}
                            style={{
                                flex: 1, padding: '8px 4px', fontSize: '0.72rem', fontWeight: 600,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: paletteTab === 'details' ? '#6366f1' : 'var(--text-muted)',
                                borderBottom: paletteTab === 'details' ? '2px solid #6366f1' : '2px solid transparent',
                                marginBottom: -2, transition: 'all 0.15s ease',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}
                        >
                            <Settings size={12} /> {t('sopBuilder.panel.details')}
                        </button>
                    </div>

                    {/* Nodes Tab */}
                    {paletteTab === 'nodes' && (
                        <div>
                            {NODE_TYPE_DEFS.map(def => (
                                <div
                                    key={def.type}
                                    className="sop-palette-item"
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/sop-node-type', def.type);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                >
                                    <div className={`sop-palette-icon ${def.cssClass}`}>{def.icon}</div>
                                    <div className="sop-palette-text">
                                        <span className="sop-palette-name">{t(`sopBuilder.nodeTypes.${def.type.toLowerCase()}.label`, { defaultValue: def.label })}</span>
                                        <span className="sop-palette-desc">{t(`sopBuilder.nodeTypes.${def.type.toLowerCase()}.desc`, { defaultValue: def.desc })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Details Tab */}
                    {paletteTab === 'details' && (
                        <div>
                            {/* Name */}
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('sopBuilder.panel.name')}</div>
                                <Input
                                    value={sopName}
                                    onChange={e => setSopName(e.target.value)}
                                    style={{ fontSize: '0.8rem' }}
                                />
                            </div>

                            {/* Description */}
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <FileText size={12} /> {t('sopBuilder.panel.description')}
                                </div>
                                <Textarea
                                    rows={5}
                                    value={sopDesc}
                                    onChange={e => setSopDesc(e.target.value)}
                                    placeholder="业务背景：该 SOP 适用于哪类通话、涉及哪些业务..."
                                    style={{ fontSize: '0.75rem' }}
                                />
                            </div>

                            {/* Category */}
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('sopBuilder.panel.category')}</div>
                                <Select value={sopCategory} onChange={e => setSopCategory(e.target.value)}>
                                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </Select>
                            </div>

                            {/* Hotwords */}
                            <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 10 }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Tag size={12} /> {t('sopBuilder.panel.hotwords')}
                                </div>
                                <Textarea
                                    rows={4}
                                    value={sopHotwords}
                                    onChange={e => setSopHotwords(e.target.value)}
                                    placeholder="续费, 保额, 髋关节, 驱虫补贴..."
                                    style={{ fontSize: '0.75rem', marginBottom: 6 }}
                                />
                                {sopHotwords.trim() && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
                                        {sopHotwords.split(/[,，]/).filter(s => s.trim()).map((hw, i) => (
                                            <span key={i} style={{
                                                fontSize: '0.65rem', padding: '2px 6px',
                                                background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                                                borderRadius: 4, fontWeight: 500
                                            }}>{hw.trim()}</span>
                                        ))}
                                    </div>
                                )}

                                <Button
                                    onClick={async () => {
                                        if (!id) return;
                                        setExtracting(true);
                                        try {
                                            const existing = sopHotwords.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                                            const res = await api.post(`/sops/${id}/extract-hotwords`, { existingHotwords: existing });
                                            const suggestions = res.data?.suggestions || [];
                                            const removals = res.data?.removals || [];
                                            if (suggestions.length > 0 || removals.length > 0) {
                                                setLlmSuggestions(suggestions);
                                                setLlmRemovals(removals);
                                                setShowSuggestPanel(true);
                                            } else {
                                                setToast({ message: 'No suggestions or issues found', type: 'error' });
                                            }
                                        } catch (err: any) {
                                            setToast({ message: err.message || 'LLM extraction failed', type: 'error' });
                                        } finally {
                                            setExtracting(false);
                                        }
                                    }}
                                    disabled={extracting || !id}
                                    style={{ width: '100%', fontSize: '0.75rem', padding: '6px 8px', marginBottom: 8 }}
                                >
                                    {extracting ? <><Loader2 size={12} className="spin" /> Analyzing...</> : <><Sparkles size={12} /> LLM Extract</>}
                                </Button>

                                {showSuggestPanel && (llmSuggestions.length > 0 || llmRemovals.length > 0) && (
                                    <div style={{ marginBottom: 10 }}>
                                        <LLMSuggestPanel
                                            suggestions={llmSuggestions}
                                            removals={llmRemovals}
                                            existingItems={sopHotwords.split(/[,，]/).map(s => s.trim()).filter(Boolean)}
                                            onAdd={(selected) => {
                                                const existing = sopHotwords.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                                                const merged = [...new Set([...existing, ...selected])];
                                                setSopHotwords(merged.join(', '));
                                                setToast({ message: `✨ Added ${selected.length} terms`, type: 'success' });
                                            }}
                                            onRemove={(toRemove) => {
                                                const existing = sopHotwords.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                                                const removeSet = new Set(toRemove.map(t => t.toLowerCase()));
                                                const filtered = existing.filter(w => !removeSet.has(w.toLowerCase()));
                                                setSopHotwords(filtered.join(', '));
                                                setToast({ message: `🗑️ Removed ${toRemove.length} terms`, type: 'success' });
                                            }}
                                            onClose={() => setShowSuggestPanel(false)}
                                            title="ASR Hotword Audit"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Center: Canvas */}
                <div className="sop-canvas" ref={reactFlowWrapper}>
                    {loading ? (
                        <div className="sop-canvas-loading">{t('sopBuilder.loadingCanvas')}</div>
                    ) : (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onInit={setRfInstance}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onEdgeClick={onEdgeClick}
                            onNodeClick={onNodeClick}
                            onNodeDoubleClick={onNodeDoubleClick}
                            onPaneClick={onPaneClick}
                            nodeTypes={nodeTypes}
                            fitView
                            attributionPosition="bottom-right"
                        >
                            <Background color="#ccc" gap={16} />
                            <Controls />
                            <MiniMap
                                nodeStrokeColor={(n: any) => {
                                    if (n.data?.type === 'VOICE_PROMPT') return '#10b981';
                                    if (n.data?.type === 'TEMPLATE_SUGGESTION') return '#3b82f6';
                                    if (n.data?.type === 'LLM_REWRITE') return '#a855f7';
                                    if (n.data?.type === 'CONDITION') return '#f59e0b';
                                    if (n.data?.type === 'API_CALL') return '#0ea5e9';
                                    if (n.data?.type === 'HUMAN_HANDOFF') return '#ef4444';
                                    return '#64748b';
                                }}
                                nodeColor={() => 'var(--bg-card)'}
                            />
                        </ReactFlow>
                    )}
                </div>

                {/* Right: Properties Panel — Node */}
                {showNodeProps && (
                    <div className="sop-props">
                        <div className="sop-props-header">
                            <h3 className="sop-props-title"><Settings size={16} /> {t('sopBuilder.nodeProperties')}</h3>
                            <Button onClick={() => setEditingNodeId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></Button>
                        </div>
                        <div className="sop-props-body">
                            <div className="sop-field">
                                <label>{t('sopBuilder.nodeType')}</label>
                                <Select value={(editingNode.data as any).type || 'VOICE_PROMPT'} onChange={e => updateNodeData(editingNode.id, 'type', e.target.value)}>
                                    {NODE_TYPE_DEFS.map(d => <option key={d.type} value={d.type}>{t(`sopBuilder.nodeTypes.${d.type}.label`, { defaultValue: d.label })}</option>)}
                                </Select>
                            </div>

                            <div className="sop-field">
                                <label>{t('sopBuilder.nodeLabel')}</label>
                                <Input type="text" value={(editingNode.data as any).label || ''} onChange={e => updateNodeData(editingNode.id, 'label', e.target.value)} />
                            </div>

                            {(editingNode.data as any).type === 'VOICE_PROMPT' && (
                                <div className="sop-field">
                                    <label>{t('sopBuilder.ttsVoicePrompt')}</label>
                                    <Textarea rows={16} value={(editingNode.data as any).voicePrompt || ''} onChange={e => updateNodeData(editingNode.id, 'voicePrompt', e.target.value)} placeholder={t('sopBuilder.placeholders.voicePrompt')} />
                                </div>
                            )}

                            {((editingNode.data as any).type === 'TEMPLATE_SUGGESTION' || (editingNode.data as any).type === 'LLM_REWRITE') && (
                                <div className="sop-field">
                                    <label>{t('sopBuilder.llmRewriteInstructions')}</label>
                                    <Textarea rows={4} value={(editingNode.data as any).rewriteInstruction || ''} onChange={e => updateNodeData(editingNode.id, 'rewriteInstruction', e.target.value)} placeholder={t('sopBuilder.placeholders.rewriteInstructions')} />
                                </div>
                            )}

                            {(editingNode.data as any).type === 'TEMPLATE_SUGGESTION' && (
                                <div className="sop-field">
                                    <label>{t('sopBuilder.linkedTemplate')}</label>
                                    <Select value={(editingNode.data as any).templateId || ''} onChange={e => updateNodeData(editingNode.id, 'templateId', e.target.value || null)}>
                                        <option value="">{t('sopBuilder.noTemplate')}</option>
                                        {templateOptions.map((t: any) => (
                                            <option key={t._id} value={t._id}>
                                                {t.translations?.[0]?.displayName || t.name}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            )}

                            {(editingNode.data as any).type === 'API_CALL' && (
                                <div className="sop-field">
                                    <label>{t('sopBuilder.apiEndpointPath')}</label>
                                    <Input type="text" value={(editingNode.data as any).apiEndpoint || ''} onChange={e => updateNodeData(editingNode.id, 'apiEndpoint', e.target.value)} placeholder={t('sopBuilder.placeholders.apiEndpoint')} />
                                </div>
                            )}

                            <div className="sop-props-footer">
                                <Button className="sop--delete" onClick={() => { setEditingNodeId(null); setNodes((nds: Node[]) => nds.filter((n: Node) => n.id !== editingNode.id)); }}>
                                    {t('sopBuilder.deleteNode')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Right: Properties Panel — Edge */}
                {showEdgeProps && selectedEdge && (
                    <div className="sop-props">
                        <div className="sop-props-header">
                            <h3 className="sop-props-title"><GitBranch size={16} /> {t('sopBuilder.edgeProperties')}</h3>
                            <Button onClick={() => setSelectedEdgeId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></Button>
                        </div>
                        <div className="sop-props-body">
                            <div className="sop-field">
                                <label>{t('sopBuilder.conditionType')}</label>
                                <Select
                                    value={(selectedEdge.data as any)?.conditionType || 'DEFAULT'}
                                    onChange={e => updateEdgeData(selectedEdge.id, 'conditionType', e.target.value)}
                                >
                                    {EDGE_CONDITION_TYPES.map(ct => <option key={ct} value={ct}>{ct.replace('_', ' ')}</option>)}
                                </Select>
                            </div>

                            {(selectedEdge.data as any)?.conditionType !== 'DEFAULT' && (
                                <div className="sop-field">
                                    <label>{t('sopBuilder.conditionValue')}</label>
                                    <Input
                                        type="text"
                                        value={(selectedEdge.data as any)?.conditionValue || ''}
                                        onChange={e => updateEdgeData(selectedEdge.id, 'conditionValue', e.target.value)}
                                        placeholder={t('sopBuilder.placeholders.conditionValue')}
                                    />
                                </div>
                            )}

                            <div className="sop-field">
                                <label>{t('sopBuilder.displayLabel')}</label>
                                <Input
                                    type="text"
                                    value={(selectedEdge.label as string) || ''}
                                    onChange={e => updateEdgeData(selectedEdge.id, 'label', e.target.value)}
                                    placeholder={t('sopBuilder.placeholders.edgeLabel')}
                                />
                            </div>

                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.5rem', background: 'var(--bg-subtle)', borderRadius: '6px' }}>
                                <strong>{t('sopBuilder.from')}:</strong> {(nodes.find(n => n.id === selectedEdge.source)?.data as any)?.label || selectedEdge.source}<br />
                                <strong>{t('sopBuilder.to')}:</strong> {(nodes.find(n => n.id === selectedEdge.target)?.data as any)?.label || selectedEdge.target}
                            </div>

                            <div className="sop-props-footer">
                                <Button className="sop--delete" onClick={() => {
                                    setEdges((eds: Edge[]) => eds.filter(e => e.id !== selectedEdge.id));
                                    setSelectedEdgeId(null);
                                }}>
                                    {t('sopBuilder.deleteEdge')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default SOPBuilder;
