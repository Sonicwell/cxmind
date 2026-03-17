import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * EmotionAura — Sonar pulse ring rendered at floor level beneath a workstation.
 *
 * Visual design:
 * - Expanding ring: radius 0.0 → 1.5, opacity 0.6 → 0.0, repeating
 * - Color: stress 0.0 = calm cyan → 0.5 = yellow → 1.0 = hot red
 * - Pulse speed: scales with stress (calm 3s → stressed 1s cycle)
 * - Inner constant glow disc matching stress color
 *
 * C2-P2: Driven by BehaviorSnapshot.stress_score from DashboardContext.stressMap
 */

interface EmotionAuraProps {
    stressScore: number;            // 0.0–1.0 (from RMS behavior)
    emotionValence?: number;        // 0.0–1.0 (from SER) — if present, blends with stressScore
    is2D?: boolean;
}

// Pre-allocated color objects to avoid per-frame allocation
const COLOR_CALM = new THREE.Color('#22d3ee');   // cyan
const COLOR_MID = new THREE.Color('#facc15');   // yellow
const COLOR_HOT = new THREE.Color('#ef4444');   // red
const TEMP_COLOR = new THREE.Color();

/** Interpolate stress score → color (cyan → yellow → red) */
function stressColor(score: number, out: THREE.Color): THREE.Color {
    if (score <= 0.5) {
        return out.copy(COLOR_CALM).lerp(COLOR_MID, score * 2);
    }
    return out.copy(COLOR_MID).lerp(COLOR_HOT, (score - 0.5) * 2);
}

// Pulse ring count for multi-ring sonar effect
const RING_COUNT = 2;

export const EmotionAura: React.FC<EmotionAuraProps> = ({ stressScore, emotionValence, is2D }) => {
    const groupRef = useRef<THREE.Group>(null);
    const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
    const innerRef = useRef<THREE.Mesh>(null);

    // Smooth stress score (lerp to avoid jarring transitions)
    const smoothRef = useRef(stressScore);

    // Pulse phase offsets for each ring
    const phaseOffsets = useMemo(() => {
        const offsets: number[] = [];
        for (let i = 0; i < RING_COUNT; i++) {
            offsets.push(i / RING_COUNT);
        }
        return offsets;
    }, []);

    const auraFrame = useRef(0);
    useFrame(({ clock }) => {
        // ~20fps for sonar pulse
        auraFrame.current++;
        if (auraFrame.current % 3 !== 0) return;

        const time = clock.getElapsedTime();

        let targetScore = stressScore;
        if (typeof emotionValence === 'number') {
            const serStress = 1 - emotionValence;
            targetScore = serStress * 0.7 + stressScore * 0.3;
        }

        smoothRef.current = THREE.MathUtils.lerp(smoothRef.current, targetScore, 0.05);
        const s = smoothRef.current;

        const cycleDuration = THREE.MathUtils.lerp(3.0, 1.0, s);

        stressColor(s, TEMP_COLOR);

        for (let i = 0; i < RING_COUNT; i++) {
            const ring = ringRefs.current[i];
            if (!ring) continue;

            const phase = ((time / cycleDuration) + phaseOffsets[i]) % 1.0;

            const scale = phase * 1.5;
            ring.scale.set(scale, scale, 1);

            const mat = ring.material as THREE.MeshBasicMaterial;
            mat.color.copy(TEMP_COLOR);
            mat.opacity = (1 - phase) * 0.5 * Math.max(s, 0.15);
        }

        if (innerRef.current) {
            const mat = innerRef.current.material as THREE.MeshBasicMaterial;
            mat.color.copy(TEMP_COLOR);
            mat.opacity = 0.1 + s * 0.2 + Math.sin(time * 2) * 0.05;
        }
    });

    return (
        <group
            ref={groupRef}
            rotation={is2D ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}
            position={[0, 0.04, 0]}
        >
            {/* Pulse rings */}
            {phaseOffsets.map((_, i) => (
                <mesh
                    key={`pulse-ring-${i}`}
                    ref={(el) => { ringRefs.current[i] = el; }}
                >
                    <ringGeometry args={[0.9, 1.0, 48]} />
                    <meshBasicMaterial
                        color={COLOR_CALM}
                        transparent
                        opacity={0}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            ))}

            {/* Inner constant glow disc */}
            <mesh ref={innerRef}>
                <circleGeometry args={[0.6, 32]} />
                <meshBasicMaterial
                    color={COLOR_CALM}
                    transparent
                    opacity={0.1}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
};
