import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export const CyberSpectrogram: React.FC = () => {
    const [bands, setBinds] = useState<number[]>([]);
    const bandCount = 60; // Number of frequency bands

    useEffect(() => {
        // Initial random heights
        setBinds(Array.from({ length: bandCount }, () => Math.random() * 100));

        // Animate heights to simulate audio spectrogram
        const interval = setInterval(() => {
            setBinds(prev => prev.map(val => {
                // Smooth random walk
                let next = val + (Math.random() - 0.5) * 40;
                if (next < 5) next = 5 + Math.random() * 10;
                if (next > 100) next = 90 + Math.random() * 10;
                return next;
            }));
        }, 100); // 10fps update for the bars

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: '4px',
            padding: '0 20px',
            boxSizing: 'border-box'
        }}>
            {bands.map((height, i) => {
                // Color gradient based on height (pseudo-intensity)
                let color = '#00ffea'; // cyan
                if (height > 60) color = '#a78bfa'; // purple
                if (height > 85) color = '#ff3366'; // red/pink for high stress

                return (
                    <motion.div
                        key={i}
                        animate={{ height: `${height}%`, backgroundColor: color }}
                        transition={{ type: 'tween', duration: 0.1 }}
                        style={{
                            flex: 1,
                            width: '100%',
                            minHeight: '2px',
                            borderRadius: '2px 2px 0 0',
                            opacity: 0.8,
                            boxShadow: `0 0 10px ${color}`
                        }}
                    />
                );
            })}
        </div>
    );
};
