import React from 'react';
import { MeshReflectorMaterial } from '@react-three/drei';

interface FloorProps {
    width?: number;
    height?: number;
}

export const Floor: React.FC<FloorProps> = ({ width = 200, height = 200 }) => {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[width, height]} />
            <MeshReflectorMaterial
                blur={[300, 100]}
                resolution={1024}
                mixBlur={1}
                mixStrength={40} // Strength of the reflections
                roughness={0.8} // Less rough, more polished
                depthScale={1.2}
                minDepthThreshold={0.4}
                maxDepthThreshold={1.4}
                color="#e2e8f0" // Light Slate 200 (Bright Floor)
                metalness={0.1} // Matte/Plastic
                mirror={0.2} // Subtle reflection
            />
        </mesh>
    );
};

// Separate Grid Component for that "Tron" look
export const FloorGrid: React.FC<{ width?: number; height?: number }> = ({ width = 200 }) => {
    return (
        <gridHelper
            args={[width, width / 4, 0x94a3b8, 0xe2e8f0]} // Slate 400 lines on Slate 200
            position={[0, 0.05, 0]}
        />
    );
};
