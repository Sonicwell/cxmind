import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const BrainSandbox: React.FC = () => {
    const { t } = useTranslation();

    // Mock logs to simulate AI thought process
    const mockLogs = [
        { text: `[0.012s] ${t('brainSandbox.logs.audioStreamAnalysisStarted', 'Audio stream analysis started: Call #XF-9021')}`, type: "info" },
        { text: `[0.034s] ${t('brainSandbox.logs.vadActivated', 'VAD activated. Voice segment detected.')}`, type: "info" },
        { text: `[0.089s] ${t('brainSandbox.logs.nlp', 'NLP: "I want to cancel my ticket"')}`, type: "data" },
        { text: `[0.105s] ${t('brainSandbox.logs.intentMatched', 'Intent Matched: [REFUND_REQUEST] (Confidence: 98%)')}`, type: "success" },
        { text: `[0.120s] ${t('brainSandbox.logs.emotionAnalysis', 'Emotion Analysis: Stress Score = 0.85 (High)')}`, type: "warning" },
        { text: `[0.145s] ${t('brainSandbox.logs.toolCaller', 'Tool Caller: Querying CRM for Recent Orders...')}`, type: "system" },
        { text: `[0.301s] ${t('brainSandbox.logs.actionDraftGenerated', 'Action Draft generated. Suggesting waiver of cancellation fee.')}`, type: "success" },
        { text: `[3.000s] ${t('brainSandbox.logs.waitingForNextSegment', '--- Waiting for next segment ---')}`, type: "fade" }
    ];

    const [logs, setLogs] = useState<typeof mockLogs>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    // Infinite simulation loop
    useEffect(() => {
        let currentIndex = 0;

        const interval = setInterval(() => {
            setLogs((prev) => {
                // Keep only last 15 lines to avoid memory leak and infinite scroll
                const newLogs = [...prev, mockLogs[currentIndex]];
                if (newLogs.length > 15) newLogs.shift();
                return newLogs;
            });

            currentIndex++;
            if (currentIndex >= mockLogs.length) {
                currentIndex = 0; // Loop the mock array
            }
        }, 1500 + Math.random() * 1000); // Random delay between 1.5s to 2.5s for realism

        return () => clearInterval(interval);
    }, [t]); // Add 't' to dependencies to re-create loop if language changes

    const getColor = (type: string) => {
        switch (type) {
            case 'info': return 'rgba(255,255,255,0.6)';
            case 'data': return '#00ffea';
            case 'success': return '#4ade80';
            case 'warning': return '#ff3366';
            case 'system': return '#a78bfa';
            case 'fade': return 'rgba(255,255,255,0.3)';
            default: return 'white';
        }
    };

    return (
        <div
            ref={scrollRef}
            style={{
                height: '100%',
                width: '100%',
                fontFamily: '"Fira Code", monospace',
                fontSize: '12px',
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}
        >
            {logs.map((log, index) => (
                <motion.div
                    key={`${index}-${log.text.substring(0, 5)}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                        color: getColor(log.type),
                        wordBreak: 'break-word',
                        borderLeft: log.type === 'warning' ? '2px solid #ff3366' : '2px solid transparent',
                        paddingLeft: '8px'
                    }}
                >
                    {log.text}
                </motion.div>
            ))}
            <motion.div
                animate={{ opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                style={{ color: '#00ffea', marginTop: '4px' }}
            >
                █
            </motion.div>
        </div>
    );
};
