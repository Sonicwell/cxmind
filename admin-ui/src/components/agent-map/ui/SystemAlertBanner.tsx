import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SystemStats {
    sipErrorRate: number;
    activeCalls: number;
}

interface SystemAlertBannerProps {
    stats: SystemStats | null;
}

const SystemAlertBanner: React.FC<SystemAlertBannerProps> = ({ stats }) => {
    const [alert, setAlert] = useState<{ type: string; message: string } | null>(null);

    useEffect(() => {
        if (!stats) { setAlert(null); return; }
        if (stats.sipErrorRate > 5.0) {
            setAlert({
                type: 'critical',
                message: `CRITICAL: SIP Error Rate Detected at ${stats.sipErrorRate}%`,
            });
        } else {
            setAlert(null);
        }
    }, [stats]);

    return (
        <AnimatePresence>
            {alert && (
                <motion.div
                    initial={{ y: -60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -60, opacity: 0 }}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        display: 'flex',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        style={{
                            marginTop: 52,
                            background: 'rgba(220, 38, 38, 0.92)',
                            backdropFilter: 'blur(12px)',
                            color: '#ffffff',
                            padding: '10px 24px',
                            borderRadius: 999,
                            boxShadow: '0 0 40px rgba(239, 68, 68, 0.6), 0 0 80px rgba(239, 68, 68, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            border: '1px solid rgba(252, 165, 165, 0.4)',
                            fontFamily: 'ui-monospace, monospace',
                        }}
                    >
                        <motion.span
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 0.6, repeat: Infinity }}
                            style={{ fontSize: 18 }}
                        >
                            ⚠️
                        </motion.span>
                        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.03em' }}>
                            {alert.message}
                        </span>
                        <span
                            style={{
                                fontSize: 11,
                                fontFamily: 'ui-monospace, monospace',
                                background: 'rgba(127, 29, 29, 0.6)',
                                padding: '3px 8px',
                                borderRadius: 4,
                                marginLeft: 4,
                            }}
                        >
                            SYS-ERR-0X1
                        </span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SystemAlertBanner;
