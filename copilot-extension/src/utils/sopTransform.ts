/**
 * SOP 后端扁平格式 ↔ 前端 React Flow data 嵌套格式 转换工具
 *
 * 后端 ISOPNode: { id, type, label, voicePrompt, ... }     (扁平)
 * 前端 SOPNode:  { id, type, position, data: { type, label, ... } }  (React Flow)
 *
 * 兼容两种输入：如果节点已有 data 嵌套结构则透传，否则从顶层字段提取
 */

// ─── Types (Copilot 侧使用的 React Flow 格式) ───

export interface SOPNode {
    id: string
    type: string
    position: { x: number; y: number }
    data: {
        label?: string
        type?: string
        description?: string
        prompt?: string
        templateId?: string
        templateName?: string
        apiEndpoint?: string
        conditionType?: string
        conditionValue?: string
        [key: string]: any
    }
}

export interface SOPEdge {
    id: string
    source: string
    target: string
    data?: {
        conditionType?: string
        conditionValue?: string
        label?: string
    }
}

export interface SOPBlueprint {
    _id: string
    name: string
    description: string
    category: string
    status: string
    nodes: SOPNode[]
    edges: SOPEdge[]
    startNodeId?: string
}

// ─── Transform Functions ───

/**
 * 后端扁平节点 → React Flow data 嵌套格式
 * 兼容已是嵌套格式的数据（如果 n.data 已存在则优先用 n.data 中的值）
 */
export function transformApiNodes(rawNodes: any[]): SOPNode[] {
    if (!Array.isArray(rawNodes)) return []
    return rawNodes.map((n: any) => ({
        id: n.id,
        type: n.type || 'custom',
        position: { x: n.metadata?.x || 0, y: n.metadata?.y || 0 },
        data: {
            label: n.label || n.data?.label,
            type: n.data?.type || n.type,
            description: n.voicePrompt || n.data?.description,
            prompt: n.voicePrompt || n.rewriteInstruction || n.data?.prompt,
            templateId: n.templateId || n.data?.templateId,
            templateName: n.data?.templateName,
            apiEndpoint: n.apiEndpoint || n.data?.apiEndpoint,
        }
    }))
}

/**
 * 后端扁平边 → 前端嵌套 data 格式
 */
export function transformApiEdges(rawEdges: any[]): SOPEdge[] {
    if (!Array.isArray(rawEdges)) return []
    return rawEdges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: {
            conditionType: e.conditionType || e.data?.conditionType || 'DEFAULT',
            conditionValue: e.conditionValue || e.data?.conditionValue,
            label: e.label || e.data?.label,
        }
    }))
}

/**
 * 完整 SOP API 响应 → SOPBlueprint (含节点/边转换)
 */
export function transformApiSop(raw: any): SOPBlueprint {
    return {
        _id: raw._id,
        name: raw.name,
        description: raw.description,
        category: raw.category,
        status: raw.status,
        nodes: transformApiNodes(raw.nodes),
        edges: transformApiEdges(raw.edges),
        startNodeId: raw.startNodeId,
    }
}
