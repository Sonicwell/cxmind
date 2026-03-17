import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Text, Billboard, Line } from '@react-three/drei';
import * as THREE from 'three';
// EmotionAura sonar removed — stress now shown via avatar border

/* ─── Shared Geometries (created once, reused across all Workstation instances) ─── */
const GEOM_SELECTION_RING = new THREE.RingGeometry(1.3, 1.5, 32);
const GEOM_GLOW_RING_OUTER = new THREE.RingGeometry(0.85, 1.15, 48);
const GEOM_GLOW_RING_INNER = new THREE.RingGeometry(0.88, 0.92, 48);
const GEOM_DESK_BASE = new THREE.CylinderGeometry(0.6, 0.7, 0.05, 32);
const GEOM_CHAIR_SEAT = new THREE.BoxGeometry(0.4, 0.05, 0.4);
const GEOM_CHAIR_BACK = new THREE.BoxGeometry(0.4, 0.5, 0.05);
const GEOM_ICON_PLANE = new THREE.PlaneGeometry(0.5, 0.5);
const GEOM_SCREEN_GLASS = new THREE.BoxGeometry(1.2, 0.7, 0.02);
const GEOM_SCREEN_BORDER = new THREE.BoxGeometry(1.22, 0.72, 0.01);
const GEOM_SIP_BG = new THREE.PlaneGeometry(0.8, 0.26);
const GEOM_SCREEN_STAND = new THREE.CylinderGeometry(0.02, 0.03, 0.6, 6);
const GEOM_HITBOX = new THREE.CylinderGeometry(1.2, 1.2, 4, 16);
const GEOM_STATUS_RING = new THREE.RingGeometry(0.4, 0.45, 32);
const GEOM_HIGHLIGHT_RING = new THREE.RingGeometry(1.0, 1.2, 48);
// 默认 size=0.7 的头像圆形几何体，所有 AvatarPortrait 共享
const GEOM_AVATAR_CIRCLE_DEFAULT = new THREE.CircleGeometry(0.35, 32); // 0.7 / 2 = 0.35
/* Avatar image paths */
const AVATAR_PATHS = [
    '/avatars/agent_1.png',
    '/avatars/agent_2.png',
    '/avatars/agent_3.png',
    '/avatars/agent_4.png',
    '/avatars/agent_5.png',
    '/avatars/agent_6.png',
];

import { getStatusColor } from '../utils';
import { useScFontLoaded } from '../../../hooks/useScFontLoaded';

// 模块级共享 CXMI icon 纹理 (避免 100 个工位各自加载)
let _sharedCxmiTexture: THREE.Texture | null = null;
let _cxmiTextureLoading = false;
const _cxmiTextureCallbacks: ((tex: THREE.Texture) => void)[] = [];

function getCxmiTexture(cb: (tex: THREE.Texture) => void) {
    if (_sharedCxmiTexture) { cb(_sharedCxmiTexture); return; }
    _cxmiTextureCallbacks.push(cb);
    if (_cxmiTextureLoading) return;
    _cxmiTextureLoading = true;
    new THREE.TextureLoader().load('/cxmi_icon.svg', (tex) => {
        _sharedCxmiTexture = tex;
        _cxmiTextureCallbacks.forEach(fn => fn(tex));
        _cxmiTextureCallbacks.length = 0;
    });
}




/* ─────────────── 3D Avatar (seated agent) ─────────────── */

interface Avatar3DProps {
    statusColor: string;
    glowColor: THREE.Color;
    isActive: boolean;
    isDimmed?: boolean;
}

