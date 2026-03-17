import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test config for Admin UI.
 * 要求: AS (port 3000) + AU (port 5173) 已在本地运行
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,      // 串行更稳定
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    timeout: 30_000,

    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        headless: true,
    },

    projects: [
        // 全局登录 setup（只运行一次）
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
        },
        // Agent 角色登录 setup
        {
            name: 'setup-agent',
            testMatch: /auth-agent\.setup\.ts/,
        },
        // Login 测试需要未登录状态，独立运行
        {
            name: 'login',
            use: {
                ...devices['Desktop Chrome'],
                storageState: { cookies: [], origins: [] },
            },
            testMatch: /login\.spec\.ts/,
        },
        // 其他测试复用已保存的登录状态 (admin)
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/user.json',
            },
            dependencies: ['setup'],
            testIgnore: [/auth\.setup\.ts/, /auth-agent\.setup\.ts/, /login\.spec\.ts/, /rbac\.spec\.ts/, /pcap-.*\.spec\.ts/],
        },
        // Agent 角色 RBAC 测试
        {
            name: 'agent',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/agent.json',
            },
            dependencies: ['setup-agent'],
            testMatch: /rbac\.spec\.ts/,
        },
        // PCAP Simulator 真实数据注入 E2E (需 RUN_PCAP_E2E=true + IE/AS/CH 全栈在线)
        ...(process.env.RUN_PCAP_E2E === 'true' ? [{
            name: 'pcap-e2e',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/user.json',
            },
            dependencies: ['setup'],
            testMatch: /pcap-.*\.spec\.ts/,
        }] : []),
    ],
});
