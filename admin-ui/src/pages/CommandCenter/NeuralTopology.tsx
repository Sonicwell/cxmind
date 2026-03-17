import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Float } from '@react-three/drei';
import * as THREE from 'three';

// -------------------------------------------------------------
// Component: Neural Nodes (Servers, Agents, Customers)
// -------------------------------------------------------------
const Nodes = () => {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Create 3 kinds of nodes roughly mapped to positions
    // 0-4: Data Centers (IE/AS)
    // 5-20: Clients / SIP Trunks (Outer layer)
    // 21-50: Agents (Inner layer)
    const count = 50;

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const positions = useMemo(() => {
        const arr = [];
        for (let i = 0; i < count; i++) {
            let x = 0, y = 0, z = 0;
            if (i < 5) { // Core
                x = (Math.random() - 0.5) * 4;
                y = (Math.random() - 0.5) * 4;
                z = (Math.random() - 0.5) * 4;
            } else if (i < 20) { // Outer Endpoints
                const radius = 15 + Math.random() * 10;
                const theta = Math.random() * 2 * Math.PI;
                const phi = Math.acos((Math.random() * 2) - 1);
                x = radius * Math.sin(phi) * Math.cos(theta);
                y = radius * Math.sin(phi) * Math.sin(theta);
                z = radius * Math.cos(phi);
            } else { // Agents Middle
                const radius = 6 + Math.random() * 6;
                const theta = Math.random() * 2 * Math.PI;
                x = radius * Math.cos(theta);
                y = (Math.random() - 0.5) * 2; // Flat disc
                z = radius * Math.sin(theta);
            }
            arr.push(new THREE.Vector3(x, y, z));
        }
        return arr;
    }, [count]);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();

        positions.forEach((pos, i) => {
            // Gentle floating
            dummy.position.copy(pos);
            dummy.position.y += Math.sin(time + i) * 0.2;

            // Core pulsing logic
            if (i < 5) {
                const scale = 1 + Math.sin(time * 3 + i) * 0.2;
                dummy.scale.set(scale, scale, scale);
            } else {
                dummy.scale.set(0.5, 0.5, 0.5);
            }

            dummy.updateMatrix();
            meshRef.current?.setMatrixAt(i, dummy.matrix);

            // Add color to instances for distinction (Blue Core, Cyan Agents, Dim Outer)
            const color = new THREE.Color();
            if (i < 5) color.setHex(0x0066ff); // Core IE/AS
            else if (i < 20) color.setHex(0x223344); // Caller
            else color.setHex(0x00ffea); // Agent
            meshRef.current?.setColorAt(i, color);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
        meshRef.current.instanceColor!.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    );
};

// -------------------------------------------------------------
// Component: Data Lines connecting nodes
// -------------------------------------------------------------
const DataLines = () => {
    // A simple static geometry for lines. We can add moving pulses along these lines later.
    return (
        <mesh>
            {/* In a real scenario we use LineSegments or Trail. 
           For this MVP WoW phase, we rely on the floating nodes and a glowing wireframe globe to simulate data fields */}
            <sphereGeometry args={[14, 24, 24]} />
            <meshBasicMaterial color="#00ffea" wireframe transparent opacity={0.03} />
        </mesh>
    );
}

// -------------------------------------------------------------
// Component: Post Processing Core 
// -------------------------------------------------------------
export const NeuralTopology: React.FC = () => {
    return (
        <Canvas camera={{ position: [0, 5, 25], fov: 45 }}>
            <color attach="background" args={['#010308']} />

            <ambientLight intensity={0.5} />
            <pointLight position={[0, 0, 0]} intensity={2} color="#0066ff" />

            <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />

            <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
                <group>
                    <Nodes />
                    <DataLines />
                </group>
            </Float>

            <OrbitControls
                enablePan={false}
                enableZoom={false}
                autoRotate={true}
                autoRotateSpeed={0.5}
                maxPolarAngle={Math.PI / 2 + 0.2}
                minPolarAngle={Math.PI / 2 - 0.2}
            />
        </Canvas>
    );
};
