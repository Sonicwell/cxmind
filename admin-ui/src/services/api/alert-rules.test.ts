import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getAlertTemplates, generateRuleFromPrompt,
    getAlertRules, createAlertRule, updateAlertRule,
    deleteAlertRule, toggleAlertRule, getAlertHistory,
} from './alert-rules';

// Mock the api module
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
    },
}));

import api from '../api';

const mockApi = vi.mocked(api);

describe('alert-rules service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Templates ──

    it('getAlertTemplates calls GET /platform/alerts/rules/templates', async () => {
        const templates = [{ id: 't1', name: 'Login Spike' }];
        mockApi.get.mockResolvedValue({ data: templates });

        const result = await getAlertTemplates();
        expect(mockApi.get).toHaveBeenCalledWith('/platform/alerts/rules/templates');
        expect(result).toEqual(templates);
    });

    it('generateRuleFromPrompt calls POST with prompt payload', async () => {
        const rule = { name: 'AI Generated Rule', severity: 'critical' };
        mockApi.post.mockResolvedValue({ data: rule });

        const result = await generateRuleFromPrompt('detect login failures > 10');
        expect(mockApi.post).toHaveBeenCalledWith('/platform/alerts/rules/generate', {
            prompt: 'detect login failures > 10',
        });
        expect(result).toEqual(rule);
    });

    // ── CRUD ──

    it('getAlertRules calls GET /platform/alerts/rules', async () => {
        const rules = [{ _id: 'r1', name: 'Rule 1' }];
        mockApi.get.mockResolvedValue({ data: rules });

        const result = await getAlertRules();
        expect(mockApi.get).toHaveBeenCalledWith('/platform/alerts/rules');
        expect(result).toEqual(rules);
    });

    it('createAlertRule calls POST with rule data', async () => {
        const newRule = { name: 'New Rule', severity: 'warning' as const };
        const created = { ...newRule, _id: 'r2' };
        mockApi.post.mockResolvedValue({ data: created });

        const result = await createAlertRule(newRule);
        expect(mockApi.post).toHaveBeenCalledWith('/platform/alerts/rules', newRule);
        expect(result).toEqual(created);
    });

    it('updateAlertRule calls PUT with id and data', async () => {
        const update = { name: 'Updated' };
        mockApi.put.mockResolvedValue({ data: { _id: 'r1', ...update } });

        const result = await updateAlertRule('r1', update);
        expect(mockApi.put).toHaveBeenCalledWith('/platform/alerts/rules/r1', update);
        expect(result.name).toBe('Updated');
    });

    it('deleteAlertRule calls DELETE with id', async () => {
        mockApi.delete.mockResolvedValue({ data: {} });
        await deleteAlertRule('r1');
        expect(mockApi.delete).toHaveBeenCalledWith('/platform/alerts/rules/r1');
    });

    it('toggleAlertRule calls PATCH with enabled flag', async () => {
        mockApi.patch.mockResolvedValue({ data: {} });
        await toggleAlertRule('r1', false);
        expect(mockApi.patch).toHaveBeenCalledWith('/platform/alerts/rules/r1/toggle', { enabled: false });
    });

    // ── History ──

    it('getAlertHistory calls GET with pagination params', async () => {
        const history = { data: [], pagination: { total: 0 } };
        mockApi.get.mockResolvedValue({ data: history });

        const result = await getAlertHistory(2, 25, true);
        expect(mockApi.get).toHaveBeenCalledWith('/platform/alerts/rules/history', {
            params: { page: 2, limit: 25, demoMode: true },
        });
        expect(result).toEqual(history);
    });

    it('getAlertHistory uses defaults (page=1, limit=50, demoMode=false)', async () => {
        mockApi.get.mockResolvedValue({ data: { data: [], pagination: {} } });
        await getAlertHistory();
        expect(mockApi.get).toHaveBeenCalledWith('/platform/alerts/rules/history', {
            params: { page: 1, limit: 50, demoMode: false },
        });
    });
});
