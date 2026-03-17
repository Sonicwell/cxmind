import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { handleMockGet } from './mock-api-responses';

// ── Types ────────────────────────────────────────────────────────────────────
/** token refresh期间排队的promise */
interface FailedQueueEntry {
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
}

// ── Mock实时引擎State ──
// demo模式下模拟一通进行中的call, 给Copilot推渐进式AI洞察
const activeDemoStreams = new Map<string, { currentLine: number }>();

// ── API Instance ──────────────────────────────────────────────────────────────
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    headers: { 'Content-Type': 'application/json' },
    timeout: 60000,
});

// Demo Mode拦截: 写操作返回模拟成功
// Demo模式拦截器: 拦截写操作, 返回模拟成功
const mockAdapter = async (config: InternalAxiosRequestConfig) => {
    const method = config.method?.toLowerCase();

    // ── OTP网关例外 ──
    // demo模式下send-otp走独立的Serverless Gateway, 和生产app-node隔离
    if (config.url?.endsWith('/auth/send-otp')) {
        console.log(`[Demo Mode] 🚀 Redirecting send-otp to Serverless Gateway`);
        // Use standard axios to bypass this interceptor
        const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        return axios.post('https://cxmi-demo-gateway.vercel.app/api/send-otp', parsedData);
    }

    // ── OTP验证例外 ──
    if (config.url?.endsWith('/auth/verify-otp')) {
        console.log(`[Demo Mode] 🔐 Redirecting verify-otp to Serverless Gateway for statutory check`);
        const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        return axios.post('https://cxmi-demo-gateway.vercel.app/api/verify-otp', parsedData).catch((err: any) => {
            return Promise.reject(err);
        });
    }

    // ── 模拟Copilot实时Stream ──
    if (config.url?.includes('/copilot/stream/')) {
        const streamId = config.url.split('/').pop() || 'demo_call';
        if (!activeDemoStreams.has(streamId)) {
            activeDemoStreams.set(streamId, { currentLine: 0 });
        }
        const state = activeDemoStreams.get(streamId)!;

        // Mock渐进式脚本 (典型销售场景)
        const mockRealtimeScript = [
            { text: "Hello, am I speaking with Mr. Johnson?", speaker: "agent", emotion: "neutral" },
            { text: "Yes, this is him. Who's calling?", speaker: "customer", emotion: "neutral" },
            { text: "Hi Mr. Johnson! This is Alex from CXMI. I'm calling about the cloud optimization report you requested.", speaker: "agent", emotion: "happy" },
            { text: "Oh, right. I did request that piece. Honestly, our AWS bill has been completely out of control lately.", speaker: "customer", emotion: "frustrated" },
            { text: "I completely understand. Many of our clients see an immediate 30% reduction using our automated AI scanning. Do you have 2 minutes to review the top 3 leaks we found?", speaker: "agent", emotion: "happy" },
            { text: "Not right now, I'm literally walking into a meeting. Can we do this Friday?", speaker: "customer", emotion: "neutral" },
            { text: "Absolutely, I'll send a calendar invite for Friday at 10 AM. Talk to you then!", speaker: "agent", emotion: "happy" }
        ];

        let payload = null;
        if (state.currentLine < mockRealtimeScript.length) {
            payload = mockRealtimeScript[state.currentLine];
            state.currentLine++;
        }

        return {
            data: { success: true, event: payload ? { ...payload, timestamp: new Date().toISOString() } : null, isTyping: state.currentLine < mockRealtimeScript.length },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: {}
        };
    }

    // ── GET 请求: 返回 mock 数据 ──
    if (method === 'get') {
        return handleMockGet(config);
    }

    console.log(`[Demo Mode] 🛡️ Blocking ${method?.toUpperCase()} request to ${config.url}`);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 600));

    // 返回mock成功
    return {
        data: { success: true, message: 'Demo Action Simulated' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {}
    };
};

