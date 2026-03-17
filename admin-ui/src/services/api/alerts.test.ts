import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getAlertChannels, createAlertChannel, updateAlertChannel,
    deleteAlertChannel, testAlertChannel,
    getAlertRoutes, createAlertRoute, updateAlertRoute, deleteAlertRoute,
    getAlertThresholds, updateAlertThresholds,
} from './alerts';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

import api from '../api';
const mockApi = vi.mocked(api);

describe('alerts service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Channels ──

    it('getAlertChannels calls GET with demoMode param', async () => {
        mockApi.get.mockResolvedValue({ data: [{ _id: 'ch1', name: 'DingTalk' }] });
        const result = await getAlertChannels(true);
        expect(mockApi.get).toHaveBeenCalledWith('/platform/alerts/channels', { params: { demoMode: true } });
        expect(result).toEqual([{ _id: 'ch1', name: 'DingTalk' }]);
    });

    it('createAlertChannel calls POST', async () => {
        const channel = { name: 'Slack', type: 'slack' as const };
        mockApi.post.mockResolvedValue({ data: { _id: 'ch2', ...channel } });
        const result = await createAlertChannel(channel);
        expect(mockApi.post).toHaveBeenCalledWith('/platform/alerts/channels', channel);
        expect(result._id).toBe('ch2');
    });

    it('updateAlertChannel calls PUT with id', async () => {
        mockApi.put.mockResolvedValue({ data: { _id: 'ch1', name: 'Updated' } });
        const result = await updateAlertChannel('ch1', { name: 'Updated' });
        expect(mockApi.put).toHaveBeenCalledWith('/platform/alerts/channels/ch1', { name: 'Updated' });
        expect(result.name).toBe('Updated');
    });

    it('deleteAlertChannel calls DELETE with id', async () => {
        mockApi.delete.mockResolvedValue({ data: {} });
        await deleteAlertChannel('ch1');
        expect(mockApi.delete).toHaveBeenCalledWith('/platform/alerts/channels/ch1');
    });

    it('testAlertChannel calls POST to test endpoint', async () => {
        mockApi.post.mockResolvedValue({ data: { message: 'ok', durationMs: 150 } });
        const result = await testAlertChannel('ch1');
        expect(mockApi.post).toHaveBeenCalledWith('/platform/alerts/channels/ch1/test');
        expect(result.durationMs).toBe(150);
    });

    // ── Routes ──

    it('getAlertRoutes calls GET with demoMode', async () => {
        mockApi.get.mockResolvedValue({ data: [{ _id: 'rt1', name: 'Critical Route' }] });
        const result = await getAlertRoutes(false);
        expect(mockApi.get).toHaveBeenCalledWith('/platform/alerts/routes', { params: { demoMode: false } });
        expect(result.length).toBe(1);
    });

    it('createAlertRoute calls POST', async () => {
        const route = { name: 'New Route', events: ['login_failed'] };
        mockApi.post.mockResolvedValue({ data: { _id: 'rt2', ...route } });
        const result = await createAlertRoute(route);
        expect(mockApi.post).toHaveBeenCalledWith('/platform/alerts/routes', route);
        expect(result._id).toBe('rt2');
    });

    it('updateAlertRoute calls PUT with id', async () => {
        mockApi.put.mockResolvedValue({ data: { _id: 'rt1', name: 'Renamed' } });
        const result = await updateAlertRoute('rt1', { name: 'Renamed' });
        expect(mockApi.put).toHaveBeenCalledWith('/platform/alerts/routes/rt1', { name: 'Renamed' });
        expect(result.name).toBe('Renamed');
    });

    it('deleteAlertRoute calls DELETE with id', async () => {
        mockApi.delete.mockResolvedValue({ data: {} });
        await deleteAlertRoute('rt1');
        expect(mockApi.delete).toHaveBeenCalledWith('/platform/alerts/routes/rt1');
    });

    // ── Quality Thresholds ──

    it('getAlertThresholds calls GET', async () => {
        const thresholds = { mos_min: 3.5, loss_max: 0.05, rtt_max: 200, jitter_max: 50, sustained_seconds: 10 };
        mockApi.get.mockResolvedValue({ data: { data: thresholds } });
        const result = await getAlertThresholds();
        expect(mockApi.get).toHaveBeenCalledWith('/platform/quality/alerts/thresholds');
        expect(result).toEqual(thresholds);
    });

    it('updateAlertThresholds calls PUT with data', async () => {
        const update = { mos_min: 4.0 };
        mockApi.put.mockResolvedValue({ data: { data: { ...update, loss_max: 0.05 } } });
        const result = await updateAlertThresholds(update);
        expect(mockApi.put).toHaveBeenCalledWith('/platform/quality/alerts/thresholds', update);
        expect(result.mos_min).toBe(4.0);
    });
});
