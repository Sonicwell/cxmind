import { describe, it, expect } from 'vitest'
import { transformApiNodes, transformApiEdges, transformApiSop } from '~/utils/sopTransform'

describe('transformApiNodes', () => {
    it('扁平后端节点 → React Flow data 嵌套格式', () => {
        const raw = [
            { id: 'n1', type: 'VOICE_PROMPT', label: 'Greeting', voicePrompt: 'Hello, how can I help?' },
        ]
        const result = transformApiNodes(raw)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('n1')
        expect(result[0].data.type).toBe('VOICE_PROMPT')
        expect(result[0].data.label).toBe('Greeting')
        expect(result[0].data.prompt).toBe('Hello, how can I help?')
        expect(result[0].data.description).toBe('Hello, how can I help?')
        expect(result[0].position).toEqual({ x: 0, y: 0 })
    })

    it('空数组返回空数组', () => {
        expect(transformApiNodes([])).toEqual([])
    })

    it('非数组输入返回空数组', () => {
        expect(transformApiNodes(null as any)).toEqual([])
        expect(transformApiNodes(undefined as any)).toEqual([])
    })

    it('metadata 中的位置信息保留', () => {
        const raw = [{ id: 'n1', type: 'CONDITION', label: 'Check', metadata: { x: 200, y: 300 } }]
        const result = transformApiNodes(raw)
        expect(result[0].position).toEqual({ x: 200, y: 300 })
    })

    it('各 node type 字段映射正确', () => {
        const cases = [
            {
                input: { id: 'n1', type: 'VOICE_PROMPT', label: 'VP', voicePrompt: 'Say hello' },
                expect: { type: 'VOICE_PROMPT', label: 'VP', prompt: 'Say hello', description: 'Say hello' },
            },
            {
                input: { id: 'n2', type: 'TEMPLATE_SUGGESTION', label: 'TS', templateId: 'tpl_1' },
                expect: { type: 'TEMPLATE_SUGGESTION', label: 'TS', templateId: 'tpl_1' },
            },
            {
                input: { id: 'n3', type: 'LLM_REWRITE', label: 'LR', rewriteInstruction: 'Apologize' },
                expect: { type: 'LLM_REWRITE', label: 'LR', prompt: 'Apologize' },
            },
            {
                input: { id: 'n4', type: 'API_CALL', label: 'API', apiEndpoint: '/api/crm/lookup' },
                expect: { type: 'API_CALL', label: 'API', apiEndpoint: '/api/crm/lookup' },
            },
            {
                input: { id: 'n5', type: 'HUMAN_HANDOFF', label: 'Handoff' },
                expect: { type: 'HUMAN_HANDOFF', label: 'Handoff' },
            },
            {
                input: { id: 'n6', type: 'CONDITION', label: 'Branch' },
                expect: { type: 'CONDITION', label: 'Branch' },
            },
        ]

        for (const c of cases) {
            const [node] = transformApiNodes([c.input])
            expect(node.data.type).toBe(c.expect.type)
            expect(node.data.label).toBe(c.expect.label)
            if (c.expect.prompt) expect(node.data.prompt).toBe(c.expect.prompt)
            if (c.expect.templateId) expect(node.data.templateId).toBe(c.expect.templateId)
            if (c.expect.apiEndpoint) expect(node.data.apiEndpoint).toBe(c.expect.apiEndpoint)
        }
    })

    it('已有 data 嵌套格式的节点（兼容模式）不被破坏', () => {
        const raw = [{
            id: 'n1',
            type: 'custom',
            position: { x: 100, y: 200 },
            data: { type: 'VOICE_PROMPT', label: 'Already nested', description: 'Desc', prompt: 'Prompt' },
        }]
        const result = transformApiNodes(raw)
        expect(result[0].data.type).toBe('VOICE_PROMPT')
        expect(result[0].data.label).toBe('Already nested')
        expect(result[0].data.prompt).toBe('Prompt')
    })

    it('缺失 data 字段的节点不崩溃', () => {
        const raw = [{ id: 'n1', type: 'VOICE_PROMPT', label: 'No data field' }]
        const result = transformApiNodes(raw)
        expect(result[0].data.type).toBe('VOICE_PROMPT')
        expect(result[0].data.label).toBe('No data field')
    })
})

describe('transformApiEdges', () => {
    it('扁平边 → 嵌套 data 格式', () => {
        const raw = [
            { id: 'e1', source: 'n1', target: 'n2', conditionType: 'INTENT', conditionValue: 'refund', label: 'Refund' },
        ]
        const result = transformApiEdges(raw)
        expect(result).toHaveLength(1)
        expect(result[0].data?.conditionType).toBe('INTENT')
        expect(result[0].data?.conditionValue).toBe('refund')
        expect(result[0].data?.label).toBe('Refund')
    })

    it('无 conditionType 默认为 DEFAULT', () => {
        const raw = [{ id: 'e1', source: 'n1', target: 'n2' }]
        const result = transformApiEdges(raw)
        expect(result[0].data?.conditionType).toBe('DEFAULT')
    })

    it('空/非法输入返回空数组', () => {
        expect(transformApiEdges([])).toEqual([])
        expect(transformApiEdges(null as any)).toEqual([])
    })
})

describe('transformApiSop', () => {
    it('完整 SOP 响应转换', () => {
        const raw = {
            _id: 'sop_1',
            name: 'Test SOP',
            description: 'A test',
            category: 'CUSTOMER_SERVICE',
            status: 'PUBLISHED',
            startNodeId: 'n1',
            nodes: [
                { id: 'n1', type: 'VOICE_PROMPT', label: 'Start', voicePrompt: 'Welcome' },
                { id: 'n2', type: 'CONDITION', label: 'Branch' },
            ],
            edges: [
                { id: 'e1', source: 'n1', target: 'n2', conditionType: 'DEFAULT' },
            ],
        }
        const result = transformApiSop(raw)
        expect(result._id).toBe('sop_1')
        expect(result.name).toBe('Test SOP')
        expect(result.nodes).toHaveLength(2)
        expect(result.nodes[0].data.type).toBe('VOICE_PROMPT')
        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].data?.conditionType).toBe('DEFAULT')
        expect(result.startNodeId).toBe('n1')
    })

    it('缺少 nodes/edges 不崩溃', () => {
        const raw = { _id: 'sop_2', name: 'Empty SOP' }
        const result = transformApiSop(raw)
        expect(result.nodes).toEqual([])
        expect(result.edges).toEqual([])
    })
})
