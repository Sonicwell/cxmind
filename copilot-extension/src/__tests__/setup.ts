/**
 * Chrome Extension API mock —— 所有测试共享
 * 覆盖 storage / runtime / action / sidePanel / notifications / alarms / identity / windows / tabs
 */
import { vi } from 'vitest'

// ── storage mock (sync + local + session + onChanged) ──
const storageData: Record<string, Record<string, any>> = { sync: {}, local: {}, session: {} }

function makeStorageArea(ns: string) {
    return {
        get: vi.fn((keys: string | string[], cb?: (r: Record<string, any>) => void) => {
            const ks = typeof keys === 'string' ? [keys] : keys
            const result: Record<string, any> = {}
            ks.forEach(k => { if (storageData[ns][k] !== undefined) result[k] = storageData[ns][k] })
            if (cb) cb(result)
            return Promise.resolve(result)
        }),
        set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            Object.assign(storageData[ns], items)
            if (cb) cb()
            return Promise.resolve()
        }),
        remove: vi.fn((keys: string | string[], cb?: () => void) => {
            const ks = typeof keys === 'string' ? [keys] : keys
            ks.forEach(k => delete storageData[ns][k])
            if (cb) cb()
            return Promise.resolve()
        }),
    }
}

const chromeStub = {
    storage: {
        sync: makeStorageArea('sync'),
        local: makeStorageArea('local'),
        session: makeStorageArea('session'),
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
        sendMessage: vi.fn(() => Promise.resolve()),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: vi.fn((p: string) => `chrome-extension://mock-id/${p}`),
        getContexts: vi.fn(() => Promise.resolve([])),
        lastError: null as any,
    },
    action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
    },
    sidePanel: {
        setPanelBehavior: vi.fn(),
        open: vi.fn(),
    },
    notifications: {
        create: vi.fn(),
    },
    alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
    },
    identity: {
        getAuthToken: vi.fn(),
        removeCachedAuthToken: vi.fn(),
    },
    windows: {
        create: vi.fn(() => Promise.resolve({ id: 999 })),
        remove: vi.fn(() => Promise.resolve()),
        get: vi.fn(() => Promise.resolve({ state: 'normal', focused: true })),
        update: vi.fn(() => Promise.resolve()),
        onRemoved: { addListener: vi.fn() },
    },
    tabs: {
        query: vi.fn((_q: any, cb?: (tabs: any[]) => void) => {
            if (cb) cb([])
            return Promise.resolve([])
        }),
        sendMessage: vi.fn(() => Promise.resolve()),
    },
    offscreen: {
        createDocument: vi.fn(() => Promise.resolve()),
        Reason: { WEB_RTC: 'WEB_RTC' },
    },
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
}

// @ts-expect-error global mock
globalThis.chrome = chromeStub

// 每个测试重置 storage 和 mock 调用
beforeEach(() => {
    storageData.sync = {}
    storageData.local = {}
    storageData.session = {}
    vi.clearAllMocks()
})

export { storageData, chromeStub }

// ── ResizeObserver mock ──
class MockResizeObserver {
    callback: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) { this.callback = cb }
    observe() { }
    unobserve() { }
    disconnect() { }
}
globalThis.ResizeObserver = MockResizeObserver as any

// ── fetch mock (需要时可在测试中 vi.mocked(fetch).mockResolvedValueOnce(...)) ──
globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    status: 200,
} as Response))

