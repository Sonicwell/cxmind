// JWT 解码 & Agent 信息提取 — 统一入口
// 替代原本散布在 useAuth / background / sidepanel / InboxPanel 中的 4 处 atob 解码
import { DEMO_ENABLED } from '~/utils/demo-flag'

/**
 * 安全解码 JWT payload，失败返回 null
 */
export function decodeJWT(token: string): Record<string, any> | null {
    try {
        const parts = token.split('.')
        if (parts.length < 3) return null
        const payload = parts[1]
        // 兼容 URL-safe base64 和含中文的 payload
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        return JSON.parse(decoded)
    } catch {
        return null
    }
}

/**
 * 检测 token 是否已过期
 * 无 exp 字段视为未过期; 无效 token 视为已过期
 */
export function isTokenExpired(token: string): boolean {
    const payload = decodeJWT(token)
    if (!payload) return true
    if (!payload.exp) return false
    return payload.exp < Math.floor(Date.now() / 1000)
}

/**
 * 从 JWT 或 demo token 提取坐席信息
 * 统一了 useAuth.extractAgentInfo 的逻辑
 */
export function extractAgentInfo(token: string) {
    if (DEMO_ENABLED && token === 'demo-mode-token') {
        return {
            displayName: 'Demo Agent',
            sipNumber: '1001',
            email: 'demo@example.com',
            userId: 'demo-agent-001',
            role: 'agent' as const,
            avatar: null as string | null,
            groupIds: [] as string[],
            googleEmail: null as string | null,
            isDemo: true,
        }
    }

    const decoded = decodeJWT(token)
    if (!decoded) return null

    return {
        displayName: decoded.displayName || decoded.name || 'Agent',
        sipNumber: decoded.sipExtension || decoded.sipNumber || '',
        email: decoded.email || '',
        userId: decoded.userId || '',
        agentId: decoded.agentId || '',
        role: decoded.role || 'agent',
        avatar: decoded.avatar || null,
        groupIds: decoded.groupIds || [],
        googleEmail: decoded.googleEmail || null,
        isDemo: false,
    }
}
