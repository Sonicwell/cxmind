import React from 'react';
import { PhoneIncoming, PhoneOutgoing, Phone, Clock, Percent, PhoneOff, MessageSquare } from 'lucide-react';
import { useDashboardCore } from '../../dashboard/DashboardContext';
import type { WidgetProps } from '../../dashboard/types';
import { useTranslation } from 'react-i18next';
import { fmtDuration } from '../../dashboard/helpers';
import './directional-widget.css';

/**
 * Agent Inbound Overview — 4 KPIs: Total / Answer Rate / Avg Wait / Avg Talk
 */
export const InboundWidget: React.FC<WidgetProps> = () => {
    const { t } = useTranslation();
    const { directionalStats } = useDashboardCore();
    const s = directionalStats?.inbound;

    return (
        <div className="dw-dir">
            <h3 className="widget-title">
                <PhoneIncoming size={14} style={{ color: 'var(--success)' }} />
                {t('dashboard.agentInbound', 'Agent Inbound')}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(7d)</span>
            </h3>
            <div className="dw-dir-kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(150,60%,45%,0.12)', color: 'var(--success)' }}>
                        <Phone size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s?.total?.toLocaleString() ?? '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.totalCalls', 'Total')}</div>
                    {s && s.abandoned > 0 && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                            <PhoneOff size={10} /> {s.abandoned} {t('dashboard.abandoned', 'abandoned')}
                        </div>
                    )}
                </div>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(220,70%,55%,0.12)', color: '#3b82f6' }}>
                        <Percent size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s ? `${s.answer_rate}%` : '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.answerRate', 'Answer Rate')}</div>
                    {s?.agent_reach_rate != null && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                            📡 {t('dashboard.reach', 'Reach')} {s.agent_reach_rate}%
                        </div>
                    )}
                </div>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(35,90%,60%,0.12)', color: 'var(--warning)' }}>
                        <Clock size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s ? fmtDuration(s.avg_wait_time ?? 0) : '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.avgWait', 'Avg Wait')}</div>
                </div>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(180,60%,45%,0.12)', color: '#06b6d4' }}>
                        <MessageSquare size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s ? fmtDuration(s.avg_talk_time ?? 0) : '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.avgTalk', 'Avg Talk')}</div>
                </div>
            </div>
        </div>
    );
};

/**
 * Agent Outbound Overview — 4 KPIs: Total / Answer Rate / Avg Ring / Avg Talk
 */
export const OutboundWidget: React.FC<WidgetProps> = () => {
    const { t } = useTranslation();
    const { directionalStats } = useDashboardCore();
    const s = directionalStats?.outbound;

    return (
        <div className="dw-dir">
            <h3 className="widget-title">
                <PhoneOutgoing size={14} style={{ color: '#8b5cf6' }} />
                {t('dashboard.agentOutbound', 'Agent Outbound')}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(7d)</span>
            </h3>
            <div className="dw-dir-kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(260,70%,60%,0.12)', color: '#8b5cf6' }}>
                        <Phone size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s?.total?.toLocaleString() ?? '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.totalCalls', 'Total')}</div>
                    {s && s.abandoned > 0 && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                            <PhoneOff size={10} /> {s.abandoned} {t('dashboard.abandoned', 'abandoned')}
                        </div>
                    )}
                </div>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(220,70%,55%,0.12)', color: '#3b82f6' }}>
                        <Percent size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s ? `${s.answer_rate}%` : '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.answerRate', 'Answer Rate')}</div>
                </div>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(0,75%,55%,0.12)', color: 'var(--danger)' }}>
                        <Clock size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s ? fmtDuration(s.avg_ring_time ?? 0) : '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.avgRing', 'Avg Ring')}</div>
                </div>
                <div className="dw-dir-kpi">
                    <div className="dw-dir-kpi-icon" style={{ background: 'hsla(180,60%,45%,0.12)', color: '#06b6d4' }}>
                        <MessageSquare size={16} />
                    </div>
                    <div className="dw-dir-kpi-value">{s ? fmtDuration(s.avg_talk_time ?? 0) : '—'}</div>
                    <div className="dw-dir-kpi-label">{t('dashboard.avgTalk', 'Avg Talk')}</div>
                </div>
            </div>
        </div>
    );
};

export default InboundWidget;