export const Avatar3D: React.FC<Avatar3DProps> = ({ statusColor, glowColor, isActive, isDimmed }) => {
    const headRef = useRef<THREE.Mesh>(null);

    useFrame(({ clock }) => {
        if (!headRef.current || !isActive || isDimmed) return;
        headRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.5) * 0.05;
    });

    const bodyColor = isActive ? statusColor : '#64748b';
    const emissiveColor = isActive ? glowColor : new THREE.Color('#000');
    const emissiveStr = isActive && !isDimmed ? 0.35 : 0;

    // Dimming effect
    const finalBodyColor = isDimmed ? '#1e293b' : bodyColor;

    return (
        <group position={[0, 0.55, -0.15]}>
            {/* Lower torso (seated) */}
            <mesh position={[0, 0, 0.05]}>
                <boxGeometry args={[0.28, 0.2, 0.25]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Upper torso */}
            <mesh position={[0, 0.22, 0]}>
                <capsuleGeometry args={[0.14, 0.18, 4, 8]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Left shoulder */}
            <mesh position={[-0.2, 0.22, 0]}>
                <sphereGeometry args={[0.07, 8, 8]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Right shoulder */}
            <mesh position={[0.2, 0.22, 0]}>
                <sphereGeometry args={[0.07, 8, 8]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Left arm (resting on desk) */}
            <mesh position={[-0.22, 0.12, 0.15]} rotation={[0.6, 0, 0.2]}>
                <capsuleGeometry args={[0.04, 0.2, 4, 8]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Right arm (resting on desk) */}
            <mesh position={[0.22, 0.12, 0.15]} rotation={[0.6, 0, -0.2]}>
                <capsuleGeometry args={[0.04, 0.2, 4, 8]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Neck */}
            <mesh position={[0, 0.38, 0]}>
                <cylinderGeometry args={[0.04, 0.05, 0.08, 8]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Head */}
            <mesh ref={headRef} position={[0, 0.5, 0]}>
                <sphereGeometry args={[0.12, 16, 16]} />
                <meshStandardMaterial color={finalBodyColor} emissive={emissiveColor} emissiveIntensity={emissiveStr} />
            </mesh>
            {/* Headset band */}
            <mesh position={[0, 0.56, 0]} rotation={[0, 0, 0]}>
                <torusGeometry args={[0.11, 0.015, 8, 16, Math.PI]} />
                <meshStandardMaterial color={isDimmed ? '#334155' : "#94a3b8"} metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Headset earpiece (left) */}
            <mesh position={[-0.11, 0.48, 0]}>
                <boxGeometry args={[0.04, 0.08, 0.06]} />
                <meshStandardMaterial color={isDimmed ? '#1e293b' : "#475569"} metalness={0.5} roughness={0.4} />
            </mesh>
            {/* Microphone boom */}
            <mesh position={[-0.08, 0.42, 0.08]} rotation={[0.3, 0, 0.2]}>
                <cylinderGeometry args={[0.01, 0.01, 0.12, 6]} />
                <meshStandardMaterial color={isDimmed ? '#334155' : "#94a3b8"} metalness={0.5} roughness={0.4} />
            </mesh>
            {/* Microphone tip */}
            <mesh position={[-0.06, 0.38, 0.13]}>
                <sphereGeometry args={[0.025, 8, 8]} />
                <meshStandardMaterial color={isDimmed ? '#0f172a' : "#334155"} metalness={0.4} roughness={0.5} />
            </mesh>
        </group>
    );
};

/* ─────────────── Avatar Portrait (textured headshot) ─────────────── */

interface AvatarPortraitProps {
    avatarPath: string;
    isOnline: boolean;
    copilotOnline?: boolean;
    size?: number;
    isDimmed?: boolean;
    stressScore?: number; // 0.0–1.0
}

