import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
    Phone, Clock,
    Brain, Mic, AlertTriangle, Sparkles,
    Wifi, WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardCore, useDashboardAnalytics, useDashboardRealtime } from '../../dashboard/DashboardContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { fmtDuration } from '../../dashboard/helpers';
import api from '../../services/api';
import '../../styles/bento-grid.css';

/* ═════════════════════════════════════════
   Reusable Bento Grid Component
   ═════════════════════════════════════════ */

interface BentoCellProps {
    children: React.ReactNode;
    className?: string;
    span?: 1 | 2 | 3 | 4;
    row?: 1 | 2 | 3;
    accent?: 'purple' | 'cyan' | 'green' | 'amber' | 'rose';
    featured?: boolean;
}

/** A single Bento cell with mouse-tracking glow */
export const BentoCell: React.FC<BentoCellProps> = ({
    children, className = '', span = 1, row = 1, accent, featured,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        el.style.setProperty('--mouse-x', `${x}%`);
        el.style.setProperty('--mouse-y', `${y}%`);
    }, []);

    const spanCls = span > 1 ? `span-${span}` : '';
    const rowCls = row > 1 ? `row-${row}` : '';
    const accentCls = accent ? `accent-${accent}` : '';
    const featuredCls = featured ? 'featured' : '';

    return (
        <div
            ref={ref}
            className={`bento-cell ${spanCls} ${rowCls} ${accentCls} ${featuredCls} ${className}`}
            onMouseMove={handleMouseMove}
        >
            {children}
        </div>
    );
};

/* ═════════════════════════════════════════
   Mini Sparkline (SVG-based, no deps)
   ═════════════════════════════════════════ */
