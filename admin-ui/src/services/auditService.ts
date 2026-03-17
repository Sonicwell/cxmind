import api from './api';
import type {
    AuditLogsResponse,
    AuditStats,
    TimelineData,
    LeaderboardData,
    MFAStats,
    AuditLogQuery,
} from '../types/audit';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { getMockAuditLogs, getMockAuditStats, getMockAuditTimeline, getMockAuditLeaderboard } from './mock-data';

class AuditService {
    /** 查audit日志 */
    async getLogs(query: AuditLogQuery = {}): Promise<AuditLogsResponse> {
        if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
            const mock = getMockAuditLogs().data;
            return {
                ...mock,
                limit: typeof query.limit === 'number' ? query.limit : 10,
                offset: typeof query.offset === 'number' ? query.offset : 0
            };
        }

        const params = new URLSearchParams();
        if (query.category) params.append('category', query.category);
        if (query.start_date) params.append('start_date', query.start_date);
        if (query.end_date) params.append('end_date', query.end_date);
        if (query.operator_id) params.append('operator_id', query.operator_id);
        if (query.action) params.append('action', query.action);
        if (query.limit) params.append('limit', query.limit.toString());
        if (query.offset) params.append('offset', query.offset.toString());

        const response = await api.get(`/audit/logs?${params.toString()}`);
        return response.data;
    }

    /** 按category统计 */
    async getStats(startDate?: string, endDate?: string, operatorId?: string): Promise<{ stats: AuditStats[] }> {
        if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
            return getMockAuditStats().data;
        }
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (operatorId) params.append('operator_id', operatorId);

        const response = await api.get(`/audit/stats?${params.toString()}`);
        return response.data;
    }

    /** 24h活动timeline */
    async getTimeline(operatorId?: string): Promise<TimelineData[]> {
        if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
            return getMockAuditTimeline().data;
        }
        const params = new URLSearchParams();
        if (operatorId) params.append('operator_id', operatorId);

        const response = await api.get(`/audit/timeline?${params.toString()}`);
        // 补齐24h缺失的时段
        const data = response.data;

        const result: TimelineData[] = [];
        const now = new Date();
        const currentHour = now.getHours();

        for (let i = 23; i >= 0; i--) {
            let hour = currentHour - i;
            if (hour < 0) hour += 24;

            const match = data.find((d: any) => d.hour === hour);
            result.push({
                hour: hour,
                count: match ? parseInt(match.count) : 0
            });
        }

        return result;
    }

    /** 活跃operator排行 */
    async getLeaderboard(limit: number = 10): Promise<LeaderboardData[]> {
        if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
            return getMockAuditLeaderboard().data;
        }
        const response = await api.get(`/audit/leaderboard?limit=${limit}`);
        return response.data;
    }

    /** MFA统计 */
    async getMFAStats(startDate?: string, endDate?: string): Promise<MFAStats> {
        if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
            return {
                total_attempts: 1250,
                successful_attempts: 1200,
                success_rate: 96,
                unique_users: 450
            };
        }
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);

        const response = await api.get(`/audit/mfa/stats?${params.toString()}`);
        return response.data;
    }

    /** 导出CSV */
    async exportToCSV(query: AuditLogQuery = {}): Promise<Blob> {
        const params = new URLSearchParams(query as any);
        const response = await api.get(`/audit/export/csv?${params.toString()}`, {
            responseType: 'blob',
        });
        return response.data;
    }

    /** 导出PDF */
    async exportToPDF(query: AuditLogQuery = {}): Promise<Blob> {
        const params = new URLSearchParams(query as any);
        const response = await api.get(`/audit/export/pdf?${params.toString()}`, {
            responseType: 'blob',
        });
        return response.data;
    }
    /** 异常检测结果 */
    async getAnomalies(timeWindow: number = 24): Promise<any[]> {
        if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
            return [
                { id: 'anom_01', type: 'Login Spike', severity: 'high', timestamp: new Date().toISOString(), details: 'Unusual login activity from IP 192.168.1.100' },
                { id: 'anom_02', type: 'Mass Export', severity: 'medium', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'User admin exported 5000 records' }
            ];
        }
        const response = await api.get(`/audit/anomalies?timeWindow=${timeWindow}`);
        return response.data;
    }

    async getRules(): Promise<any[]> {
        try {
            const response = await api.get('/audit/rules');
            // 后端返回 { rules: [...] } 格式
            const rules = response.data?.rules || response.data;
            if (Array.isArray(rules) && rules.length > 0) {
                return rules;
            }
            throw new Error('No rules found');
        } catch (error) {
            console.warn('Failed to fetch rules:', error);

            // demo模式才返回mock数据
            if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
                console.warn('Returning mock rule data for demonstration');
                return [
                    {
                        id: 'rule_pii_redaction',
                        name: 'PII Redaction',
                        description: 'Automatically redact detected PII (SSN, DoB, Phone) in transcripts and logs.',
                        category: 'compliance',
                        severity: 'critical',
                        enabled: true
                    },
                    {
                        id: 'rule_keyword_alert',
                        name: 'Sensitive Keyword Alert',
                        description: 'Flag calls containing defined sensitive keywords (e.g., "lawyer", "sue", "breach").',
                        category: 'security',
                        severity: 'high',
                        enabled: true
                    },
                    {
                        id: 'rule_silence_detection',
                        name: 'Extended Silence Detection',
                        description: 'Flag calls with silence periods exceeding 30 seconds.',
                        category: 'quality',
                        severity: 'medium',
                        enabled: false
                    },
                    {
                        id: 'rule_negative_sentiment',
                        name: 'Negative Sentiment Alert',
                        description: 'Trigger alert when customer sentiment score drops below threshold.',
                        category: 'quality',
                        severity: 'medium',
                        enabled: true
                    },
                    {
                        id: 'rule_pci_dss',
                        name: 'PCI-DSS Compliance',
                        description: 'Ensure credit card numbers are never stored in plain text.',
                        category: 'compliance',
                        severity: 'critical',
                        enabled: true
                    }
                ];
            }

            // 非demo模式直接抛错
            throw error;
        }
    }

    /** 开关规则 */
    async toggleRule(ruleId: string, enabled: boolean): Promise<void> {
        await api.put(`/audit/rules/${ruleId}/toggle`, { enabled });
    }

    /** 新建规则 */
    async createRule(rule: {
        name: string;
        description: string;
        category: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        enabled: boolean;
        conditionType?: string;
        conditionConfig?: Record<string, any>;
    }): Promise<any> {
        const response = await api.post('/audit/rules', rule);
        return response.data;
    }

    /** 删除规则 */
    async deleteRule(ruleId: string): Promise<void> {
        await api.delete(`/audit/rules/${ruleId}`);
    }

    /** 合规报告 */
    async getComplianceReport(startDate: string, endDate: string): Promise<any> {
        if (localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true') {
            return {
                period: { start: startDate, end: endDate },
                summary: [
                    { category: 'authentication', action: 'login', total_events: 3200, failed_events: 48, failure_rate: 1.5, unique_operators: 25 },
                    { category: 'authentication', action: 'mfa_verify', total_events: 2800, failed_events: 56, failure_rate: 2.0, unique_operators: 25 },
                    { category: 'data', action: 'export', total_events: 120, failed_events: 3, failure_rate: 2.5, unique_operators: 8 },
                    { category: 'data', action: 'import', total_events: 45, failed_events: 2, failure_rate: 4.44, unique_operators: 5 },
                    { category: 'system', action: 'config_change', total_events: 30, failed_events: 1, failure_rate: 3.33, unique_operators: 3 },
                    { category: 'agent', action: 'create', total_events: 150, failed_events: 5, failure_rate: 3.33, unique_operators: 10 },
                    { category: 'agent', action: 'delete', total_events: 20, failed_events: 0, failure_rate: 0, unique_operators: 4 },
                ],
                generated_at: new Date().toISOString()
            };
        }
        const params = new URLSearchParams();
        params.append('start_date', startDate);
        params.append('end_date', endDate);
        const response = await api.get(`/audit/compliance/report?${params.toString()}`);
        return response.data;
    }

    /** audit表的TTL配置 */
    async getRetention(): Promise<{ retention: { table: string; retentionDays: number | null; label: string }[] }> {
        const response = await api.get('/audit/retention');
        return response.data;
    }

    /** 改某张audit表的TTL */
    async updateRetention(table: string, days: number): Promise<void> {
        await api.put('/audit/retention', { table, days });
    }
}

export const auditService = new AuditService();
export default auditService;
