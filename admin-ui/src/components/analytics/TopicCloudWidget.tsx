import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { useDemoMode } from '../../hooks/useDemoMode';

interface TopicData {
    text: string;
    value: number;
}

interface TopicCloudWidgetProps {
    days?: number;
    className?: string;
    style?: React.CSSProperties;
}

// Colors adapted for better light/dark mode contrast
const getThemeAwareColor = (index: number, weight: number) => {
    // Select base hue from a predefined set of professional dashboard colors
    const hues = [
        'var(--primary)',        // Blue
        'var(--semantic-info)',  // Cyan
        'var(--semantic-success)', // Green
        'var(--semantic-warning)', // Orange/Yellow
        'hsl(280, 70%, 50%)',    // Purple
    ];

    const baseColor = hues[index % hues.length];

    // Adjust opacity based on importance (weight)
    // Higher weight = more opaque and visible
    const opacity = Math.max(0.4, Math.min(1, weight * 1.2));

    return `color-mix(in srgb, ${baseColor} ${opacity * 100}%, transparent)`;
};

export const TopicCloudWidget: React.FC<TopicCloudWidgetProps> = ({ days = 30, className, style }) => {
    const { t } = useTranslation();
    const [topics, setTopics] = useState<TopicData[]>([]);
    const [loading, setLoading] = useState(true);
    const { demoMode } = useDemoMode();

    useEffect(() => {
        const fetchTopics = async () => {
            try {
                setLoading(true);
                const demoQuery = demoMode ? `&demo=true` : '';
                const res = await api.get(`/analytics/summary/topics?days=${days}${demoQuery}`);
                const raw = res.data;
                const data = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw?.data?.data) ? raw.data.data : []));
                setTopics(data);
            } catch (err) {
                console.error('[Analytics] Failed to fetch topics:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchTopics();
    }, [days, demoMode]);

    // Calculate min and max values to scale font sizes
    const { min, max } = useMemo(() => {
        if (!topics.length) return { min: 0, max: 0 };
        return {
            min: Math.min(...topics.map(t => t.value)),
            max: Math.max(...topics.map(t => t.value))
        };
    }, [topics]);

    const getFontSize = (value: number) => {
        if (max === min) return 1.5; // Default size if all values are equal

        // Scale between 0.85rem and 2.5rem based on relative frequency
        const minSize = 0.85;
        const maxSize = 2.5;
        const ratio = (value - min) / (max - min);
        // Use a slight curve (Math.pow) to emphasize the most frequent words more
        return minSize + (maxSize - minSize) * Math.pow(ratio, 1.2);
    };

    // Always render a wrapper with title
    return (
        <div
            className={`glass-panel ${className || ''}`}
            style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                minHeight: '180px',
                ...style
            }}
        >
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t('analytics.topicCloud.title')}
            </h3>

            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spinner"></div>
                </div>
            ) : !topics.length ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                        {t('analytics.topicCloud.noData')}
                    </div>
                </div>
            ) : (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'center',
                    alignContent: 'center',
                    gap: '12px 24px',
                    flex: 1,
                    padding: '16px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                }}>
                    {topics.map((topic, index) => {
                        const weight = max === min ? 0.5 : (topic.value - min) / (max - min);
                        const fontSize = getFontSize(topic.value);
                        const color = getThemeAwareColor(index, weight);

                        return (
                            <div
                                key={index}
                                title={`${topic.value} occurrences`}
                                style={{
                                    fontSize: `${fontSize}rem`,
                                    color: color,
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: weight > 0.6 ? 700 : (weight > 0.3 ? 600 : 500),
                                    letterSpacing: '-0.02em',
                                    lineHeight: 1.1,
                                    cursor: 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    whiteSpace: 'nowrap',
                                    textShadow: weight > 0.5 ? `0 2px 10px color-mix(in srgb, ${color} 20%, transparent)` : 'none',
                                    opacity: 0.9,
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                                    e.currentTarget.style.opacity = '1';
                                    e.currentTarget.style.filter = 'brightness(1.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1) translateY(0)';
                                    e.currentTarget.style.opacity = '0.9';
                                    e.currentTarget.style.filter = 'brightness(1)';
                                }}
                            >
                                {topic.text}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