export const AvatarPortrait: React.FC<AvatarPortraitProps> = ({ avatarPath, isOnline, copilotOnline, size = 0.7, isDimmed, stressScore }) => {
    const path = avatarPath || AVATAR_PATHS[0];
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    useEffect(() => {
        const loader = new THREE.TextureLoader();
        loader.load(path, (tex) => setTexture(tex));
    }, [path]);

    // 默认 size 直接复用模块级共享几何体，非默认 size 才 useMemo
    const circleGeo = useMemo(
        () => size === 0.7 ? GEOM_AVATAR_CIRCLE_DEFAULT : new THREE.CircleGeometry(size / 2, 32),
        [size]
    );

    // Brightness depends on: offline < SIP-only online < Copilot online
    const ringOpacity = isDimmed ? 0.1 : (copilotOnline ? 0.9 : (isOnline ? 0.4 : 0.3));
    const imgOpacity = isDimmed ? 0.15 : (copilotOnline ? 1.0 : (isOnline ? 0.35 : 0.2));
    const ringColor = isDimmed ? '#475569' : (copilotOnline ? '#22d3ee' : (isOnline ? '#3b82f6' : '#475569'));

    // Stress border: derived from stressScore
    const showStress = !isDimmed && typeof stressScore === 'number' && stressScore > 0.3;
    const isHighStress = showStress && stressScore! > 0.6;
    const stressBorderColor = showStress
        ? (isHighStress ? '#ef4444' : '#facc15')  // red or yellow
        : '#00000000';
    // Very thick borders — must be visible at 100% zoom
    const stressBorderWidth = isHighStress ? 0.20 : (showStress ? 0.15 : 0);
    // Phase for stress pulse animation
    const stressPhase = useMemo(() => Math.random() * Math.PI * 2, []);
    const stressRingRef = useRef<THREE.Mesh>(null);
    const stressGlowRef = useRef<THREE.Mesh>(null);

    const stressFrame = useRef(0);
    useFrame(({ clock }) => {
        if (!showStress) return;
        // ~20fps for stress pulsation
        stressFrame.current++;
        if (stressFrame.current % 3 !== 0) return;
        const t = clock.getElapsedTime();
        if (stressRingRef.current) {
            const mat = stressRingRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity = isHighStress
                ? 0.7 + Math.sin(t * 2.5 + stressPhase) * 0.3
                : 0.5 + Math.sin(t * 1.5 + stressPhase) * 0.2;
        }
        if (stressGlowRef.current) {
            const mat = stressGlowRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity = isHighStress
                ? 0.25 + Math.sin(t * 2.5 + stressPhase) * 0.2
                : 0.12 + Math.sin(t * 1.5 + stressPhase) * 0.08;
        }
    });

    return (
        <Billboard position={[0, 1.6, 0]}>
            {/* Outer additive glow — visible halo around avatar */}
            {showStress && (
                <mesh ref={stressGlowRef}>
                    <ringGeometry args={[
                        size / 2 + 0.04 + stressBorderWidth,
                        size / 2 + 0.04 + stressBorderWidth + (isHighStress ? 0.20 : 0.12),
                        32
                    ]} />
                    <meshBasicMaterial
                        color={stressBorderColor}
                        transparent
                        opacity={0.2}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            )}
            {/* Stress border ring — thick and bright */}
            {showStress && (
                <mesh ref={stressRingRef}>
                    <ringGeometry args={[size / 2 + 0.04, size / 2 + 0.04 + stressBorderWidth, 32]} />
                    <meshBasicMaterial
                        color={stressBorderColor}
                        transparent
                        opacity={0.8}
                        depthWrite={false}
                    />
                </mesh>
            )}
            {/* Portrait background ring */}
            <mesh>
                <ringGeometry args={[size / 2, size / 2 + 0.04, 32]} />
                <meshBasicMaterial
                    color={ringColor}
                    transparent
                    opacity={ringOpacity}
                />
            </mesh>
            {/* Avatar image */}
            {texture && (
                <mesh geometry={circleGeo}>
                    <meshBasicMaterial
                        map={texture}
                        transparent
                        opacity={imgOpacity}
                        toneMapped={false}
                        color={isDimmed ? '#555' : '#fff'}
                    />
                </mesh>
            )}
        </Billboard>
    );
};

/* ─────────────── Workstation ─────────────── */

export interface WorkstationProps {
    position: [number, number, number];
    agent: any | null;
    isSelected: boolean;
    onClick: () => void;
    zoneColor: string;
    label: string;
    avatarIndex: number;
    isDimmed?: boolean;
    isHighlighted?: boolean; // Search result highlight
    lodLevel?: number; // 0=far (avatar only), 1=mid (+name), 2=near (full detail)
    viewMode: '2d' | '3d';
    stressScore?: number; // C2-P2: 0.0–1.0 from BehaviorSnapshot
    isCardLocked?: boolean;
    onToggleLock?: () => void;
    agentId?: string;
    onHover?: (id: string | null) => void;
}

