import { describe, it, expect, vi } from 'vitest'
import { decodeJWT, isTokenExpired, extractAgentInfo } from '~/utils/jwt'

// 测试环境启用 demo flag，让 demo-mode-token 分支可测
vi.mock('~/utils/demo-flag', () => ({ DEMO_ENABLED: true }))

describe('decodeJWT', () => {
    // 生成简单测试 JWT: header.payload.signature
    const makeToken = (payload: Record<string, any>) => {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
        const body = btoa(JSON.stringify(payload))
        return `${header}.${body}.fake-sig`
    }

    it('正常 JWT 返回 payload 对象', () => {
        const payload = { userId: 'u1', email: 'test@example.com', role: 'agent' }
        const result = decodeJWT(makeToken(payload))
        expect(result).toMatchObject(payload)
    })

    it('malformed token 返回 null', () => {
        expect(decodeJWT('not-a-jwt')).toBeNull()
        expect(decodeJWT('')).toBeNull()
        expect(decodeJWT('a.b')).toBeNull() // only 2 parts
    })

    it('demo-mode-token 返回 null (不是真 JWT)', () => {
        expect(decodeJWT('demo-mode-token')).toBeNull()
    })

    it('payload 包含中文等 unicode 字符也能正确解码', () => {
        const payload = { displayName: '测试坐席', role: 'admin' }
        const header = btoa(JSON.stringify({ alg: 'HS256' }))
        // btoa 不支持非 ASCII, 用 base64 encoding
        const body = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
        const token = `${header}.${body}.sig`
        const result = decodeJWT(token)
        expect(result).not.toBeNull()
    })
})

describe('isTokenExpired', () => {
    const makeToken = (payload: Record<string, any>) => {
        const header = btoa(JSON.stringify({ alg: 'HS256' }))
        const body = btoa(JSON.stringify(payload))
        return `${header}.${body}.sig`
    }

    it('exp 在未来的 token 未过期', () => {
        const futureExp = Math.floor(Date.now() / 1000) + 3600
        expect(isTokenExpired(makeToken({ exp: futureExp }))).toBe(false)
    })

    it('exp 在过去的 token 已过期', () => {
        const pastExp = Math.floor(Date.now() / 1000) - 100
        expect(isTokenExpired(makeToken({ exp: pastExp }))).toBe(true)
    })

    it('无 exp 字段视为未过期', () => {
        expect(isTokenExpired(makeToken({ userId: 'u1' }))).toBe(false)
    })

    it('无效 token 视为已过期', () => {
        expect(isTokenExpired('garbage')).toBe(true)
    })
})

describe('extractAgentInfo', () => {
    const makeToken = (payload: Record<string, any>) => {
        const header = btoa(JSON.stringify({ alg: 'HS256' }))
        const body = btoa(JSON.stringify(payload))
        return `${header}.${body}.sig`
    }

    it('demo-mode-token 返回预设 demo 信息', () => {
        const info = extractAgentInfo('demo-mode-token')
        expect(info).not.toBeNull()
        expect(info!.isDemo).toBe(true)
        expect(info!.displayName).toBe('Demo Agent')
        expect(info!.userId).toBe('demo-agent-001')
    })

    it('正常 token 提取 agent 字段', () => {
        const payload = {
            userId: 'user-123',
            displayName: 'Alice',
            sipExtension: '1001',
            email: 'alice@example.com',
            role: 'supervisor',
            avatar: '/avatars/alice.png',
            groupIds: ['g1', 'g2'],
            googleEmail: 'alice@gmail.com'
        }
        const info = extractAgentInfo(makeToken(payload))
        expect(info).toMatchObject({
            userId: 'user-123',
            displayName: 'Alice',
            sipNumber: '1001',
            email: 'alice@example.com',
            role: 'supervisor',
            isDemo: false,
        })
    })

    it('缺省字段使用默认值', () => {
        const info = extractAgentInfo(makeToken({ userId: 'u1' }))
        expect(info!.displayName).toBe('Agent')
        expect(info!.sipNumber).toBe('')
        expect(info!.role).toBe('agent')
    })

    it('无效 token 返回 null', () => {
        expect(extractAgentInfo('broken-token')).toBeNull()
    })
})
