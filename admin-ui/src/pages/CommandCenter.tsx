import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Brain, Radio } from 'lucide-react';
import './CommandCenter.css';

// Sub-components will be imported here
import { BrainSandbox } from './CommandCenter/BrainSandbox';
import { NeuralTopology } from './CommandCenter/NeuralTopology';
import { CyberSpectrogram } from './CommandCenter/CyberSpectrogram';

// Dashboard Broadcaster Integration
import { useWebSocket } from '../context/WebSocketContext';

export const CommandCenter: React.FC = () => {
    const { t } = useTranslation();
    const { subscribe } = useWebSocket();
    const [stats, setStats] = useState({ activeCalls: 0, aiLatency: 45, threatLevel: 'LOW' });

    // Mount/Unmount effects
    useEffect(() => {
        // Hide body scrollbar to ensure pure full screen
        document.body.style.overflow = 'hidden';

        const unsubscribe = subscribe('dashboard:invalidate', (msg: any) => {
            if (msg.payload?.activeCallCount !== undefined) {
                setStats(prev => ({ ...prev, activeCalls: msg.payload.activeCallCount }));
            }
        });

        return () => {
            document.body.style.overflow = '';
            unsubscribe();
        };
    }, [subscribe]);

    return (
        <div className="nexus-container">
            {/* 3D Background Layer */}
            <div className="nexus-bg-layer">
                <NeuralTopology />
            </div>

            {/* 2D Overlay UI Layer */}
            <div className="nexus-ui-layer">
                <motion.div
                    className="nexus-header"
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <div className="nexus-logo">
                        <Radio size={28} className="animate-pulse" />
                        {t('commandCenter.logo')}
                    </div>
                </motion.div>

                {/* AI Brain Sandbox (Left) */}
                <motion.div
                    className="nexus-panel panel-brain"
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                >
                    <div className="nexus-title">
                        <Brain size={16} />
                        {t('commandCenter.aiEngine')}
                    </div>
                    <div className="nexus-content">
                        <BrainSandbox />
                    </div>
                </motion.div>

                {/* System Stats (Top Right) */}
                <motion.div
                    className="nexus-panel panel-stats"
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                >
                    <div className="stat-item">
                        <div className="stat-label">{t('commandCenter.activeConnections')}</div>
                        <div className="stat-value">{stats.activeCalls || 142}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">{t('commandCenter.edgeAiLatency')}</div>
                        <div className="stat-value">{stats.aiLatency}ms</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">{t('commandCenter.systemHealth')}</div>
                        <div className="stat-value" style={{ color: '#00ffea' }}>{t('commandCenter.optimal')}</div>
                    </div>
                </motion.div>

                {/* Cyber Spectrogram (Bottom) */}
                <motion.div
                    className="nexus-panel panel-spectrogram"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
                >
                    <CyberSpectrogram />
                </motion.div>
            </div>
        </div>
    );
};

export default CommandCenter;