const WorkstationInner: React.FC<WorkstationProps> = ({ position, agent, agentId, isSelected, onClick, zoneColor: _zoneColor, label, avatarIndex, isDimmed, isHighlighted, lodLevel = 2, viewMode, stressScore, isCardLocked: _isCardLocked, onToggleLock: _onToggleLock, onHover }) => {
    // 1. Derived State
    const is2D = viewMode === '2d';
    const status = agent?.status || 'offline';
    const isOccupied = !!agent;
    const isOnline = agent && status !== 'offline';
    const statusColor = getStatusColor(status);
    const parsedStatusColor = useMemo(() => new THREE.Color(statusColor), [statusColor]);

    // Use dynamic font to prevent blocking the initial render
    // Pass agents as a single object to trigger detection
    const agentsMap = useMemo(() => agent ? { [agent.id]: agent } : {}, [agent]);
    const dynamicFont = useScFontLoaded(agentsMap);

    // 2. Hover State Logic
    const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup hover timeout on unmount (Fix #3: prevent setState on unmounted component)
    useEffect(() => () => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    }, []);

    const onPointerOver = useCallback(() => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        hoverTimeout.current = setTimeout(() => {
            const id = agentId || agent?.id;
            if (id) onHover?.(id);
        }, 100);
    }, [agent, agentId, onHover]);

    const onPointerOut = useCallback(() => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        hoverTimeout.current = setTimeout(() => {
            onHover?.(null);
        }, 500);
    }, [onHover]);



    // 3. Assets & Refs — 共享 CXMI 纹理
    const [cxmiTexture, setCxmiTexture] = useState<THREE.Texture | null>(_sharedCxmiTexture);
    useEffect(() => {
        if (!cxmiTexture) getCxmiTexture(setCxmiTexture);
    }, []);
    const screenRef = useRef<THREE.Mesh>(null);
    const glowRingRef = useRef<THREE.Mesh>(null);
    const electricRingRef = useRef<THREE.Group>(null);
    const deskMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const dimFactorRef = useRef(isDimmed ? 1 : 0);

    // Random phase offset (stable)
    const phaseOffset = useMemo(() => Math.random() * Math.PI * 2, []);
    const wavePhaseRef = useRef(phaseOffset); // Sync start

    // Aurora glow color per status
    const auroraColor = useMemo(() => {
        switch (status) {
            case 'oncall': return '#6C4BF5';
            case 'ring': return '#facc15';
            case 'available': return '#67e8f9';
            case 'offline': return '#334155';
            default: return '#fbbf24';
        }
    }, [status]);
    const parsedAuroraColor = useMemo(() => new THREE.Color(auroraColor), [auroraColor]);

    // Electric Ring Points
    const electricRingPoints = useMemo(() => {
        const segments = 64;
        const radius = 0.95;
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
        }
        return pts;
    }, []);

    // Waveform points — use ref for direct mutation, avoid setState in frame loop
    const waveInitPts = useMemo(() => {
        const pts: [number, number, number][] = [];
        for (let i = 0; i < 24; i++) pts.push([(i / 23 - 0.5) * 1.0, 0, 0]);
        return pts;
    }, []);
    const wavePointsRef = useRef(waveInitPts);
    const [wavePoints, setWavePoints] = useState<[number, number, number][]>(wavePointsRef.current);

    // Color constants
    const deskDimmedColor = useMemo(() => new THREE.Color('#1e293b'), []);
    const deskNormalColor = useMemo(() => new THREE.Color('#334155'), []);

    // Search highlight animation refs
    const highlightRingRef = useRef<THREE.Mesh>(null);
    const highlightPulseRef = useRef(0);

    // Fix #5: Cache parsed timestamp to avoid per-frame `new Date()` allocation
    const lastStatusChangeMs = useMemo(() => {
        if (!agent?.lastStatusChange) return 0;
        return new Date(agent.lastStatusChange).getTime();
    }, [agent?.lastStatusChange]);

    // 4. Animation Loop
    const wsFrameCount = useRef(0);
    useFrame((state) => {
        // 未占用的工位无动画需求
        if (!isOccupied && !isHighlighted) {
            // dimming transition 仍需执行
            if (deskMatRef.current) {
                const dimTarget = isDimmed ? 1 : 0;
                dimFactorRef.current = THREE.MathUtils.lerp(dimFactorRef.current, dimTarget, 0.08);
                deskMatRef.current.color.copy(deskNormalColor).lerp(deskDimmedColor, dimFactorRef.current);
            }
            return;
        }

        const time = state.clock.elapsedTime;
        wsFrameCount.current++;
        const isThrottledFrame = wsFrameCount.current % 4 !== 0; // ~15fps for decorative

        // Aurora Glow Ring — ~15fps
        if (!isThrottledFrame && glowRingRef.current && isOccupied && !isDimmed) {
            const mat = glowRingRef.current.material as THREE.MeshBasicMaterial;
            if (status === 'oncall') {
                const callMs = lastStatusChangeMs ? Date.now() - lastStatusChangeMs : 0;
                const callMin = callMs / 60000;
                const durT = Math.min(callMin / 8, 1);
                const breathSpeed = 2 + durT * 3;
                glowRingRef.current.rotation.z = time * 1.0;
                mat.opacity = 0.4 + Math.sin(time * breathSpeed + phaseOffset) * 0.15;
            } else if (status === 'ring') {
                glowRingRef.current.rotation.z = time * 1.0;
                mat.opacity = 0.3 + Math.sin(time * 3 + phaseOffset) * 0.15;
            } else if (status === 'available') {
                glowRingRef.current.rotation.z = time * 0.3;
                mat.opacity = 0.15 + Math.sin(time * 1.2 + phaseOffset) * 0.1;
            } else if (status === 'break') {
                glowRingRef.current.rotation.z = time * 0.2;
                mat.opacity = 0.12 + Math.sin(time * 0.8 + phaseOffset) * 0.08;
            } else if (status === 'wrapup') {
                glowRingRef.current.rotation.z = time * 0.5;
                mat.opacity = 0.2 + Math.sin(time * 2 + phaseOffset) * 0.1;
            }
        }

        // Electric dashed ring rotation — ~15fps
        if (!isThrottledFrame && electricRingRef.current && isOccupied && !isDimmed) {
            const speed = status === 'oncall' ? 1.0 : status === 'ring' ? 1.0 : 0.5;
            electricRingRef.current.rotation.z = -time * speed;
        }

        // Waveform Animation — 继续保持 ~6fps 节流，但用 ref 改写避免 setState
        if (lodLevel >= 2 && isOccupied && !isDimmed && state.clock.getElapsedTime() % 0.16 < 0.02) {
            const count = 24;
            const newPts: [number, number, number][] = [];
            for (let i = 0; i < count; i++) {
                const x = (i / (count - 1) - 0.5) * 1.0;
                let y = 0;
                if (status === 'oncall') {
                    y = Math.sin((x * 6 + time * 3) + wavePhaseRef.current) * 0.06
                        + Math.sin((x * 10 + time * 5) + wavePhaseRef.current * 2) * 0.03;
                } else if (status === 'ring') {
                    y = Math.sin((x * 8 + time * 4) + phaseOffset) * 0.05;
                } else if (status === 'available') {
                    y = Math.sin((x * 4 + time * 1.5) + wavePhaseRef.current) * 0.03;
                } else if (status === 'wrapup') {
                    y = Math.sin((x * 6 + time * 2) + phaseOffset) * 0.04 * Math.max(0, Math.sin(time * 0.5));
                } else if (status === 'break') {
                    y = Math.sin((x * 3 + time * 0.5) + phaseOffset) * 0.015;
                }
                newPts.push(is2D ? [x, 0, y] : [x, y, 0]);
            }
            setWavePoints(newPts);
        }

        // Screen Pulse — ~15fps
        if (!isThrottledFrame && screenRef.current) {
            const material = screenRef.current.material as THREE.MeshPhysicalMaterial;
            if (material) {
                material.emissiveIntensity = 0.8 + Math.sin(time * 2) * 0.4;
            }
        }

        // Dimming transition
        const dimTarget = isDimmed ? 1 : 0;
        dimFactorRef.current = THREE.MathUtils.lerp(dimFactorRef.current, dimTarget, 0.08);
        if (deskMatRef.current) {
            deskMatRef.current.color.copy(deskNormalColor).lerp(deskDimmedColor, dimFactorRef.current);
        }

        // Search highlight beacon animation
        if (highlightRingRef.current) {
            if (isHighlighted) {
                highlightPulseRef.current = (highlightPulseRef.current + 0.02) % 1;
                const p = highlightPulseRef.current;
                const scale = 1.0 + p * 0.8;
                highlightRingRef.current.scale.set(scale, scale, 1);
                (highlightRingRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.7;
                highlightRingRef.current.visible = true;
            } else {
                highlightRingRef.current.visible = false;
            }
        }
    });

    return (
        <group
            position={position}
        >
            {/* Search Highlight Beacon */}
            <mesh ref={highlightRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} geometry={GEOM_HIGHLIGHT_RING} visible={false}>
                <meshBasicMaterial color="#38bdf8" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>

            {/* Selection indicator ring */}
            {isSelected && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} geometry={GEOM_SELECTION_RING}>
                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} depthWrite={false} />
                </mesh>
            )}

            {/* Aurora Glow Ring */}
            {isOccupied && !isDimmed && (
                <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                    <mesh ref={glowRingRef} geometry={GEOM_GLOW_RING_OUTER}>
                        <meshBasicMaterial color={auroraColor} transparent opacity={0.25} depthWrite={false} />
                    </mesh>
                    <mesh geometry={GEOM_GLOW_RING_INNER}>
                        <meshBasicMaterial color={auroraColor} transparent opacity={isOnline ? 0.6 : 0.15} depthWrite={false} />
                    </mesh>
                    <group ref={electricRingRef}>
                        <Line points={electricRingPoints} color={auroraColor} lineWidth={1.5} transparent opacity={0.35} dashed dashSize={0.15} gapSize={0.08} />
                    </group>
                </group>
            )}

            {/* Base Platform (Desk) */}
            <mesh position={[0, 0.25, 0]} geometry={GEOM_DESK_BASE}>
                <meshStandardMaterial
                    ref={deskMatRef}
                    color={isDimmed ? '#1e293b' : (isOccupied ? '#334155' : '#1e293b')}
                    metalness={0.8}
                    roughness={0.2}
                    transparent={!isOccupied}
                    opacity={isOccupied ? 1.0 : 0.2}
                />
            </mesh>

            {/* Chair - Only in 3D, LOD >= 2 */}
            {!is2D && lodLevel >= 2 && (
                <group position={[0, 0, 0.4]}>
                    <mesh position={[0, 0.25, 0]} geometry={GEOM_CHAIR_SEAT}>
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    <mesh position={[0, 0.5, 0.18]} rotation={[-0.1, 0, 0]} geometry={GEOM_CHAIR_BACK}>
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                </group>
            )}

            {/* VACANT STATE */}
            {!isOccupied && (
                <>
                    {cxmiTexture && (
                        <Billboard position={[0, 1.2, 0]}>
                            <mesh geometry={GEOM_ICON_PLANE}>
                                <meshBasicMaterial map={cxmiTexture} transparent opacity={isDimmed ? 0.06 : 0.2} depthWrite={false} />
                            </mesh>
                        </Billboard>
                    )}
                    {/* Station label — LOD >= 1 */}
                    {lodLevel >= 1 && (
                        <Billboard position={[0, 0.5, 0.8]}>
                            <React.Suspense fallback={null}>
                                <Text font="/fonts/kenpixel.ttf" fontSize={0.18} color={isDimmed ? '#1e293b' : '#475569'} anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">
                                    {label || 'VACANT'}
                                </Text>
                            </React.Suspense>
                        </Billboard>
                    )}
                </>
            )}

            {/* OCCUPIED STATE */}
            {isOccupied && (
                <group position={[0, 0.55, -0.1]}>
                    {!is2D && lodLevel >= 2 && (
                        <Avatar3D
                            statusColor={statusColor}
                            glowColor={parsedAuroraColor}
                            isActive={isOnline}
                            isDimmed={isDimmed}
                        />
                    )}
                    <AvatarPortrait
                        avatarPath={agent?.avatar || AVATAR_PATHS[avatarIndex]}
                        isDimmed={isDimmed}
                        isOnline={isOnline}
                        copilotOnline={!!agent?.copilotOnline}
                        stressScore={status === 'oncall' ? stressScore : undefined}
                    />

                    {/* Status Ring (Floor) */}
                    {!is2D && isOnline && (
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.54, 0.1]} geometry={GEOM_STATUS_RING}>
                            <meshBasicMaterial color={statusColor} transparent opacity={0.5} />
                        </mesh>
                    )}

                    {/* Holographic Screen — LOD >= 2 */}
                    {isOccupied && !isDimmed && lodLevel >= 2 && (
                        <group
                            position={is2D ? [0, 1.5, 0.8] : [0, 1.8, -0.4]}
                            rotation={is2D ? [-Math.PI / 2, 0, 0] : [-Math.PI / 4, 0, 0]}
                        >
                            {/* Main Screen Glass */}
                            <mesh ref={screenRef} rotation={[0.2, 0, 0]} geometry={GEOM_SCREEN_GLASS}>
                                <meshPhysicalMaterial
                                    color={parsedStatusColor}
                                    transparent
                                    transmission={0.75}
                                    opacity={0.3}
                                    roughness={0.15}
                                    metalness={0.1}
                                    ior={1.5}
                                    thickness={0.05}
                                    emissive={parsedStatusColor}
                                    emissiveIntensity={1.2}
                                    toneMapped={false}
                                    side={THREE.DoubleSide}
                                />
                            </mesh>

                            {/* Wireframe Border */}
                            <mesh rotation={[0.2, 0, 0]} geometry={GEOM_SCREEN_BORDER}>
                                <meshBasicMaterial color={parsedStatusColor} transparent opacity={0.3} wireframe />
                            </mesh>

                            {/* Pulse Waveform */}
                            <group position={[0, 0.0, 0.04]} rotation={[0.2, 0, 0]}>
                                <Line points={wavePoints} color={auroraColor} lineWidth={2} transparent opacity={0.8} />
                            </group>

                            {/* Text on Screen */}
                            <React.Suspense fallback={null}>
                                <group position={[0, 0, 0.06]} rotation={[0.2, 0, 0]}>
                                    {agent?.boundUser?.displayName && (
                                        <Text font={dynamicFont} fontSize={0.25} color="white" anchorX="center" anchorY="middle" position={[0, 0.2, 0]} outlineWidth={0.04} outlineColor="#000000">
                                            {agent.boundUser.displayName}
                                        </Text>
                                    )}
                                    <group position={[0, agent?.boundUser?.displayName ? -0.25 : 0.1, 0]}>
                                        <mesh position={[0, 0, -0.01]} geometry={GEOM_SIP_BG}>
                                            <meshBasicMaterial color="#000000" transparent opacity={0.55} depthWrite={false} />
                                        </mesh>
                                        <Text font="/fonts/RobotoMono-Medium.ttf" fontSize={0.22} color={'#ffffff'} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">
                                            {agent?.sipNumber || ''}
                                        </Text>
                                    </group>
                                    {agent?.duration && (
                                        <Text font="/fonts/RobotoMono-Medium.ttf" fontSize={0.15} color="#e2e8f0" anchorX="center" anchorY="middle" position={[0, -0.25, 0]} outlineWidth={0.02} outlineColor="#000000">
                                            {agent.duration}
                                        </Text>
                                    )}
                                </group>
                            </React.Suspense>

                            {/* Stand */}
                            {!is2D && (
                                <mesh position={[0, -0.45, -0.05]} rotation={[0.1, 0, 0]} geometry={GEOM_SCREEN_STAND}>
                                    <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
                                </mesh>
                            )}
                        </group>
                    )}
                </group>
            )}



            {/* HitBox for consistent interaction */}
            <mesh
                position={[0, 2, 0]}
                onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
                onPointerOver={isOccupied && !isDimmed ? onPointerOver : undefined}
                onPointerOut={isOccupied && !isDimmed ? onPointerOut : undefined}
                geometry={GEOM_HITBOX}
            >
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
        </group>
    );
};

