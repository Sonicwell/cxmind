import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useDemoMode } from '../hooks/useDemoMode';
import { useTranslation } from 'react-i18next';
import '../styles/demo-banner.css';
import { Button } from './ui/button';

// ── Animated Counter ──
const CountUp: React.FC<{ target: number; duration?: number; suffix?: string; decimals?: number }> = ({
    target, duration = 1.2, suffix = '', decimals = 0
}) => {
    const [value, setValue] = useState(0);
    const startRef = useRef(0);

    useEffect(() => {
        const start = startRef.current;
        const diff = target - start;
        const startTime = performance.now();
        const ms = duration * 1000;

        const tick = (now: number) => {
            const elapsed = now - startTime;
            if (elapsed >= ms) {
                setValue(target);
                startRef.current = target;
                return;
            }
            // ease-out cubic
            const t = elapsed / ms;
            const ease = 1 - Math.pow(1 - t, 3);
            setValue(start + diff * ease);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, [target, duration]);

    return <>{decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString()}{suffix}</>;
};

// ── KPI Data Generator ──
const useTickingKPIs = () => {
    const [kpis, setKpis] = useState({
        calls: 1247,
        agents: 48,
        score: 92.3,
        resolved: 96.1,
    });

    useEffect(() => {
        const timer = setInterval(() => {
            setKpis(prev => ({
                calls: prev.calls + Math.floor(Math.random() * 5) + 1,
                agents: Math.max(40, Math.min(60, prev.agents + (Math.random() > 0.5 ? 1 : -1))),
                score: Math.max(88, Math.min(98, +(prev.score + (Math.random() - 0.45) * 0.3).toFixed(1))),
                resolved: Math.max(93, Math.min(99, +(prev.resolved + (Math.random() - 0.45) * 0.2).toFixed(1))),
            }));
        }, 4000);
        return () => clearInterval(timer);
    }, []);

    return kpis;
};

export const DemoBanner: React.FC = () => {
    const { demoMode, setDemoMode } = useDemoMode();
    const { t } = useTranslation();
    const kpis = useTickingKPIs();

    return (
        <AnimatePresence>
            {demoMode && (
                <motion.div
                    className="demo-banner"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Scan-line animation overlay */}
                    <div className="demo-banner-scanline" />

                    <div className="demo-banner-inner">
                        {/* Left: Brand identity */}
                        <div className="demo-banner-brand">
                            <img src="/cxmi_icon.svg" alt="CXMI" className="demo-banner-icon" style={{ width: 16, height: 16 }} />
                            <span className="demo-banner-title">{t('demoBanner.title')}</span>
                        </div>

                        {/* Center: Live KPIs */}
                        <div className="demo-banner-kpis">
                            <div className="demo-banner-kpi">
                                <span className="demo-banner-kpi-value">
                                    <CountUp target={kpis.calls} />
                                </span>
                                <span className="demo-banner-kpi-label">{t('demoBanner.callsToday')}</span>
                            </div>
                            <div className="demo-banner-kpi-divider" />
                            <div className="demo-banner-kpi">
                                <span className="demo-banner-kpi-value">
                                    <CountUp target={kpis.agents} />
                                </span>
                                <span className="demo-banner-kpi-label">{t('demoBanner.agentsOnline')}</span>
                            </div>
                            <div className="demo-banner-kpi-divider" />
                            <div className="demo-banner-kpi">
                                <span className="demo-banner-kpi-value">
                                    <CountUp target={kpis.score} decimals={1} />
                                </span>
                                <span className="demo-banner-kpi-label">{t('demoBanner.avgScore')}</span>
                            </div>
                            <div className="demo-banner-kpi-divider" />
                            <div className="demo-banner-kpi">
                                <span className="demo-banner-kpi-value">
                                    <CountUp target={kpis.resolved} decimals={1} suffix="%" />
                                </span>
                                <span className="demo-banner-kpi-label">{t('demoBanner.resolved')}</span>
                            </div>
                        </div>

                        {/* Right: Exit button */}
                        {import.meta.env.VITE_MOCK_MODE !== 'true' && (
                            <Button
                                className="demo-banner-exit"
                                onClick={() => setDemoMode(false)}
                            >
                                <X size={12} />
                                {t('demoBanner.exitDemo')}
                            </Button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