const Sparkline: React.FC<{ data: number[]; color?: string }> = ({ data, color = 'var(--primary)' }) => {
    if (data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 120;
    const h = 36;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 4) - 2;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="bento-sparkline" preserveAspectRatio="none">
            <defs>
                <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon
                points={`0,${h} ${points} ${w},${h}`}
                fill="url(#spark-fill)"
            />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

/* ═════════════════════════════════════════
   Ring Progress Indicator
   ═════════════════════════════════════════ */
const Ring: React.FC<{ value: number; color?: string }> = ({ value, color = 'var(--primary)' }) => {
    const r = 22;
    const c = 2 * Math.PI * r;
    const offset = c - (value / 100) * c;
    return (
        <div className="bento-ring">
            <svg viewBox="0 0 56 56">
                <circle cx="28" cy="28" r={r} fill="none" stroke="var(--glass-border)" strokeWidth="4" />
                <circle
                    cx="28" cy="28" r={r}
                    fill="none" stroke={color} strokeWidth="4"
                    strokeDasharray={c} strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                />
            </svg>
            <span className="bento-ring-label">{value}%</span>
        </div>
    );
};

/* ═════════════════════════════════════════
   Bento Grid (Real Data — CXMind Dashboard)
   ═════════════════════════════════════════ */
const BentoGrid: React.FC = () => {
    const { t } = useTranslation();

    // ── DashboardContext slices ──
    const { liveCount, avgDuration } = useDashboardCore();
    const { outcomeStats, outcomeTrends } = useDashboardAnalytics();
    const { emotionAlerts } = useDashboardRealtime();
    const { connected } = useWebSocket();

    // ── 组件内独立 fetch: hourly volume (同 HourlyVolumeWidget 模式) ──
    const [hourlyData, setHourlyData] = useState<number[]>([]);
    useEffect(() => {
        api.get('/platform/hourly-volume')
            .then(res => {
                const raw: { hour: number; cnt: string }[] = res.data?.data || [];
                const hourMap = new Map(raw.map(d => [Number(d.hour), Number(d.cnt)]));
                const filled = Array.from({ length: 24 }, (_, h) => hourMap.get(h) || 0);
                setHourlyData(filled);
            })
            .catch(() => { /* 失败时保持空数组, sparkline/bar 不渲染 */ });
    }, []);

    // ── 组件内独立 fetch: MOS 数据 (避免 Quality dataGroup 依赖) ──
    const [avgMos, setAvgMos] = useState<number | null>(null);
    useEffect(() => {
        api.get('/platform/quality/overview?hours=24')
            .then(res => {
                const mos = res.data?.data?.mos_distribution?.avg_mos;
                if (typeof mos === 'number') setAvgMos(mos);
            })
            .catch(() => { });
    }, []);

    // ── 派生数据 ──
    const accuracyRate = outcomeStats?.accuracy?.accuracy_rate;
    const accuracyPct = accuracyRate != null ? `${(accuracyRate * 100).toFixed(1)}%` : '—';
    const aiPredictions = outcomeStats?.accuracy?.ai_predictions;
    const conversionRate = outcomeStats?.conversion_rate;
    const conversionPct = conversionRate != null ? (conversionRate * 100) : null;
    // Hero sparkline: 从 outcomeTrends 提取 success 维度
    const heroSparkData = outcomeTrends.length >= 2 ? outcomeTrends.map(p => p.success) : [];

    return (
        <div className="bento-grid">
            {/* ── Hero Card: AI Prediction Accuracy ── */}
            <BentoCell span={2} row={2} featured>
                <div className="bento-cell-icon icon-purple">
                    <Sparkles size={20} />
                </div>
                <div>
                    <div className="bento-hero-value">{accuracyPct}</div>
                    <div className="bento-hero-label">{t('dashboard.aiAccuracy', 'AI Prediction Accuracy')}</div>
                </div>
                <div className="bento-cell-sub" style={{ marginTop: 12 }}>
                    <span>{outcomeStats?.accuracy?.manual_overrides ?? 0} {t('dashboard.manualReviews', 'manual reviews')}</span>
                </div>
                <Sparkline data={heroSparkData} color="hsl(var(--primary-hue), 70%, 55%)" />
            </BentoCell>

            {/* ── Active Calls ── */}
            <BentoCell accent="cyan">
                <div className="bento-cell-icon icon-cyan">
                    <Phone size={18} />
                </div>
                <div className="bento-cell-title">{t('dashboard.activeCalls', 'Active Calls')}</div>
                <div className="bento-cell-value">{liveCount}</div>
                <div className="bento-cell-sub">
                    <span>{t('dashboard.realTime', 'Real-time')}</span>
                </div>
            </BentoCell>

            {/* ── Avg Handle Time ── */}
            <BentoCell accent="amber">
                <div className="bento-cell-icon icon-amber">
                    <Clock size={18} />
                </div>
                <div className="bento-cell-title">{t('dashboard.avgTalkTime', 'Avg Talk Time')}</div>
                <div className="bento-cell-value">{avgDuration != null ? fmtDuration(avgDuration) : '—'}</div>
                <div className="bento-cell-sub">
                    <span>{t('dashboard.last3h', 'Last 3h')}</span>
                </div>
            </BentoCell>

            {/* ── 实时告警 (WS emotion:alert 累积) ── */}
            <BentoCell accent="rose">
                <div className="bento-cell-icon icon-rose">
                    <AlertTriangle size={18} />
                </div>
                <div className="bento-cell-title">{t('bento.liveAlerts', '实时告警')}</div>
                <div className="bento-cell-value">{emotionAlerts.length}</div>
                <div className="bento-cell-sub">
                    <span>{t('bento.sessionAlerts', '本次会话')}</span>
                </div>
            </BentoCell>

            {/* ── AI Predictions ── */}
            <BentoCell accent="green">
                <div className="bento-cell-icon icon-green">
                    <Brain size={18} />
                </div>
                <div className="bento-cell-title">{t('bento.aiPredictions', 'AI 预测数')}</div>
                <div className="bento-cell-value">{aiPredictions != null ? aiPredictions.toLocaleString() : '—'}</div>
                <div className="bento-cell-sub">
                    <span>{outcomeStats?.total_calls ?? 0} {t('dashboard.totalCalls', 'total calls')}</span>
                </div>
            </BentoCell>

            {/* ── Call Volume Trend (wide) ── */}
            <BentoCell span={2} accent="purple">
                <div className="bento-cell-title">{t('dashboard.hourlyVolumeTitle', 'Hourly Call Volume')}</div>
                <div className="bento-cell-sub" style={{ marginBottom: 8 }}>{t('common.today', 'Today')}</div>
                <Sparkline data={hourlyData} />
            </BentoCell>

            {/* ── Conversion Rate (Ring) ── */}
            <BentoCell>
                <div className="bento-cell-title">{t('dashboard.conversionRate', 'Conversion Rate')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
                    <Ring value={conversionPct != null ? Math.round(conversionPct) : 0} color="hsl(150, 60%, 40%)" />
                    <div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                            {conversionPct != null ? `${conversionPct.toFixed(1)}%` : '—'}
                        </div>
                        <div className="bento-cell-sub">{outcomeStats?.total_calls ?? 0} {t('dashboard.totalCalls', 'total calls')}</div>
                    </div>
                </div>
            </BentoCell>

            {/* ── Hourly Agent Activity (Bars) ── */}
            <BentoCell span={2}>
                <div className="bento-cell-title">{t('bento.hourlyActivity', '每小时通话量')}</div>
                <div className="bento-cell-sub" style={{ marginBottom: 8 }}>{t('common.today', 'Today')}</div>
                <div className="bento-bars">
                    {(hourlyData.length > 0 ? hourlyData : Array(24).fill(0)).map((v, i) => {
                        const max = Math.max(...hourlyData, 1);
                        return (
                            <div
                                key={i}
                                className="bento-bar"
                                style={{
                                    height: `${(v / max) * 100}%`,
                                    background: `hsla(var(--primary-hue), 70%, ${55 + (i % 3) * 8}%, 0.6)`,
                                }}
                            />
                        );
                    })}
                </div>
            </BentoCell>

            {/* ── Connection Status (原 WebNN) ── */}
            <BentoCell accent="cyan">
                <div className="bento-cell-icon icon-cyan">
                    {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
                </div>
                <div className="bento-cell-title">{t('bento.connectionStatus', '连接状态')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: connected ? 'var(--success)' : 'var(--danger)',
                        boxShadow: `0 0 8px ${connected ? 'var(--success)' : 'var(--danger)'}`,
                    }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        {connected ? t('bento.wsConnected', 'WebSocket 已连接') : t('bento.wsDisconnected', 'WebSocket 已断开')}
                    </span>
                </div>
                <div className="bento-cell-sub" style={{ marginTop: 8 }}>
                    {t('bento.realtimePush', '实时数据推送')}
                </div>
            </BentoCell>

            {/* ── Avg MOS Score ── */}
            <BentoCell accent="green">
                <div className="bento-cell-icon icon-green">
                    <Mic size={18} />
                </div>
                <div className="bento-cell-title">{t('dashboard.avgMos', 'Avg MOS')}</div>
                <div className="bento-cell-value">{avgMos != null ? avgMos.toFixed(2) : '—'}</div>
                <div className="bento-cell-sub">
                    <span>{t('bento.last24h', '过去 24 小时')}</span>
                </div>
            </BentoCell>
        </div>
    );
};

export default BentoGrid;