// request拦截器: 挂token、timezone, 处理demo模式
api.interceptors.request.use(
    (config) => {
        const isBuildDemo = import.meta.env.VITE_MOCK_MODE === 'true';
        const isDemo = isBuildDemo || localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true';
        const isAuth = config.url?.includes('/auth/');
        const isDemoMgmt = config.url?.includes('/platform/demo/');
        const isModules = config.url?.endsWith('/modules');

        // demo模式下所有请求都走 mockAdapter (除了 auth，demo management，和 modules)
        // timeline/generate-profile 仅在 Dashboard Toggle 模式(有后端)下豁免，Vite build 模式下走前端 mock
        const isExemptedContexts = isAuth || isDemoMgmt || isModules || (!isBuildDemo && (config.url?.includes('timeline') || config.url?.includes('/generate-profile')));

        if (isDemo && !isExemptedContexts) {
            config.adapter = mockAdapter;
        } else if (isDemo && (config.url?.endsWith('/auth/send-otp') || config.url?.endsWith('/auth/verify-otp') || config.url?.includes('/auth/sessions'))) {
            // demo模式下这些auth接口也走mock adapter
            config.adapter = mockAdapter;
        }

        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // 带上客户端timezone, ClickHouse时区查询用
        try {
            config.headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            // fallback — header缺失时server默认UTC
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

let isRefreshing = false;
let failedQueue: FailedQueueEntry[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token!);
        }
    });
    failedQueue = [];
};

// response拦截器: 处理401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            // refresh接口自己401了就别再retry, 防死循环
            if (originalRequest.url?.includes('/auth/refresh')) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = localStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);

            if (!refreshToken) {
                isRefreshing = false;
                forceLogout();
                return Promise.reject(error);
            }

            try {
                // 用原生axios发, 绕过自己的拦截器防死循环
                const rs = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
                    refreshToken
                });

                const { token: newToken, refreshToken: newRefreshToken } = rs.data;

                if (localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)) {
                    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, newToken);
                    localStorage.setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, newRefreshToken);
                } else {
                    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, newToken);
                    sessionStorage.setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, newRefreshToken);
                }

                api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

                processQueue(null, newToken);
                isRefreshing = false;

                return api(originalRequest);
            } catch (_error) {
                processQueue(_error, null);
                isRefreshing = false;
                forceLogout();
                return Promise.reject(_error);
            }
        }

        return Promise.reject(error);
    }
);

function forceLogout() {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.AUTH_PERMISSIONS);
    localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_PERMISSIONS);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
}


export const getLayouts = async () => {
    const response = await api.get('/layouts');
    return response.data;
};

export const getLayoutStats = async (id: string) => {
    const response = await api.get(`/layouts/${id}/stats`);
    return response.data;
};

export const createLayout = async (data: any) => {
    const response = await api.post('/layouts', data);
    return response.data;
};

export const updateLayout = async (id: string, data: any) => {
    const response = await api.put(`/layouts/${id}`, data);
    return response.data;
};

export const deleteLayout = async (id: string) => {
    const response = await api.delete(`/layouts/${id}`);
    return response.data;
};

export const reorderLayouts = async (orderedIds: string[]) => {
    const response = await api.post('/layouts/reorder', { orderedIds });
    return response.data;
};

export const getAgents = async () => {
    const response = await api.get('/client/agents');
    return response.data;
};

export const getSipOnlineAgents = async (): Promise<{ online: string[]; copilotOnline: string[] }> => {
    try {
        const response = await api.get('/client/agents/sip-online');
        return {
            online: response.data?.data || [],
            copilotOnline: response.data?.copilotOnline || [],
        };
    } catch {
        return { online: [], copilotOnline: [] };
    }
};


export const getPlatformSettings = async () => {
    const response = await api.get('/platform/settings');
    return response.data.data;
};

export const updatePlatformSettings = async (data: any) => {
    const response = await api.patch('/platform/settings', data);
    return response.data.data;
};

export function getDeviceId(): string {
    const key = 'cxmind:device-id';
    let id = localStorage.getItem(key);
    if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'dev-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem(key, id);
    }
    return id;
}

export default api;
