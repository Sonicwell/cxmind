import React, { useMemo, useRef } from 'react';
import { QuadraticBezierLine } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';


interface ConnectionsProps {
    lines: {
        id: string;
        start: [number, number, number];
        end: [number, number, number];
        color: string;
        type: 'agent-customer' | 'agent-agent';
    }[];
}

export const Connections: React.FC<ConnectionsProps> = ({ lines }) => {
    return (
        <group>
            {lines.map(line => (
                <AnimatedLine key={line.id} {...line} />
            ))}
        </group>
    );
};

const AnimatedLine: React.FC<{ start: [number, number, number]; end: [number, number, number]; color: string }> = ({ start, end, color }) => {
    const ref = useRef<any>(null);
    const lineFrame = useRef(0);

    const mid = useMemo(() => {
        const midX = (start[0] + end[0]) / 2;
        const midZ = (start[2] + end[2]) / 2;
        const dist = Math.sqrt(Math.pow(end[0] - start[0], 2) + Math.pow(end[2] - start[2], 2));
        const height = Math.min(dist * 0.5, 5);
        return [midX, height, midZ] as [number, number, number];
    }, [start, end]);

    useFrame(({ clock }) => {
        // ~20fps
        lineFrame.current++;
        if (lineFrame.current % 3 !== 0) return;
        if (ref.current) {
            const t = clock.getElapsedTime();
            ref.current.material.opacity = 0.5 + Math.sin(t * 3) * 0.3;
            ref.current.material.linewidth = 2 + Math.sin(t * 5) * 0.5;
        }
    });

    return (
        <QuadraticBezierLine
            ref={ref}
            start={start}
            end={end}
            mid={mid}
            color={color}
            lineWidth={2}
            dashed={false} // Solid neon beam
            transparent
            opacity={0.8}
        />
    );
};
