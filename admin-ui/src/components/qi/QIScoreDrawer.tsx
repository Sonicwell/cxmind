import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle, XCircle, Clock, User, Phone, FileText } from 'lucide-react';
import '../../styles/qi-score-drawer.css';
import { Button } from '../ui/button';

interface RuleScore {
    ruleId: string;
    ruleName: string;
    category: string;
    passed: boolean;
    score: number;
    maxScore: number;
    reason?: string;
    evidence?: string;
}

interface ScoreDetail {
    timestamp: string;
    call_id: string;
    client_id: string;
    agent_id: string;
    checklist_id: string;
    overall_score: number;
    rule_scores: RuleScore[];
    sentiment: string;
    sentiment_score: number;
    summary: string;
    llm_model: string;
    llm_tokens: number;
    duration_ms: number;
}

interface QIScoreDrawerProps {
    open: boolean;
    onClose: () => void;
    detail: ScoreDetail | null;
    loading: boolean;
}

function scoreClass(s: number): string {
    if (s >= 80) return 'excellent';
    if (s >= 60) return 'good';
    return 'poor';
}

function scoreLabel(s: number, t: (key: string) => string): string {
    if (s >= 80) return t('quality.analytics.excellent');
    if (s >= 60) return 'Good';
    return t('quality.analytics.poor');
}

const QIScoreDrawer: React.FC<QIScoreDrawerProps> = ({ open, onClose, detail, loading }) => {
    const { t } = useTranslation();

    if (!open) return null;

    return (
        <>
            <div className="qi-drawer-backdrop" onClick={onClose} />
            <div className={`qi-drawer ${open ? 'qi-drawer-open' : ''}`}>
                <div className="qi-drawer-header">
                    <h3>{t('quality.score')} — {t('quality.callId')}</h3>
                    <Button className="qi-drawer-close" onClick={onClose}>
                        <X size={18} />
                    </Button>
                </div>

                {loading ? (
                    <div className="qi-drawer-loading">
                        <div className="qi-skeleton qi-skeleton-block" />
                        <div className="qi-skeleton qi-skeleton-block" style={{ width: '70%' }} />
                        <div className="qi-skeleton qi-skeleton-block" style={{ width: '50%' }} />
                    </div>
                ) : detail ? (
                    <div className="qi-drawer-body">
                        {/* Overall Score */}
                        <div className="qi-drawer-score-hero">
                            <div className={`qi-drawer-score-circle ${scoreClass(detail.overall_score)}`}>
                                <span className="qi-drawer-score-value">{Number(detail.overall_score).toFixed(1)}</span>
                                <span className="qi-drawer-score-label">{scoreLabel(detail.overall_score, t)}</span>
                            </div>
                        </div>

                        {/* Call Info */}
                        <div className="qi-drawer-info-grid">
                            <div className="qi-drawer-info-item">
                                <Phone size={14} />
                                <span className="qi-drawer-info-label">{t('quality.callId')}</span>
                                <span className="qi-drawer-info-value" title={detail.call_id}>
                                    {detail.call_id?.substring(0, 16)}…
                                </span>
                            </div>
                            <div className="qi-drawer-info-item">
                                <User size={14} />
                                <span className="qi-drawer-info-label">{t('quality.agent')}</span>
                                <span className="qi-drawer-info-value">{detail.agent_id || '—'}</span>
                            </div>
                            <div className="qi-drawer-info-item">
                                <Clock size={14} />
                                <span className="qi-drawer-info-label">{t('quality.time')}</span>
                                <span className="qi-drawer-info-value">{new Date(detail.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="qi-drawer-info-item">
                                <FileText size={14} />
                                <span className="qi-drawer-info-label">{t('quality.sentiment')}</span>
                                <span className="qi-drawer-info-value">{detail.sentiment || '—'}</span>
                            </div>
                        </div>

                        {/* Summary */}
                        {detail.summary && (
                            <div className="qi-drawer-section">
                                <h4>{t('quality.summary')}</h4>
                                <p className="qi-drawer-summary">{detail.summary}</p>
                            </div>
                        )}

                        {/* Rule Scores */}
                        <div className="qi-drawer-section">
                            <h4>{t('quality.tabs.rules')} ({Array.isArray(detail.rule_scores) ? detail.rule_scores.length : 0})</h4>
                            <div className="qi-drawer-rules">
                                {Array.isArray(detail.rule_scores) && detail.rule_scores.map((rs, i) => (
                                    <div key={rs.ruleId || i} className={`qi-drawer-rule-card ${rs.passed ? 'passed' : 'failed'}`}>
                                        <div className="qi-drawer-rule-header">
                                            <div className="qi-drawer-rule-status">
                                                {rs.passed
                                                    ? <CheckCircle size={16} className="qi-drawer-icon-pass" />
                                                    : <XCircle size={16} className="qi-drawer-icon-fail" />
                                                }
                                                <span className="qi-drawer-rule-name">{rs.ruleName || rs.ruleId}</span>
                                            </div>
                                            <span className="qi-drawer-rule-score">
                                                {rs.score}/{rs.maxScore}
                                            </span>
                                        </div>
                                        {rs.category && (
                                            <span className="qi-drawer-rule-category">{rs.category}</span>
                                        )}
                                        {rs.reason && (
                                            <p className="qi-drawer-rule-reason">{rs.reason}</p>
                                        )}
                                        {rs.evidence && (
                                            <div className="qi-drawer-rule-evidence">
                                                <span className="qi-drawer-evidence-label">Evidence:</span>
                                                <span>{rs.evidence}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* LLM Info */}
                        {detail.llm_model && (
                            <div className="qi-drawer-footer-info">
                                <span>Model: {detail.llm_model}</span>
                                <span>Tokens: {detail.llm_tokens}</span>
                                <span>Duration: {detail.duration_ms ? `${(detail.duration_ms / 1000).toFixed(1)}s` : '—'}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="qi-drawer-empty">No data</div>
                )}
            </div>
        </>
    );
};

export default QIScoreDrawer;
export type { ScoreDetail, RuleScore };
