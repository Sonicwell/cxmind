import api from '../api';

export interface AlertChannelConfig {
    webhookUrl?: string;
    secret?: string;
    recipients?: string; // Add recipients for email type
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    toEmails?: string[];
}

export interface AlertChannel {
    _id: string;
    name: string;
    type: 'dingtalk' | 'wecom' | 'feishu' | 'slack' | 'email' | 'custom';
    enabled: boolean;
    config: AlertChannelConfig;
    createdAt: string;
    updatedAt: string;
}

export interface AlertRoute {
    _id: string;
    name: string;
    events: string[];
    severity: 'info' | 'warning' | 'critical' | 'all';
    channelIds: (string | AlertChannel)[];
    enabled: boolean;
    cooldownSec: number;
    createdAt: string;
    updatedAt: string;
}

// --- Channels ---

export const getAlertChannels = async (demoMode = false): Promise<AlertChannel[]> => {
    const response = await api.get('/platform/alerts/channels', { params: { demoMode } });
    return response.data;
};

export const createAlertChannel = async (data: Partial<AlertChannel>): Promise<AlertChannel> => {
    const response = await api.post('/platform/alerts/channels', data);
    return response.data;
};

export const updateAlertChannel = async (id: string, data: Partial<AlertChannel>): Promise<AlertChannel> => {
    const response = await api.put(`/platform/alerts/channels/${id}`, data);
    return response.data;
};

export const deleteAlertChannel = async (id: string): Promise<void> => {
    await api.delete(`/platform/alerts/channels/${id}`);
};

export const testAlertChannel = async (id: string): Promise<{ message?: string; error?: string; durationMs: number }> => {
    const response = await api.post(`/platform/alerts/channels/${id}/test`);
    return response.data;
};

// --- Routes ---

export const getAlertRoutes = async (demoMode = false): Promise<AlertRoute[]> => {
    const response = await api.get('/platform/alerts/routes', { params: { demoMode } });
    return response.data;
};

export const createAlertRoute = async (data: Partial<AlertRoute>): Promise<AlertRoute> => {
    const response = await api.post('/platform/alerts/routes', data);
    return response.data;
};

export const updateAlertRoute = async (id: string, data: Partial<AlertRoute>): Promise<AlertRoute> => {
    const response = await api.put(`/platform/alerts/routes/${id}`, data);
    return response.data;
};

export const deleteAlertRoute = async (id: string): Promise<void> => {
    await api.delete(`/platform/alerts/routes/${id}`);
};

// --- Quality Thresholds ---

export interface QualityThresholds {
    mos_min: number;
    loss_max: number;
    rtt_max: number;
    jitter_max: number;
    sustained_seconds: number;
}

export const getAlertThresholds = async (): Promise<QualityThresholds> => {
    const response = await api.get('/platform/quality/alerts/thresholds');
    return response.data.data;
};

export const updateAlertThresholds = async (data: Partial<QualityThresholds>): Promise<QualityThresholds> => {
    const response = await api.put('/platform/quality/alerts/thresholds', data);
    return response.data.data;
};
