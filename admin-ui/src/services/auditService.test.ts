import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api module
vi.mock('./api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../constants/storage-keys', () => ({
    STORAGE_KEYS: {
        DEMO_MODE: 'demo_mode',
    },
}));

vi.mock('./mock-data', () => ({
    getMockAuditLogs: () => ({
        data: { logs: [{ id: '1' }], total: 1, limit: 10, offset: 0 },
    }),
    getMockAuditStats: () => ({
        data: { stats: [{ category: 'auth', count: 5 }] },
    }),
    getMockAuditTimeline: () => ({
        data: [{ hour: 10, count: 5 }],
    }),
    getMockAuditLeaderboard: () => ({
        data: [{ name: 'admin', count: 42 }],
    }),
}));

import { auditService } from './auditService';
import api from './api';

describe('AuditService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    // ── getLogs ──────────────────────────────────────────────
    describe('getLogs', () => {
        it('should return mock data in demo mode', async () => {
            localStorage.setItem('demo_mode', 'true');
            const result = await auditService.getLogs({ limit: 5, offset: 0 });
            expect(result.limit).toBe(5);
            expect(result.offset).toBe(0);
        });

        it('should call API with query params in normal mode', async () => {
            vi.mocked(api.get).mockResolvedValue({
                data: { logs: [], total: 0 },
            });
            await auditService.getLogs({ category: 'auth', limit: 20 });
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining('category=auth')
            );
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining('limit=20')
            );
        });

        it('should handle default empty query', async () => {
            vi.mocked(api.get).mockResolvedValue({ data: { logs: [], total: 0 } });
            await auditService.getLogs();
            expect(api.get).toHaveBeenCalled();
        });
    });

    // ── getStats ─────────────────────────────────────────────
    describe('getStats', () => {
        it('should return mock data in demo mode', async () => {
            localStorage.setItem('demo_mode', 'true');
            const result = await auditService.getStats();
            expect(result.stats).toBeDefined();
        });

        it('should pass date filters to API', async () => {
            vi.mocked(api.get).mockResolvedValue({ data: { stats: [] } });
            await auditService.getStats('2026-01-01', '2026-02-01', 'op123');
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining('operator_id=op123')
            );
        });
    });

    // ── getTimeline ──────────────────────────────────────────
    describe('getTimeline', () => {
        it('should return mock data in demo mode', async () => {
            localStorage.setItem('demo_mode', 'true');
            const result = await auditService.getTimeline();
            expect(result).toBeDefined();
        });

        it('should fill 24h gaps in API response', async () => {
            vi.mocked(api.get).mockResolvedValue({
                data: [{ hour: 10, count: '5' }],
            });
            const result = await auditService.getTimeline();
            // 补齐24小时
            expect(result.length).toBe(24);
            // hour=10 应该有 count=5
            const h10 = result.find(r => r.hour === 10);
            expect(h10?.count).toBe(5);
        });
    });

    // ── getLeaderboard ───────────────────────────────────────
    describe('getLeaderboard', () => {
        it('should return mock data in demo mode', async () => {
            localStorage.setItem('demo_mode', 'true');
            const result = await auditService.getLeaderboard();
            expect(result).toEqual([{ name: 'admin', count: 42 }]);
        });

        it('should pass limit to API', async () => {
            vi.mocked(api.get).mockResolvedValue({ data: [] });
            await auditService.getLeaderboard(5);
            expect(api.get).toHaveBeenCalledWith('/audit/leaderboard?limit=5');
        });
    });

    // ── getMFAStats ──────────────────────────────────────────
    describe('getMFAStats', () => {
        it('should return hardcoded demo stats in demo mode', async () => {
            localStorage.setItem('demo_mode', 'true');
            const result = await auditService.getMFAStats();
            expect(result.success_rate).toBe(96);
            expect(result.total_attempts).toBe(1250);
        });

        it('should call API in normal mode', async () => {
            vi.mocked(api.get).mockResolvedValue({
                data: { total_attempts: 100, successful_attempts: 90, success_rate: 90, unique_users: 10 },
            });
            const result = await auditService.getMFAStats('2026-01-01', '2026-02-01');
            expect(result.total_attempts).toBe(100);
        });
    });

    // ── export methods ───────────────────────────────────────
    describe('exportToCSV', () => {
        it('should call API with blob responseType', async () => {
            const blob = new Blob(['csv']);
            vi.mocked(api.get).mockResolvedValue({ data: blob });
            const result = await auditService.exportToCSV({ category: 'auth' });
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining('audit/export/csv'),
                { responseType: 'blob' }
            );
        });
    });

    describe('exportToPDF', () => {
        it('should call API with blob responseType', async () => {
            const blob = new Blob(['pdf']);
            vi.mocked(api.get).mockResolvedValue({ data: blob });
            await auditService.exportToPDF();
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining('audit/export/pdf'),
                { responseType: 'blob' }
            );
        });
    });

    // ── getAnomalies ─────────────────────────────────────────
    describe('getAnomalies', () => {
        it('should return demo anomalies in demo mode', async () => {
            localStorage.setItem('demo_mode', 'true');
            const result = await auditService.getAnomalies();
            expect(result.length).toBe(2);
            expect(result[0].type).toBe('Login Spike');
        });

        it('should call API in normal mode', async () => {
            vi.mocked(api.get).mockResolvedValue({ data: [] });
            await auditService.getAnomalies(48);
            expect(api.get).toHaveBeenCalledWith('/audit/anomalies?timeWindow=48');
        });
    });

    // ── getRules ──────────────────────────────────────────────
    describe('getRules', () => {
        it('should return rules from API when available', async () => {
            const rules = [{ id: 'r1', name: 'Test' }];
            vi.mocked(api.get).mockResolvedValue({ data: { rules } });
            const result = await auditService.getRules();
            expect(result).toEqual(rules);
        });

        it('should fallback to mock data in demo mode when API fails', async () => {
            localStorage.setItem('demo_mode', 'true');
            vi.mocked(api.get).mockRejectedValue(new Error('Network'));
            const result = await auditService.getRules();
            expect(result.length).toBe(5);
            expect(result[0].id).toBe('rule_pii_redaction');
        });

        it('should throw in normal mode when API fails', async () => {
            vi.mocked(api.get).mockRejectedValue(new Error('Network'));
            await expect(auditService.getRules()).rejects.toThrow('Network');
        });
    });

    // ── CRUD rule methods ────────────────────────────────────
    describe('toggleRule', () => {
        it('should call PUT /audit/rules/:id/toggle', async () => {
            vi.mocked(api.put).mockResolvedValue({});
            await auditService.toggleRule('r1', false);
            expect(api.put).toHaveBeenCalledWith('/audit/rules/r1/toggle', { enabled: false });
        });
    });

    describe('createRule', () => {
        it('should POST new rule', async () => {
            vi.mocked(api.post).mockResolvedValue({ data: { id: 'r2' } });
            const result = await auditService.createRule({
                name: 'New Rule',
                description: 'Desc',
                category: 'quality',
                severity: 'low',
                enabled: true,
            });
            expect(result).toEqual({ id: 'r2' });
        });
    });

    describe('deleteRule', () => {
        it('should DELETE /audit/rules/:id', async () => {
            vi.mocked(api.delete).mockResolvedValue({});
            await auditService.deleteRule('r1');
            expect(api.delete).toHaveBeenCalledWith('/audit/rules/r1');
        });
    });

    // ── getComplianceReport ──────────────────────────────────
    describe('getComplianceReport', () => {
        it('should return mock compliance report in demo mode', async () => {
            localStorage.setItem('demo_mode', 'true');
            const result = await auditService.getComplianceReport('2026-01-01', '2026-02-01');
            expect(result.summary.length).toBe(7);
            expect(result.period.start).toBe('2026-01-01');
        });

        it('should call API in normal mode', async () => {
            vi.mocked(api.get).mockResolvedValue({ data: { summary: [] } });
            await auditService.getComplianceReport('2026-01-01', '2026-02-01');
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining('audit/compliance/report')
            );
        });
    });

    // ── retention ────────────────────────────────────────────
    describe('getRetention', () => {
        it('should call API', async () => {
            vi.mocked(api.get).mockResolvedValue({
                data: { retention: [{ table: 'audit_logs', retentionDays: 90, label: 'Audit' }] },
            });
            const result = await auditService.getRetention();
            expect(result.retention.length).toBe(1);
        });
    });

    describe('updateRetention', () => {
        it('should PUT retention config', async () => {
            vi.mocked(api.put).mockResolvedValue({});
            await auditService.updateRetention('audit_logs', 180);
            expect(api.put).toHaveBeenCalledWith('/audit/retention', { table: 'audit_logs', days: 180 });
        });
    });
});
