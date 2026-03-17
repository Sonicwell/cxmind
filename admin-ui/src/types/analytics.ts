export interface SLAOverview {
    total_calls: number;
    answered: number;
    abandoned: number;
    answer_rate: number;
    abandon_rate: number;
    avg_handle_time: number;
    avg_wait_time: number;
    service_level: number;
    change?: {
        total_calls: number;
        answered: number;
        abandoned: number;
        answer_rate: number;
        abandon_rate: number;
        avg_handle_time: number;
        avg_wait_time: number;
        service_level: number;
    };
}

export interface HourlyTrend {
    hour: number;
    offered: number;
    answered: number;
    abandoned: number;
    sl_pct: number;
}

export interface AgentRow {
    agent_id: string;
    agent_name?: string;
    total_calls: number;
    avg_handle_time: number;
    avg_qi_score: number;
    conversion_rate: number;
    trend?: number[];
}

export interface VolumeEntry {
    date: string;
    total: number;
    answered: number;
    abandoned: number;
}

export interface HeatmapEntry {
    sentiment: string;
    score_bucket: string;
    count: number;
}

export interface IntentEntry {
    intent: string;
    count: number;
}

export interface SentimentTrendEntry {
    date: string;
    positive: number;
    neutral: number;
    negative: number;
}

export interface SummaryOverview {
    total_summaries: number;
    avg_tokens: number;
    top_model: string;
    models: Array<{ model: string; count: number }>;
}

export interface SERDistribution {
    emotion: string;
    count: number;
    avg_confidence?: number;
    avg_arousal?: number;
    avg_valence?: number;
}

export interface SERTrend {
    date: string;
    emotion?: string;
    count?: number;
    avg_fusion?: number;
    happy?: number;
    neutral?: number;
    sad?: number;
    angry?: number;
    frustrated?: number;
}

export interface OutcomeDistribution {
    success: number;
    failure: number;
    follow_up: number;
    unknown: number;
}

export interface OutcomeTrend {
    date: string;
    success: number;
    failure: number;
    follow_up: number;
}

export interface OutcomeBucket {
    bucket: string;
    total: number;
    success: number;
    rate: number;
}

export interface TopCloser {
    agent_id: string;
    agent_name: string;
    total: number;
    success: number;
    rate: number;
}

export interface AIROI {
    total_cost: number;
    cost_per_success: number;
    avg_tokens: number;
    total_predictions: number;
}

export interface OutcomeDashboardData {
    distribution: OutcomeDistribution;
    trends: OutcomeTrend[];
    by_quality: OutcomeBucket[];
    by_duration: OutcomeBucket[];
    by_sentiment: OutcomeBucket[];
    top_closers: TopCloser[];
    by_talk_pattern: OutcomeBucket[];
    roi: AIROI;
}

export interface BehaviorDistribution {
    agent_talk: number;
    cust_talk: number;
    silence: number;
}

export interface BehaviorTrend {
    date: string;
    avg_stress: number;
    avg_talk_ratio: number;
}

export interface BehaviorDashboardData {
    distribution: BehaviorDistribution;
    trend: BehaviorTrend[];
    emotion_dist: SERDistribution[];
    emotion_trend: SERTrend[];
}
