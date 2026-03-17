import { describe, it, expect } from 'vitest'
import { resolveDemoMock } from '~/mock/demo-api-responses'

describe('resolveDemoMock', () => {
    it('contacts/lookup (email) 返回 Sarah Chen', () => {
        const result = resolveDemoMock('/api/contact-lookup?email=sarah@test.com')
        expect(result.name).toBe('Sarah Chen')
        expect(result.tier).toBe('premium')
    })

    it('contacts/lookup (phone) 返回 James Wilson', () => {
        const result = resolveDemoMock('/api/contact-lookup?phone=123')
        expect(result.name).toBe('James Wilson')
        expect(result.tier).toBe('vip')
    })

    it('KB search 返回 results 数组', () => {
        const result = resolveDemoMock('/api/knowledge/search?q=refund')
        expect(result.results).toHaveLength(2)
        expect(result.results[0].title).toContain('Refund')
    })

    it('agent-stats 返回统计数据', () => {
        const result = resolveDemoMock('/api/agent-stats')
        expect(result.callCount).toBe(12)
        expect(result.avgCSAT).toBe(4.8)
    })

    it('conversations/inbox 返回 webchat conversation', () => {
        const result = resolveDemoMock('/api/conversations/inbox?agentId=agent1')
        expect(result.data).toHaveLength(1)
        expect(result.data[0]._id).toBe('demo-webchat-01')
    })

    it('SOP detail 返回 Refund Handling SOP', () => {
        const result = resolveDemoMock('/api/sops/demo-sop-refund')
        expect(result.data.name).toBe('Refund Handling SOP')
        expect(result.data.nodes).toHaveLength(7)
    })

    it('SOP 列表路由不误匹配详情路由', () => {
        const result = resolveDemoMock('/api/sops')
        expect(result.data).toHaveLength(1)
        expect(result.data[0]._id).toBe('demo-sop-refund')
    })

    it('activity-history 返回 6 条记录', () => {
        const result = resolveDemoMock('/api/agent/activity-history')
        expect(result.data).toHaveLength(6)
        expect(result.stats.totalCalls).toBe(4)
    })

    it('activity-history type=call 过滤', () => {
        const result = resolveDemoMock('/api/agent/activity-history?type=call')
        expect(result.data.every((i: any) => i.type === 'call')).toBe(true)
    })

    it('POST 请求静默返回空对象', () => {
        const result = resolveDemoMock('/api/random-endpoint', { method: 'POST' })
        expect(result).toEqual({})
    })

    it('未知 GET 路径返回 { data: [] }', () => {
        const result = resolveDemoMock('/api/unknown-path')
        expect(result).toEqual({ data: [] })
    })
})
