import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { CubicBezierLine } from '@react-three/drei';
import * as THREE from 'three';

interface CallConnectionLinesProps {
    stations: any[];
    connections: { id: string; type: string; agentStationIdx: number; targetStationIdx?: number; zoneIndex: number }[];
    zoneDefs: { name: string; color: string; xMin: number; xMax: number; yMin: number; yMax: number }[];
    mapCoord: (px: number, py: number) => [number, number, number];
}

export const CallConnectionLines: React.FC<CallConnectionLinesProps> = ({ stations, connections, zoneDefs, mapCoord }) => {
    // Generate line data
    const lines = useMemo(() => {
        return connections.map(conn => {
            const agentStation = stations[conn.agentStationIdx];
            if (!agentStation) return null;

            const start = mapCoord(agentStation.x, agentStation.y);
            let end: [number, number, number] | null = null;
            let color = '#a78bfa';

            if (conn.type === 'agent-agent' && conn.targetStationIdx != null) {
                const targetStation = stations[conn.targetStationIdx];
                if (targetStation) {
                    end = mapCoord(targetStation.x, targetStation.y);
                    color = '#a78bfa';
                }
            } else {
                const zone = zoneDefs[conn.zoneIndex];
                if (zone) {
                    const custX = (zone.xMin + zone.xMax) / 2;
                    const custY = zone.yMin - 20;
                    const cPos = mapCoord(custX, custY);
                    end = [cPos[0], 0.4, cPos[2]];
                    color = zone.color;
                }
            }

            if (!end) return null;

            const midX = (start[0] + end[0]) / 2;
            const midZ = (start[2] + end[2]) / 2;
            const height = 1.5;

            return {
                id: conn.id,
                start: new THREE.Vector3(...start),
                end: new THREE.Vector3(...end),
                midA: new THREE.Vector3(midX, height, midZ),
                midB: new THREE.Vector3(midX, height, midZ),
                color
            };
        }).filter((l): l is NonNullable<typeof l> => l !== null);
    }, [connections, stations, zoneDefs, mapCoord]);

    return (
        <group>
            {lines.map(line => (
                <group key={line.id}>
                    <CubicBezierLine
                        start={line.start}
                        end={line.end}
                        midA={line.midA}
                        midB={line.midB}
                        color={line.color}
                        lineWidth={2}
                        dashed
                        dashScale={2}
                        gapSize={2}
                        opacity={0.4}
                        transparent
                    />
                    <MovingParticles line={line} count={3} />
                </group>
            ))}
        </group>
    );
};

const MovingParticles = ({ line, count }: { line: any, count: number }) => {
    const refs = useRef<THREE.Mesh[]>([]);
    const mpFrame = useRef(0);

    useFrame(({ clock }) => {
        // ~20fps
        mpFrame.current++;
        if (mpFrame.current % 3 !== 0) return;
        const time = clock.getElapsedTime();
        refs.current.forEach((mesh, i) => {
            if (!mesh) return;
            const offset = i / count;
            const t = (time * 0.5 + offset) % 1;

            const p0 = line.start;
            const p1 = line.midA;
            const p2 = line.midB;
            const p3 = line.end;

            mesh.position.set(0, 0, 0);
            mesh.position.addScaledVector(p0, Math.pow(1 - t, 3));
            mesh.position.addScaledVector(p1, 3 * Math.pow(1 - t, 2) * t);
            mesh.position.addScaledVector(p2, 3 * (1 - t) * Math.pow(t, 2));
            mesh.position.addScaledVector(p3, Math.pow(t, 3));
        });
    });

    return (
        <group>
            {[...Array(count)].map((_, i) => (
                <mesh key={i} ref={el => { if (el) refs.current[i] = el; }}>
                    <sphereGeometry args={[0.08, 8, 8]} />
                    <meshBasicMaterial color={line.color} transparent opacity={0.9} />
                </mesh>
            ))}
        </group>
    );
};
