// Audit Log Types
export interface AuditLog {
    timestamp: string;
    category: string;
    operator_id: string;
    operator_name: string;
    action: string;
    target_id: string;
    target_name: string;
    ip_address: string;
    user_agent: string;
    success: number;
    failure_reason: string;
    changes?: string;
}

export interface AuditLogsResponse {
    logs: AuditLog[];
    total: number;
    limit: number;
    offset: number;
}

// Statistics Types
export interface AuditStats {
    category: string;
    count: number;
    unique_operators: number;
}

export interface TimelineData {
    hour: number;
    count: number;
}

export interface LeaderboardData {
    operator_id: string;
    operator_name: string;
    total_actions: number;
    percentage: number;
    categories_count: number;
}

export interface MFAStats {
    total_attempts: number;
    successful_attempts: number;
    success_rate: number;
    unique_users: number;
}

// Query Parameters
export interface AuditLogQuery {
    category?: string;
    start_date?: string;
    end_date?: string;
    operator_id?: string;
    action?: string;
    limit?: number;
    offset?: number;
}

// Dashboard Summary
export interface AuditDashboardSummary {
    totalEvents: number;
    todayEvents: number;
    activeUsers: number;
    failedLogins: number;
}

// Category Types
export type AuditCategory =
    | 'auth'
    | 'user_management'
    | 'client_management'
    | 'agent_management'
    | 'call_access'
    | 'knowledge_base'
    | 'ai_config'
    | 'monitoring'
    | 'mfa';

// Action Types by Category
export type AuthAction = 'login' | 'logout' | 'login_failed' | 'password_change' | 'session_expired';
export type ManagementAction = 'create' | 'update' | 'delete';
export type CallAccessAction = 'view_call' | 'view_transcription' | 'download_pcap' | 'download_audio' | 'play_audio';
export type MonitoringAction = 'start_monitoring' | 'stop_monitoring';
