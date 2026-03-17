import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, expect } from 'vitest'
import { useModules } from '../useModules'

// Mock `useApi`
const mockFetchApi = vi.fn()
vi.mock('~/hooks/useApi', () => ({
  useApi: () => ({
    fetchApi: mockFetchApi,
    isInitialized: true,
  })
}))

vi.mock('~/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
  })
}))

describe('useModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock Chrome Storage
    let storage: any = {}
    global.chrome = {
      storage: {
        local: {
          get: vi.fn((keys, cb) => cb({ cxmi_modules: storage['cxmi_modules'] })),
          set: vi.fn((data, cb) => {
            Object.assign(storage, data)
            if (cb) cb()
          })
        }
      }
    } as any
  })

  it('loads modules from chrome.storage.local first, then updates via API', async () => {
    const cachedModules = [
      { slug: 'contacts', tier: 'core', enabled: true },
      { slug: 'inbox', tier: 'optional', enabled: false }
    ]
    
    // Set initial cache
    global.chrome.storage.local.get = vi.fn((keys, cb) => cb({ cxmi_modules: cachedModules }))
    
    // Setup API to return an updated list (inbox enabled)
    mockFetchApi.mockResolvedValueOnce({
      modules: [
        { slug: 'contacts', tier: 'core', enabled: true },
        { slug: 'inbox', tier: 'optional', enabled: true }
      ]
    })

    const { result } = renderHook(() => useModules())

    // 1. Initial State from cache
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
      expect(result.current.modules).toEqual(cachedModules)
      // verify the module state matches cache initial
      expect(result.current.isModuleEnabled('contacts')).toBe(true)
      expect(result.current.isModuleEnabled('inbox')).toBe(false)
    })

    // 2. Fetch updates and sets storage
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith('/api/modules')
      // Check if inbox is now enabled
      expect(result.current.isModuleEnabled('inbox')).toBe(true)
    })
    
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      cxmi_modules: [
        { slug: 'contacts', tier: 'core', enabled: true },
        { slug: 'inbox', tier: 'optional', enabled: true }
      ]
    })
  })

  it('falls back to true if the module list is empty or fails to load', async () => {
    global.chrome.storage.local.get = vi.fn((keys, cb) => cb({}))
    mockFetchApi.mockRejectedValueOnce(new Error("API Down"))

    const { result } = renderHook(() => useModules())

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
      expect(result.current.modules.length).toBe(0)
    })

    // Failsafe behavior: unknown or empty permits access
    expect(result.current.isModuleEnabled('contacts')).toBe(true)
    expect(result.current.isModuleEnabled('wfm')).toBe(true)
  })
  
  it('returns true for unknown modules (graceful degradation)', async () => {
    global.chrome.storage.local.get = vi.fn((keys, cb) => cb({}))
    mockFetchApi.mockResolvedValueOnce({
      modules: [
        { slug: 'contacts', tier: 'core', enabled: true },
        { slug: 'wfm', tier: 'optional', enabled: false }
      ]
    })

    const { result } = renderHook(() => useModules())

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    expect(result.current.isModuleEnabled('contacts')).toBe(true)
    expect(result.current.isModuleEnabled('wfm')).toBe(false)
    // Unknown module should default to true so it doesn't break app flow abruptly
    expect(result.current.isModuleEnabled('some_new_feature')).toBe(true)
  })

})
