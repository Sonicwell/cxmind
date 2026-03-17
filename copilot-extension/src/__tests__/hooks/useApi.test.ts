import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { storageData } from '../setup'

// 测试环境启用 demo flag
vi.mock('~/utils/demo-flag', () => ({ DEMO_ENABLED: true }))

import { useApi } from '~/hooks/useApi'

describe('useApi', () => {
    beforeEach(() => {
        vi.mocked(fetch).mockReset()
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ data: 'test' }),
            status: 200,
        } as Response)
    })

    it('初始状态: hasToken=false, isInitialized=false', () => {
        const { result } = renderHook(() => useApi())
        expect(result.current.hasToken).toBe(false)
    })

    it('storage 中有 apiUrl + token → config 正确加载', async () => {
        storageData.sync.apiUrl = 'https://api.test.com'
        storageData.local.token = 'test-token'

        const { result } = renderHook(() => useApi())

        await waitFor(() => {
            expect(result.current.isInitialized).toBe(true)
        })

        expect(result.current.hasToken).toBe(true)
        expect(result.current.apiUrl).toBe('https://api.test.com')
    })

    it('fetchApi 正常请求带 Authorization header', async () => {
        storageData.sync.apiUrl = 'https://api.test.com'
        storageData.local.token = 'real-token'

        const { result } = renderHook(() => useApi())
        await waitFor(() => expect(result.current.isInitialized).toBe(true))

        await act(async () => {
            await result.current.fetchApi('/api/test')
        })

        expect(fetch).toHaveBeenCalledWith(
            'https://api.test.com/api/test',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer real-token',
                })
            })
        )
    })

    it('fetchApi demo 模式路由到 resolveDemoMock', async () => {
        storageData.sync.apiUrl = 'https://demo.cxmi.ai'
        storageData.local.token = 'demo-mode-token'

        const { result } = renderHook(() => useApi())
        await waitFor(() => expect(result.current.isInitialized).toBe(true))

        let data: any
        await act(async () => {
            data = await result.current.fetchApi('/api/agent-stats')
        })

        // demo mock 返回数据，且 fetch 不被调用
        expect(data).toBeDefined()
        expect(fetch).not.toHaveBeenCalled()
    })

    it('fetchApi 请求失败时 throw Error', async () => {
        storageData.sync.apiUrl = 'https://api.test.com'
        storageData.local.token = 'real-token'

        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ error: 'Not found' }),
            status: 404,
        } as Response)

        const { result } = renderHook(() => useApi())
        await waitFor(() => expect(result.current.isInitialized).toBe(true))

        await expect(act(async () => {
            await result.current.fetchApi('/api/missing')
        })).rejects.toThrow('Not found')
    })

    it('默认 apiUrl 为 localhost', () => {
        const { result } = renderHook(() => useApi())
        expect(result.current.apiUrl).toBe('http://localhost:3000')
    })
})
