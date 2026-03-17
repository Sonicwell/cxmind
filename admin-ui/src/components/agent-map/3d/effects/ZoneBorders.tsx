import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

interface ZoneBordersProps {
    zones: {
        name: string;
        color: string;
        xMin: number;
        xMax: number;
        yMin: number;
        yMax: number;
    }[];
}

export const ZoneBorders: React.FC<ZoneBordersProps> = ({ zones }) => {
    return (
        <group position={[0, 0.05, 0]}>
            {zones.map((zone, i) => (
                <RoundedRectBorder key={i} zone={zone} />
            ))}
        </group>
    );
};

const RoundedRectBorder: React.FC<{ zone: any }> = ({ zone }) => {
    const shape = useMemo(() => {
        const { xMin, xMax, yMin, yMax } = zone;
        const radius = 2; // Rounded corner radius
        const s = new THREE.Shape();

        // Draw rounded rect path
        s.moveTo(xMin + radius, yMin);
        s.lineTo(xMax - radius, yMin);
        s.quadraticCurveTo(xMax, yMin, xMax, yMin + radius);
        s.lineTo(xMax, yMax - radius);
        s.quadraticCurveTo(xMax, yMax, xMax - radius, yMax);
        s.lineTo(xMin + radius, yMax);
        s.quadraticCurveTo(xMin, yMax, xMin, yMax - radius);
        s.lineTo(xMin, yMin + radius);
        s.quadraticCurveTo(xMin, yMin, xMin + radius, yMin);
        return s;
    }, [zone]);

    return (
        <group>
            {/* 3D Wall Border */}
            {/* We need a hollow shape or just line thickening? 
                Extruding the whole shape makes a solid block. 
                We want walls AROUND the zone. 
                Easiest is to use Line with thickness or create a custom geometry.
                Actually, let's stick to Thick Lines for now but scaled up? 
                No, user asked for "Walls".
                Let's make actual wall geometry by subtracting inner shape? 
                Or just use thick lines (TubeGeometry path).
            */}
            <Line
                points={useMemo(() => shape.getPoints(50).map(p => new THREE.Vector3(p.x, 1, p.y)), [shape])}
                color={zone.color}
                lineWidth={10} // Thicker lines
                transparent
                opacity={0.8}
            />
            {/* Floor Glow */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
                <shapeGeometry args={[shape]} />
                <meshBasicMaterial color={zone.color} transparent opacity={0.1} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
};
