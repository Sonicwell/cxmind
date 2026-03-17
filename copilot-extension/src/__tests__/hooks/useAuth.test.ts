import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// 需要在 import useAuth 之前设置好 storage
import { storageData } from '../setup'

// 测试环境启用 demo flag
vi.mock('~/utils/demo-flag', () => ({ DEMO_ENABLED: true }))

// useAuth 依赖 extractAgentInfo，后者处理 demo-mode-token
import { useAuth } from '~/hooks/useAuth'

describe('useAuth', () => {
    beforeEach(() => {
        vi.mocked(fetch).mockReset()
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({}),
            status: 200,
        } as Response)
    })

    it('初始状态: isLoading=true, isAuthenticated=false', () => {
        const { result } = renderHook(() => useAuth())
        // init 是异步的，但初始 state 应为 loading
        expect(result.current.isLoading).toBe(true)
        expect(result.current.isAuthenticated).toBe(false)
        expect(result.current.agentInfo).toBeNull()
    })

    it('storage 有 token → 自动认证', async () => {
        // 预设 storage 中有 demo token
        storageData.local.token = 'demo-mode-token'

        const { result } = renderHook(() => useAuth())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.token).toBe('demo-mode-token')
        expect(result.current.agentInfo?.isDemo).toBe(true)
    })

    it('storage 无 token → 未认证', async () => {
        const { result } = renderHook(() => useAuth())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.isAuthenticated).toBe(false)
        expect(result.current.token).toBeNull()
    })

    it('login demo 模式触发 demo-mode-token 写入', async () => {
        const { result } = renderHook(() => useAuth())

        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.login('https://api.test.com', 'demo@example.com', 'anything')
        })

        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.token).toBe('demo-mode-token')
        expect(result.current.agentInfo?.isDemo).toBe(true)
        expect(storageData.local.token).toBe('demo-mode-token')
    })

    it('login 正常模式调用 API', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({
                    userId: 'u1', displayName: 'Test Agent', sipNumber: '8001',
                    email: 'test@test.com', role: 'agent',
                })) + '.sig',
                user: { displayName: 'Test Agent', email: 'test@test.com', role: 'agent' }
            }),
            status: 200,
        } as Response)

        const { result } = renderHook(() => useAuth())
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.login('https://api.test.com', 'test@test.com', 'pass123')
        })

        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.agentInfo?.displayName).toBe('Test Agent')
        expect(fetch).toHaveBeenCalledWith(
            'https://api.test.com/api/auth/login',
            expect.objectContaining({ method: 'POST' })
        )
    })

    it('login 失败 → error 状态', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ error: 'Invalid credentials' }),
            status: 401,
        } as Response)

        const { result } = renderHook(() => useAuth())
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.login('https://api.test.com', 'bad@test.com', 'wrong')
        })

        expect(result.current.isAuthenticated).toBe(false)
        expect(result.current.error).toBe('Invalid credentials')
    })

    it('logout 清除 token 和 state', async () => {
        storageData.local.token = 'demo-mode-token'
        const { result } = renderHook(() => useAuth())

        await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

        await act(async () => {
            await result.current.logout()
        })

        expect(result.current.isAuthenticated).toBe(false)
        expect(result.current.token).toBeNull()
        expect(result.current.agentInfo).toBeNull()
    })

    it('storage 中有 userProfile → 合并到 agentInfo', async () => {
        storageData.local.token = 'demo-mode-token'
        storageData.local.userProfile = { avatar: '/img/me.png', displayName: 'Custom Name' }

        const { result } = renderHook(() => useAuth())

        await waitFor(() => expect(result.current.isLoading).toBe(false))

        expect(result.current.agentInfo?.avatar).toBe('/img/me.png')
        expect(result.current.agentInfo?.displayName).toBe('Custom Name')
    })
})