/* ─── React.memo wrapper: avoids re-rendering all ~100 stations when ─── */
/* ─── only one agent's status changes via WebSocket.                  ─── */
function areWorkstationPropsEqual(prev: WorkstationProps, next: WorkstationProps): boolean {
    // Fast-fail on primitives / booleans that change frequently
    if (
        prev.isSelected !== next.isSelected ||
        prev.isDimmed !== next.isDimmed ||
        prev.isHighlighted !== next.isHighlighted ||
        prev.viewMode !== next.viewMode ||
        prev.lodLevel !== next.lodLevel ||
        prev.stressScore !== next.stressScore ||
        prev.isCardLocked !== next.isCardLocked ||
        prev.label !== next.label ||
        prev.avatarIndex !== next.avatarIndex ||
        prev.agentId !== next.agentId ||
        prev.zoneColor !== next.zoneColor
    ) return false;

    // Position tuple (reference may differ but values are same)
    if (
        prev.position[0] !== next.position[0] ||
        prev.position[1] !== next.position[1] ||
        prev.position[2] !== next.position[2]
    ) return false;

    // Agent object: compare only the fields that affect rendering
    const pa = prev.agent;
    const na = next.agent;
    if (pa === na) return true; // same reference or both null
    if (!pa || !na) return false; // one is null
    if (
        pa.status !== na.status ||
        pa.duration !== na.duration ||
        pa.sipNumber !== na.sipNumber ||
        pa.copilotOnline !== na.copilotOnline ||
        pa.avatar !== na.avatar ||
        pa.lastStatusChange !== na.lastStatusChange ||
        pa.boundUser?.displayName !== na.boundUser?.displayName
    ) return false;

    return true;
}

export const Workstation = React.memo(WorkstationInner, areWorkstationPropsEqual);
