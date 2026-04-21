/**
 * V6 审计 TDD — Copilot WS URL 安全构造
 * SEC-CP-V6-1: 使用 URL 对象替换协议, 避免 .replace("http","ws") 误匹配
 */
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
    path.join(__dirname, '../../background.ts'),
    'utf8'
);

describe('SEC-CP-V6-1: WS URL 安全构造', () => {
    // 定位 connectWebSocket 函数体
    const fnStart = src.indexOf('function connectWebSocket()');
    const fnEnd = src.indexOf('\n}\n', fnStart + 100);
    const fnBlock = src.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 1000);

    it('不使用简单 .replace("http", "ws") 字符串替换', () => {
        // 不应有 apiConfig.apiUrl.replace("http", "ws") 或 .replace('http', 'ws')
        expect(fnBlock).not.toMatch(/\.replace\s*\(\s*["']http["']\s*,\s*["']ws["']\s*\)/);
    });

    it('使用 URL 对象或安全的协议替换方式', () => {
        // 应出现 new URL 或 .protocol 赋值
        expect(fnBlock).toMatch(/new URL|\.protocol\s*=/);
    });

    it('设置 pathname 为 /ws (AIO Nginx 兼容)', () => {
        expect(fnBlock).toMatch(/\.pathname\s*=\s*['"]\/ws['"]/);
    });
});
