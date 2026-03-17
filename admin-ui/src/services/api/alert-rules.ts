import api from '../api';

export interface AlertRuleMetricExpression {
    metric: 'MOS' | 'SIP_ERROR_RATE' | 'CONCURRENT_CALLS' | 'CALL_FAILURE_RATE' | 'ASR_LATENCY' | 'QUEUE_WAIT_TIME' | 'CUSTOM';
    operator: 'GT' | 'LT' | 'EQ' | 'GTE' | 'LTE';
    threshold: number;
}

export interface AlertRule {
    _id: string;
    name: string;
    description: string;
    templateId?: string;
    smartBaseline: boolean;
    metricExpressions: AlertRuleMetricExpression[];
    durationWindowSec: number;
    eventTrigger: string;
    severity: 'info' | 'warning' | 'critical';
    enabled: boolean;
    isSystemDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface AlertRuleTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    metrics: { name: string; condition: string; severity: string }[];
    rulesToInject: Partial<AlertRule>[];
}

export interface AlertHistoryRecord {
    _id: string;
    ruleId?: string;
    ruleName: string;
    triggerValue: number;
    threshold?: number;
    metric: string;
    severity: 'info' | 'warning' | 'critical';
    eventTrigger: string;
    timestamp: string;
    resolved: boolean;
    resolvedAt?: string;
}

// 1. Templates & AI
export const getAlertTemplates = async (): Promise<AlertRuleTemplate[]> => {
    const res = await api.get('/platform/alerts/rules/templates');
    return res.data;
};

export const generateRuleFromPrompt = async (prompt: string): Promise<Partial<AlertRule>> => {
    const res = await api.post('/platform/alerts/rules/generate', { prompt });
    return res.data;
};

// 2. CRUD
export const getAlertRules = async (): Promise<AlertRule[]> => {
    const res = await api.get('/platform/alerts/rules');
    return res.data;
};

export const createAlertRule = async (data: Partial<AlertRule>): Promise<AlertRule> => {
    const res = await api.post('/platform/alerts/rules', data);
    return res.data;
};

export const updateAlertRule = async (id: string, data: Partial<AlertRule>): Promise<AlertRule> => {
    const res = await api.put(`/platform/alerts/rules/${id}`, data);
    return res.data;
};

export const deleteAlertRule = async (id: string): Promise<void> => {
    await api.delete(`/platform/alerts/rules/${id}`);
};

export const toggleAlertRule = async (id: string, enabled: boolean): Promise<void> => {
    await api.patch(`/platform/alerts/rules/${id}/toggle`, { enabled });
};

// 3. History
export const getAlertHistory = async (page = 1, limit = 50, demoMode = false): Promise<{ data: AlertHistoryRecord[], pagination: any }> => {
    const res = await api.get('/platform/alerts/rules/history', { params: { page, limit, demoMode } });
    return res.data;
};
