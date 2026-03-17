import { describe, it, expect } from 'vitest';
import {
    getMockUsers, getMockAgents, getMockCalls, getMockCallEvents,
    getMockAuditLogs, getMockAuditStats, getMockAuditTimeline,
} from './mock-data';

describe('mock-data service', () => {
    it('getMockUsers returns non-empty array', async () => {
        const res = await getMockUsers();
        const users = res.data.data;
        expect(Array.isArray(users)).toBe(true);
        expect(users.length).toBeGreaterThan(0);
    });

    it('getMockUsers items have required fields', async () => {
        const res = await getMockUsers();
        const users = res.data.data;
        for (const u of users) {
            expect(u._id).toBeTruthy();
            expect(u.email).toBeTruthy();
            expect(u.displayName).toBeTruthy();
            expect(u.role).toBeTruthy();
        }
    });

    it('getMockAgents returns non-empty array', async () => {
        const res = await getMockAgents();
        const agents = res.data.data;
        expect(Array.isArray(agents)).toBe(true);
        expect(agents.length).toBeGreaterThan(0);
    });

    it('getMockAgents items have sipNumber and displayName', async () => {
        const res = await getMockAgents();
        const agents = res.data.data;
        for (const a of agents) {
            expect(a.sipNumber).toBeTruthy();
            expect(a.displayName).toBeTruthy();
        }
    });

    it('getMockCalls returns non-empty array', async () => {
        const res = await getMockCalls();
        const calls = res.data.calls;
        expect(Array.isArray(calls)).toBe(true);
        expect(calls.length).toBeGreaterThan(0);
    });

    it('getMockCalls items have call_id and caller', async () => {
        const res = await getMockCalls();
        const calls = res.data.calls;
        for (const c of calls) {
            expect(c.call_id).toBeTruthy();
            expect(c.caller).toBeTruthy();
        }
    });

    it('getMockCalls items have valid call_type, hangup_by, and agent_number', async () => {
        const VALID_CALL_TYPES = ['agent_inbound', 'agent_outbound', 'system_inbound', 'system_outbound', 'internal', 'unknown'];
        const VALID_HANGUP_BY = ['customer', 'agent', 'system', 'unknown'];
        const res = await getMockCalls();
        const calls = res.data.calls;
        for (const c of calls) {
            expect(VALID_CALL_TYPES).toContain(c.call_type);
            expect(VALID_HANGUP_BY).toContain(c.hangup_by);
            expect(c.agent_number).toBeTruthy();
        }
    });

    it('getMockCallEvents returns non-empty array', async () => {
        const res = await getMockCallEvents();
        const events = res.data.data;
        expect(Array.isArray(events)).toBe(true);
        expect(events.length).toBeGreaterThan(0);
    });

    it('getMockAuditLogs returns data with logs array', () => {
        const result = getMockAuditLogs();
        expect(result.data.logs).toBeTruthy();
        expect(Array.isArray(result.data.logs)).toBe(true);
        expect(result.data.total).toBeGreaterThan(0);
    });

    it('getMockAuditStats returns data with stats array', () => {
        const result = getMockAuditStats();
        expect(result.data.stats).toBeTruthy();
        expect(Array.isArray(result.data.stats)).toBe(true);
    });

    it('getMockAuditTimeline returns data array', () => {
        const result = getMockAuditTimeline();
        expect(result.data).toBeTruthy();
        expect(Array.isArray(result.data)).toBe(true);
    });
});
