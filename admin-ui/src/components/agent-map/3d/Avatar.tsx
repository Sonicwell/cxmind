import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ─── Shared Geometries ─── */
const GEOM_BODY = new THREE.BoxGeometry(0.5, 0.6, 0.3);
const GEOM_HEAD = new THREE.SphereGeometry(0.18, 16, 16);
const GEOM_HEADSET = new THREE.BoxGeometry(0.05, 0.1, 0.1);
const GEOM_HEADSET_LED = new THREE.SphereGeometry(0.02);
const GEOM_ARM = new THREE.CapsuleGeometry(0.08, 0.5);
interface AvatarProps {
    status: string;
    position: [number, number, number];
}

export const Avatar: React.FC<AvatarProps> = ({ status, position }) => {
    const groupRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Mesh>(null);

    // Status Logic
    const isTalking = status === 'oncall';


    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const t = clock.getElapsedTime();

        // Idle breathing
        groupRef.current.position.y = position[1] + Math.sin(t * 1) * 0.02;

        // Head bobbing if talking
        if (headRef.current) {
            if (isTalking) {
                headRef.current.rotation.x = Math.sin(t * 10) * 0.05 + 0.1;
                headRef.current.rotation.y = Math.sin(t * 2) * 0.1;
            } else {
                // Look around slowly if idle
                headRef.current.rotation.y = Math.sin(t * 0.5) * 0.2;
            }
        }
    });

    // Materials
    const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fca5a5', roughness: 0.3 }), []);
    const suitMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 }), []);
    const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#00ffff' }), []); // Headset light

    return (
        <group ref={groupRef} position={position} scale={[15, 15, 15]}>
            {/* Body */}
            <mesh position={[0, 0.4, 0]} material={suitMat} geometry={GEOM_BODY} />

            {/* Head */}
            <mesh ref={headRef} position={[0, 0.85, 0]} material={skinMat} geometry={GEOM_HEAD}>

                {/* Headset (attached to head) */}
                <group position={[0, 0, 0]}>
                    <mesh position={[0.19, 0, 0]} geometry={GEOM_HEADSET}>
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                    <mesh position={[0.2, 0, 0.1]} geometry={GEOM_HEADSET_LED}>
                        <primitive object={glowMat} />
                    </mesh>
                </group>
            </mesh>

            {/* Arms (Resting on desk) */}
            <mesh position={[-0.3, 0.45, 0.3]} rotation={[0.5, 0, -0.2]} material={suitMat} geometry={GEOM_ARM} />
            <mesh position={[0.3, 0.45, 0.3]} rotation={[0.5, 0, 0.2]} material={suitMat} geometry={GEOM_ARM} />
        </group>
    );
};
