import React from 'react';
import { Text, Billboard } from '@react-three/drei';


export interface ZoneQualityData {
    zoneIndex: number;
    avgScore: number;
    inspections: number;
    excellentCount: number;
    goodCount: number;
    poorCount: number;
    topAgent?: string;
    topAgentScore?: number;
    trend: 'up' | 'down' | 'stable';
}

interface ZoneQualityCardProps {
    position: [number, number, number];
    data: ZoneQualityData;
    zoneColor: string;
    width?: number;
}

export const getScoreColor = (score: number): string => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    return '#ef4444';
};

export const getScoreGrade = (score: number): string => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Poor';
};

const getTrendArrow = (trend: 'up' | 'down' | 'stable'): string => {
    if (trend === 'up') return '▲';
    if (trend === 'down') return '▼';
    return '►';
};

/**
 * ZoneQualityCard — Pure R3F Billboard card (no Html component).
 * Renders a compact QI score indicator above each zone using Billboard + geometry + Text.
 */
export const ZoneQualityCard: React.FC<ZoneQualityCardProps> = ({ position, data, zoneColor, width: widthProp }) => {
    const { avgScore, inspections, excellentCount, goodCount, poorCount, topAgent, topAgentScore, trend } = data;

    const barWidth = widthProp ? Math.min(widthProp, 4.5) : 3.2;
    const barHeight = 0.72;

    const total = excellentCount + goodCount + poorCount;
    const exPct = total > 0 ? excellentCount / total : 0;
    const gdPct = total > 0 ? goodCount / total : 0;

    const scoreColor = getScoreColor(avgScore);
    const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#94a3b8';
    const trendArrow = getTrendArrow(trend);

    // Distribution bar geometry
    const distBarW = barWidth - 0.6;
    const distBarH = 0.06;
    const distBarY = -barHeight / 2 + 0.12;

    return (
        <Billboard position={position}>
            <React.Suspense fallback={null}>
                {/* Background panel */}
                <mesh>
                    <planeGeometry args={[barWidth, barHeight]} />
                    <meshBasicMaterial color="#05070a" transparent opacity={0.82} depthWrite={false} />
                </mesh>

                {/* Top border accent */}
                <mesh position={[0, barHeight / 2 - 0.015, 0.001]}>
                    <planeGeometry args={[barWidth, 0.03]} />
                    <meshBasicMaterial color={zoneColor} transparent opacity={0.6} depthWrite={false} />
                </mesh>

                {/* QI Score label */}
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[-barWidth / 2 + 0.15, barHeight / 2 - 0.12, 0.01]}
                    fontSize={0.08}
                    color="#64748b"
                    anchorX="left"
                    anchorY="middle"
                >
                    QI SCORE
                </Text>

                {/* Inspections count */}
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[barWidth / 2 - 0.15, barHeight / 2 - 0.12, 0.01]}
                    fontSize={0.07}
                    color="#475569"
                    anchorX="right"
                    anchorY="middle"
                >
                    {`${inspections} calls`}
                </Text>

                {/* Score value (large) */}
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[-barWidth / 2 + 0.45, 0.04, 0.01]}
                    fontSize={0.22}
                    color={scoreColor}
                    anchorX="center"
                    anchorY="middle"
                    fontWeight={700}
                >
                    {`${avgScore}`}
                </Text>

                {/* Score denominator */}
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[-barWidth / 2 + 0.45, -0.08, 0.01]}
                    fontSize={0.06}
                    color="#475569"
                    anchorX="center"
                    anchorY="middle"
                >
                    /100
                </Text>

                {/* Divider line */}
                <mesh position={[-barWidth / 2 + 0.8, 0, 0.005]}>
                    <planeGeometry args={[0.015, barHeight * 0.5]} />
                    <meshBasicMaterial color="#1e293b" transparent opacity={0.8} depthWrite={false} />
                </mesh>

                {/* Trend arrow + grade */}
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[-barWidth / 2 + 1.05, 0.08, 0.01]}
                    fontSize={0.1}
                    color={trendColor}
                    anchorX="left"
                    anchorY="middle"
                >
                    {`${trendArrow} ${getScoreGrade(avgScore)}`}
                </Text>

                {/* Top Agent */}
                {topAgent && (
                    <Text
                        font="/fonts/kenpixel.ttf"
                        position={[-barWidth / 2 + 1.05, -0.06, 0.01]}
                        fontSize={0.07}
                        color="#94a3b8"
                        anchorX="left"
                        anchorY="middle"
                    >
                        {`★ ${topAgent.replace('ag_', '#')} · ${topAgentScore}`}
                    </Text>
                )}

                {/* Distribution bar background */}
                <mesh position={[0, distBarY, 0.005]}>
                    <planeGeometry args={[distBarW, distBarH]} />
                    <meshBasicMaterial color="#1e293b" transparent opacity={0.5} depthWrite={false} />
                </mesh>

                {/* Distribution bar — Excellent */}
                {exPct > 0 && (
                    <mesh position={[-distBarW / 2 + (distBarW * exPct) / 2, distBarY, 0.006]}>
                        <planeGeometry args={[distBarW * exPct, distBarH]} />
                        <meshBasicMaterial color="#22c55e" transparent opacity={0.9} depthWrite={false} />
                    </mesh>
                )}

                {/* Distribution bar — Good */}
                {gdPct > 0 && (
                    <mesh position={[-distBarW / 2 + distBarW * exPct + (distBarW * gdPct) / 2, distBarY, 0.006]}>
                        <planeGeometry args={[distBarW * gdPct, distBarH]} />
                        <meshBasicMaterial color="#eab308" transparent opacity={0.9} depthWrite={false} />
                    </mesh>
                )}

                {/* Distribution bar — Poor */}
                {(1 - exPct - gdPct) > 0 && total > 0 && (
                    <mesh position={[-distBarW / 2 + distBarW * (exPct + gdPct) + (distBarW * (1 - exPct - gdPct)) / 2, distBarY, 0.006]}>
                        <planeGeometry args={[distBarW * (1 - exPct - gdPct), distBarH]} />
                        <meshBasicMaterial color="#ef4444" transparent opacity={0.9} depthWrite={false} />
                    </mesh>
                )}

                {/* Legend labels */}
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[-distBarW / 2, distBarY - 0.08, 0.01]}
                    fontSize={0.055}
                    color="#22c55e"
                    anchorX="left"
                    anchorY="middle"
                >
                    {`${excellentCount}`}
                </Text>
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[0, distBarY - 0.08, 0.01]}
                    fontSize={0.055}
                    color="#eab308"
                    anchorX="center"
                    anchorY="middle"
                >
                    {`${goodCount}`}
                </Text>
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[distBarW / 2, distBarY - 0.08, 0.01]}
                    fontSize={0.055}
                    color="#ef4444"
                    anchorX="right"
                    anchorY="middle"
                >
                    {`${poorCount}`}
                </Text>
            </React.Suspense>
        </Billboard>
    );
};

export default ZoneQualityCard;
