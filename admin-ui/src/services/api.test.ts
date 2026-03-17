import { describe, it, expect, vi, beforeEach } from 'vitest';

// 必须在 import api 之前 mock, 否则 axios 拦截器在 import 时就执行了
vi.mock('axios', async () => {
    const actual = await vi.importActual('axios') as any;
    return {
        ...actual,
        default: {
            ...actual.default,
            create: vi.fn(() => ({
                defaults: { baseURL: '/api' },
                interceptors: {
                    request: { use: vi.fn() },
                    response: { use: vi.fn() },
                },
                get: vi.fn(),
                post: vi.fn(),
            })),
        },
    };
});

// mock constants
vi.mock('../constants/storage-keys', () => ({
    STORAGE_KEYS: {
        AUTH_TOKEN: 'auth_token',
        AUTH_REFRESH_TOKEN: 'auth_refresh_token',
        AUTH_PERMISSIONS: 'auth_permissions',
        AUTH_USER: 'auth_user',
    },
}));

vi.mock('./mock-api-responses', () => ({
    handleMockGet: vi.fn(),
}));

describe('getDeviceId', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should generate and persist a device ID on first call', async () => {
        const { getDeviceId } = await import('./api');
        const id = getDeviceId();
        expect(id).toBeDefined();
        expect(id.length).toBeGreaterThan(5);
        // 应该存到 localStorage
        expect(localStorage.getItem('cxmind:device-id')).toBe(id);
    });

    it('should return the same ID on subsequent calls', async () => {
        const { getDeviceId } = await import('./api');
        const id1 = getDeviceId();
        const id2 = getDeviceId();
        expect(id1).toBe(id2);
    });

    it('should return existing ID from localStorage', async () => {
        localStorage.setItem('cxmind:device-id', 'test-device-123');
        const { getDeviceId } = await import('./api');
        expect(getDeviceId()).toBe('test-device-123');
    });
});
