import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { HeatmapOverlay } from './3d/effects/HeatmapOverlay';
import { Workstation } from './3d/Workstation';
import { CallConnectionLines } from './3d/effects/CallConnectionLines';
import { ZoneQualityCard, type ZoneQualityData } from './ui/ZoneQualityCard';
import SystemAlertBanner from './ui/SystemAlertBanner';

import { Text, Billboard, Line, Html } from '@react-three/drei';
import { AgentTooltip } from './3d/AgentTooltip';
import * as THREE from 'three';
import { MAP_THEMES, applyThemeToZoneColor } from './theme';
import type { ThemeType } from '../../context/ThemeContext';



// Preload assets to prevent Suspense fallback on floor switch
// Removed useLoader.preload here to avoid whole-scene Suspense locks on slow networks.
// Avatars and icons now load asynchronously inside components.
// Preload font? (FontLoader not explicitly exposed by drei's Text but we can try)
// Actually Text component handles its own loading. We might not be able to preload it easily without FontLoader.
// But avatars are the main dynamic asset.


/* ─────────────────────────── Types ─────────────────────────── */

interface MapCanvas3DProps {
    width: number;
    height: number;
    stations: any[];
    agents: Record<string, any>;
    isEditing: boolean;
    onStationChange: (id: string, newAttrs: any) => void;
    onStationSelect: (id: string | null) => void;
    systemQueueX?: number;
    systemQueueY?: number;
    onSystemQueueChange?: (pos: { x: number; y: number }) => void;
    viewMode?: '2d' | '3d';
    walls?: any[];
    zoom?: number;
    onZoomChange?: (zoom: number) => void;
    zoneDefs?: { name: string; color: string; xMin: number; xMax: number; yMin: number; yMax: number; queueX?: number; queueY?: number }[];
    onZoneChange?: (zoneIndex: number, newAttrs: any) => void;
    callConnections?: { id: string; type: string; agentStationIdx: number; targetStationIdx?: number; zoneIndex: number }[];
    zoneQueues?: { zoneIndex: number; activeCallCount: number; queueCount: number; avgWaitTimeSec: number }[];
    zoneQuality?: ZoneQualityData[];
    extraFloors?: { floorId: string; yOffset: number; stations: any[]; walls: any[]; zoneDefs: any[]; callConnections: any[]; zoneQueues: any[]; zoneQuality?: ZoneQualityData[]; agents: Record<string, any> }[];
    systemQueue?: { queueCount: number; activeCallCount: number; avgWaitTimeSec: number };
    showHeatmap?: boolean;
    filteredStationIds?: Set<string> | null;
    panOffset?: [number, number];
    onPanOffsetChange?: (offset: [number, number]) => void;
    floorId?: string; // Add floorId for stable key
    selectedStationId?: string | null;
    stressMap?: Map<string, { agent_id: string; stress_score: number; ts: number }>;
    systemStats?: { sipErrorRate: number; activeCalls: number } | null;
    lockedCardIds?: Set<string>;
    onToggleLock?: (agentId: string) => void;
    theme?: ThemeType;
}

/* ─────────────── Color Helpers ─────────────── */



/* ─────────────── Shader: Grid Floor ─────────────── */

const gridVertexShader = `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const gridFragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform float uOpacity;
uniform float uCritical;
uniform vec3 uColorBaseNormal;
uniform vec3 uColorGridNormal;
uniform vec3 uColorBaseCritical;
uniform vec3 uColorGridCritical;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
    // Use world position for grid to ensure constant size regardless of floor scale
    vec2 pos = vWorldPos.xz;
    
    // Grid size in world units
    float gridSize = 2.0;
    vec2 grid = fract(pos / gridSize);
    
    // Diamond shape: rotate 45 degrees
    vec2 d = abs(grid - 0.5);
    float diamond = d.x + d.y;
    
    // Grid lines
    float lineWidth = 0.04;
    float line = 1.0 - smoothstep(0.48 - lineWidth, 0.48, diamond);
    line += 1.0 - smoothstep(0.0, lineWidth, diamond);
    line = clamp(line, 0.0, 1.0);
    
    // Radial gradient
    float uvDist = distance(vUv, vec2(0.5));
    float radial = 1.0 - smoothstep(0.0, 0.7, uvDist);
    
    // Base color: lerped from uniforms
    vec3 baseColor = mix(uColorBaseNormal, uColorBaseCritical, uCritical);
    
    // Grid line color: lerped from uniforms
    vec3 gridColor = mix(uColorGridNormal, uColorGridCritical, uCritical);
    
    // Intersection dots with pulse
    vec2 nearest = round(pos / gridSize) * gridSize;
    float dotDist = distance(pos, nearest);
    float dot = 1.0 - smoothstep(0.0, 0.12, dotDist);
    float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + nearest.x * 0.5 + nearest.y * 0.3);
    
    // Compose
    vec3 color = baseColor;
    color += gridColor * line * 0.08;
    color += gridColor * dot * 0.2 * pulse;
    
    // 径向淡出
    gl_FragColor = vec4(color, uOpacity * radial);
}
`;

/* ───────── Render Heartbeat: demand 模式下控制实际渲染频率 ───────── */
const TARGET_FPS = 24;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

const RenderHeartbeat: React.FC = () => {
    const { invalidate } = useThree();
    useEffect(() => {
        const id = setInterval(() => invalidate(), FRAME_INTERVAL);
        return () => clearInterval(id);
    }, [invalidate]);
    return null;
};

/* ─────────────── Floor Grid ─────────────── */

interface FloorGridProps {
    opacity?: number;
    width?: number;
    height?: number;
    isCritical?: boolean;
    theme?: ThemeType;
}

/* ─── Shared Geometries for MapCanvas3D components ─── */
const GEOM_CORNER_SPHERE_LG = new THREE.SphereGeometry(0.1, 8, 8);
const GEOM_CORNER_SPHERE_SM = new THREE.SphereGeometry(0.08, 8, 8);
const GEOM_LABEL_BG = new THREE.PlaneGeometry(3.5, 0.6);
const GEOM_STATUS_DOT = new THREE.CircleGeometry(0.08, 16);
const GEOM_ZONE_PULSE_RING = new THREE.RingGeometry(0.9, 1, 64);

const FloorGrid: React.FC<FloorGridProps> = ({ opacity = 1, width = 2000, height = 2000, isCritical = false, theme = 'dark' }) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const criticalRef = useRef(0); // Smooth transition 0→1
    const tokens = MAP_THEMES[theme];
    const frameCount = useRef(0);
    // 预分配 Vector3 避免每帧 GC
    const _tmpBaseN = useRef(new THREE.Vector3(...tokens.floorBaseNormal));
    const _tmpGridN = useRef(new THREE.Vector3(...tokens.floorGridNormal));
    const _tmpBaseC = useRef(new THREE.Vector3(...tokens.floorBaseCritical));
    const _tmpGridC = useRef(new THREE.Vector3(...tokens.floorGridCritical));

    useFrame(({ clock }) => {
        if (!materialRef.current) return;
        materialRef.current.uniforms.uTime.value = clock.getElapsedTime();

        // theme lerp 降频到 ~15fps, critical lerp 保持每帧
        const target = isCritical ? 1.0 : 0.0;
        criticalRef.current += (target - criticalRef.current) * 0.03;
        materialRef.current.uniforms.uCritical.value = criticalRef.current;

        frameCount.current++;
        if (frameCount.current % 4 !== 0) return;

        const u = materialRef.current.uniforms;
        const lerpSpeed = 0.05;
        _tmpBaseN.current.set(...tokens.floorBaseNormal);
        _tmpGridN.current.set(...tokens.floorGridNormal);
        _tmpBaseC.current.set(...tokens.floorBaseCritical);
        _tmpGridC.current.set(...tokens.floorGridCritical);
        u.uColorBaseNormal.value.lerp(_tmpBaseN.current, lerpSpeed);
        u.uColorGridNormal.value.lerp(_tmpGridN.current, lerpSpeed);
        u.uColorBaseCritical.value.lerp(_tmpBaseC.current, lerpSpeed);
        u.uColorGridCritical.value.lerp(_tmpGridC.current, lerpSpeed);
    });

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1200, 800) },
        uOpacity: { value: opacity * tokens.opacityMultiplier },
        uCritical: { value: 0 },
        uColorBaseNormal: { value: new THREE.Vector3(...tokens.floorBaseNormal) },
        uColorGridNormal: { value: new THREE.Vector3(...tokens.floorGridNormal) },
        uColorBaseCritical: { value: new THREE.Vector3(...tokens.floorBaseCritical) },
        uColorGridCritical: { value: new THREE.Vector3(...tokens.floorGridCritical) },
    }), []); // Init only, lerped in useFrame

    return (
        <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.01, 0]}
            scale={[width / 40, height / 40, 1]}
        >
            <planeGeometry args={[1, 1, 1, 1]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={gridVertexShader}
                fragmentShader={gridFragmentShader}
                uniforms={uniforms}
                side={THREE.DoubleSide}
                transparent={opacity < 1}
            />
        </mesh>
    );
};

/* ─────────────── Zone Pulse (ringing-driven) ─────────────── */

interface ZonePulseProps {
    center: [number, number, number];
    ringingCount: number;
    color: string;
    maxRadius?: number;
    theme?: ThemeType;
}

const ZonePulse: React.FC<ZonePulseProps> = ({ center, ringingCount, color, maxRadius = 5, theme = 'dark' }) => {
    const ringsRef = useRef<THREE.Group>(null);
    const ringCount = Math.min(ringingCount, 4); // max 4 rings
    const parsedColor = useMemo(() => applyThemeToZoneColor(color, theme), [color, theme]);

    // Speed scales with ringing count: 0 = no pulse, 1 = slow, 4 = fast
    const speed = ringingCount === 0 ? 0 : 0.2 + ringingCount * 0.15;

    useFrame(({ clock }) => {
        if (!ringsRef.current || ringingCount === 0) return;
        const t = clock.getElapsedTime();
        ringsRef.current.children.forEach((child, i) => {
            const mesh = child as THREE.Mesh;
            const phase = (t * speed + i * (1.0 / Math.max(ringCount, 1))) % 1.0;
            const scale = phase * maxRadius;
            mesh.scale.set(scale, scale, 1);
            (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.2;
            mesh.visible = i < ringCount;
        });
    });

    if (ringingCount === 0) return null;

    return (
        <group rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0.02, center[2]]}>
            <group ref={ringsRef}>
                {[0, 1, 2, 3].map(i => (
                    <mesh key={i} visible={i < ringCount} geometry={GEOM_ZONE_PULSE_RING}>
                        <meshBasicMaterial color={parsedColor} transparent depthWrite={false} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

/* ─────────────── Glass Wall ─────────────── */

interface GlassWallProps {
    start: [number, number];
    end: [number, number];
    height?: number;
    color?: string;
    label?: string;
    active?: boolean;
    alertLevel?: 'normal' | 'warning' | 'critical';
    theme?: ThemeType;
}

const GlassWallInner: React.FC<GlassWallProps> = ({ start, end, height = 2, color = '#06b6d4', label, active = true, alertLevel = 'normal', theme = 'dark' }) => {
    const scanRef = useRef<THREE.Mesh>(null);
    const wallRef = useRef<THREE.Mesh>(null);

    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    const cx = (start[0] + end[0]) / 2;
    const cz = (start[1] + end[1]) / 2;

    // Opacity multiplier based on active state
    const dim = active ? 1.0 : 0.2;
    const tokens = MAP_THEMES[theme];

    const baseColor = useMemo(() => applyThemeToZoneColor(color, theme), [color, theme]);
    const warningColor = useMemo(() => new THREE.Color('#eab308'), []);
    const criticalColor = useMemo(() => new THREE.Color('#ef4444'), []);
    // inactive颜色跟楼层底色一致才不穿帮
    const inactiveColor = useMemo(() => new THREE.Color(...tokens.floorBaseNormal), [theme]);

    // Scan line animation (only when active)
    const wallFrameCount = useRef(0);
    useFrame(({ clock }) => {
        // inactive + normal 无动画需求
        if (!active && alertLevel === 'normal') return;

        const time = clock.getElapsedTime();

        // 1. Scan Line Animation
        if (scanRef.current) {
            if (active) {
                const speed = alertLevel === 'critical' ? 1.5 : alertLevel === 'warning' ? 1.0 : 0.5;
                const t = (time * speed) % 1;
                scanRef.current.position.y = -height / 2 + t * height;
                (scanRef.current.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - Math.abs(t - 0.5) * 2);
            } else {
                (scanRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
            }
        }

        // normal 模式节流到 ~15fps
        wallFrameCount.current++;
        if (alertLevel === 'normal' && wallFrameCount.current % 4 !== 0) return;

        // 2. Wall Pulse Animation (Alerts)
        if (wallRef.current) {
            const mat = wallRef.current.material as THREE.MeshPhysicalMaterial;
            const mult = tokens.emissiveIntensityMultiplier;
            if (alertLevel === 'critical') {
                const pulse = (Math.sin(time * 8) + 1) / 2;
                mat.color.lerpColors(baseColor, criticalColor, 0.6 + 0.4 * pulse);
                mat.emissive.lerpColors(baseColor, criticalColor, 0.8);
                mat.emissiveIntensity = (0.5 + 0.5 * pulse) * mult;
            } else if (alertLevel === 'warning') {
                const pulse = (Math.sin(time * 4) + 1) / 2;
                mat.color.lerpColors(baseColor, warningColor, 0.3 + 0.3 * pulse);
                mat.emissive.lerpColors(baseColor, warningColor, 0.5);
                mat.emissiveIntensity = (0.3 + 0.3 * pulse) * mult;
            } else {
                mat.color.lerp(baseColor, 0.1);
                mat.emissive.lerp(baseColor, 0.1);
                mat.emissiveIntensity = (active ? 0.15 : 0.03) * mult;
            }
        }
    });

    return (
        <group position={[cx, height / 2, cz]} rotation={[0, -angle, 0]}>
            {/* Frosted Glass Panel */}
            <mesh ref={wallRef} raycast={() => null}>
                <boxGeometry args={[length, height, 0.08]} />
                <meshPhysicalMaterial
                    color={baseColor}
                    transparent
                    opacity={(0.15 * dim) * tokens.opacityMultiplier}
                    roughness={0.2}
                    metalness={0.1}
                    emissive={baseColor}
                    emissiveIntensity={(active ? 0.15 : 0.03) * tokens.emissiveIntensityMultiplier}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Horizontal scan lines (static texture) */}
            {[...Array(8)].map((_, i) => (
                <mesh key={i} position={[0, -height / 2 + (i + 1) * height / 9, 0.05]}>
                    <planeGeometry args={[length, 0.02]} />
                    <meshBasicMaterial color={baseColor} transparent opacity={0.15 * dim} depthWrite={false} />
                </mesh>
            ))}

            {/* Animated vertical scan bar */}
            <mesh ref={scanRef} position={[0, 0, 0.06]} raycast={() => null}>
                <planeGeometry args={[length, 0.15]} />
                <meshBasicMaterial color={baseColor} transparent opacity={0.3} depthWrite={false} />
            </mesh>

            {/* Top edge glow */}
            <mesh position={[0, height / 2, 0]}>
                <boxGeometry args={[length, 0.06, 0.12]} />
                <meshBasicMaterial color={baseColor} transparent opacity={0.8 * dim} />
            </mesh>

            {/* Bottom edge glow */}
            <mesh position={[0, -height / 2, 0]}>
                <boxGeometry args={[length, 0.06, 0.12]} />
                <meshBasicMaterial color={baseColor} transparent opacity={0.9 * dim} />
            </mesh>

            {/* Corner connectors */}
            <mesh position={[-length / 2, -height / 2, 0]} geometry={GEOM_CORNER_SPHERE_LG}>
                <meshBasicMaterial color={baseColor} />
            </mesh>
            <mesh position={[length / 2, -height / 2, 0]} geometry={GEOM_CORNER_SPHERE_LG}>
                <meshBasicMaterial color={baseColor} />
            </mesh>
            <mesh position={[-length / 2, height / 2, 0]} geometry={GEOM_CORNER_SPHERE_SM}>
                <meshBasicMaterial color={baseColor} transparent opacity={0.7} />
            </mesh>
            <mesh position={[length / 2, height / 2, 0]} geometry={GEOM_CORNER_SPHERE_SM}>
                <meshBasicMaterial color={baseColor} transparent opacity={0.7} />
            </mesh>

            {/* Zone Label — lit when active, dim when inactive */}
            {label && (
                <Billboard position={[0, height / 2 + 0.5, 0]}>
                    {/* Label background */}
                    <mesh geometry={GEOM_LABEL_BG}>
                        <meshBasicMaterial
                            color={active ? baseColor : inactiveColor}
                            transparent
                            opacity={active ? 0.75 : 0.4}
                        />
                    </mesh>
                    {/* Status indicator dot */}
                    <mesh position={[-1.5, 0, 0.02]} geometry={GEOM_STATUS_DOT}>
                        <meshBasicMaterial
                            color={active ? '#22c55e' : '#4b5563'}
                        />
                    </mesh>
                    {/* Label text */}
                    <React.Suspense fallback={null}>
                        <Text
                            font="/fonts/kenpixel.ttf"
                            position={[0.05, 0, 0.01]}
                            fontSize={0.35}
                            color={active ? '#ffffff' : '#9ca3af'}
                            anchorX="center"
                            anchorY="middle"
                        >
                            {label}
                        </Text>
                    </React.Suspense>
                </Billboard>
            )}
        </group>
    );
};

function areGlassWallPropsEqual(prev: GlassWallProps, next: GlassWallProps): boolean {
    return (
        prev.start[0] === next.start[0] &&
        prev.start[1] === next.start[1] &&
        prev.end[0] === next.end[0] &&
        prev.end[1] === next.end[1] &&
        prev.height === next.height &&
        prev.color === next.color &&
        prev.label === next.label &&
        prev.active === next.active &&
        prev.alertLevel === next.alertLevel &&
        prev.theme === next.theme
    );
}

const GlassWall = React.memo(GlassWallInner, areGlassWallPropsEqual);



interface ZoneSummaryBarProps {
    position: [number, number, number]; // world position at zone bottom edge
    onlineCount: number;
    totalCount: number;
    color: string;
    width: number; // world units width of zone
}

const ZoneSummaryBar: React.FC<ZoneSummaryBarProps> = ({ position, onlineCount, totalCount, color }) => {
    const statusColor = onlineCount === 0 ? '#6b7280' : onlineCount >= totalCount * 0.8 ? '#22c55e' : '#eab308';


    return (
        <Billboard position={position}>
            {/* Background bar */}
            <mesh>
                <planeGeometry args={[4.5, 0.45]} />
                <meshBasicMaterial color="#0a0a1a" transparent opacity={0.75} depthWrite={false} />
            </mesh>
            {/* Status dot */}
            <mesh position={[-1.8, 0, 0.01]}>
                <circleGeometry args={[0.08, 12]} />
                <meshBasicMaterial color={statusColor} />
            </mesh>
            {/* Summary text */}
            <React.Suspense fallback={null}>
                <Text
                    font="/fonts/kenpixel.ttf"
                    position={[0.2, 0, 0.01]}
                    fontSize={0.22}
                    color={color}
                    anchorX="center"
                    anchorY="middle"
                >
                    {`${onlineCount} online · ${totalCount} seats`}
                </Text>
            </React.Suspense>
        </Billboard>
    );
};

/* ─────────────── 3D Avatar (seated agent) ─────────────── */



/* ─────────────── Workstation ─────────────── */





/* ─────────────── Call Connection Lines ─────────────── */





/* ─────────────── Particle Field ─────────────── */

const ParticleField: React.FC<{ theme?: ThemeType }> = ({ theme = 'dark' }) => {
    const pointsRef = useRef<THREE.Points>(null);
    const count = 400;
    const tokens = MAP_THEMES[theme];

    // Velocities for horizontal drift per particle
    const velocities = useMemo(() => {
        const vel = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            vel[i * 3] = (Math.random() - 0.3) * 0.008; // mostly rightward
            vel[i * 3 + 1] = Math.random() * 0.002 + 0.001; // slow upward
            vel[i * 3 + 2] = (Math.random() - 0.5) * 0.003; // subtle z drift
        }
        return vel;
    }, []);

    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 30;
            pos[i * 3 + 1] = Math.random() * 5;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
        }
        return pos;
    }, []);

    const particleFrame = useRef(0);
    useFrame(() => {
        // 粒子漂移降频到 ~30fps
        particleFrame.current++;
        if (particleFrame.current % 2 !== 0) return;
        if (!pointsRef.current) return;
        const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        for (let i = 0; i < count; i++) {
            arr[i * 3] += velocities[i * 3] * 2; // compensation for half update rate
            arr[i * 3 + 1] += velocities[i * 3 + 1] * 2;
            arr[i * 3 + 2] += velocities[i * 3 + 2] * 2;
            if (arr[i * 3] > 15) arr[i * 3] = -15;
            if (arr[i * 3] < -15) arr[i * 3] = 15;
            if (arr[i * 3 + 1] > 5) arr[i * 3 + 1] = 0;
            if (arr[i * 3 + 2] > 10) arr[i * 3 + 2] = -10;
            if (arr[i * 3 + 2] < -10) arr[i * 3 + 2] = 10;
        }
        posAttr.needsUpdate = true;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[positions, 3]}
                />
            </bufferGeometry>
            <pointsMaterial
                color={tokens.particleColor}
                size={0.04}
                transparent
                opacity={0.35}
                depthWrite={false}
                sizeAttenuation
            />
        </points>
    );
};


/* ─────────────── HUD Overlays in 3D ─────────────── */

const HUDLabels: React.FC = () => {
    return null;
};

/* ─────────────── Camera Controller ─────────────── */

/* ─── PanHandler ─── invisible plane that catches pointer events via R3F raycasting */
const PanHandler: React.FC<{
    viewMode: '2d' | '3d';
    zoom: number;
    onPan: (dx: number, dz: number) => void;
}> = ({ viewMode, zoom, onPan }) => {
    const { gl } = useThree();
    const isPanning = useRef(false);
    const lastPos = useRef<[number, number]>([0, 0]);
    // Use refs to avoid stale closures in event handlers
    const viewModeRef = useRef(viewMode);
    const zoomRef = useRef(zoom);
    const onPanRef = useRef(onPan);
    viewModeRef.current = viewMode;
    zoomRef.current = zoom;
    onPanRef.current = onPan;

    // Set default cursor to 'grab'
    useEffect(() => {
        gl.domElement.style.cursor = 'grab';
        return () => { gl.domElement.style.cursor = ''; };
    }, [gl]);

    const handlePointerDown = useCallback((e: any) => {
        e.stopPropagation();
        isPanning.current = true;
        lastPos.current = [e.clientX, e.clientY];
        gl.domElement.style.cursor = 'grabbing';
        (e.nativeEvent?.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent?.pointerId);
    }, [gl]);

    const handlePointerMove = useCallback((e: any) => {
        if (!isPanning.current) return;
        e.stopPropagation();
        const dx = e.clientX - lastPos.current[0];
        const dy = e.clientY - lastPos.current[1];
        lastPos.current = [e.clientX, e.clientY];

        const scale = 40 / zoomRef.current;

        if (viewModeRef.current === '2d') {
            onPanRef.current(-dx * 0.02 * scale, -dy * 0.02 * scale);
        } else {
            onPanRef.current(
                -(dx + dy) * 0.01 * scale,
                -(-dx + dy) * 0.01 * scale,
            );
        }
    }, []);

    const handlePointerUp = useCallback((e: any) => {
        if (isPanning.current) {
            e.stopPropagation();
            isPanning.current = false;
            gl.domElement.style.cursor = 'grab';
            (e.nativeEvent?.target as HTMLElement)?.releasePointerCapture?.(e.nativeEvent?.pointerId);
        }
    }, [gl]);

    return (
        <mesh
            position={[0, -0.5, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <planeGeometry args={[200, 200]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
    );
};

/* ─── CameraController ─── positions camera based on viewMode, zoom, panOffset */
const CameraController: React.FC<{
    viewMode: '2d' | '3d';
    zoom: number;
    panOffset: [number, number];
}> = ({ viewMode, zoom, panOffset }) => {
    const { camera } = useThree();
    const isFirstMount = useRef(true);

    // Target position/lookAt for smooth interpolation
    const target = useRef({
        x: 0, y: 15, z: 0,
        lx: 0, ly: 0, lz: 0,
    });

    // Lerp speed: fast enough to feel responsive, slow enough to see transition
    const LERP_SPEED = 0.07;
    // Faster lerp during mode transitions for snappier feel
    const TRANSITION_LERP_SPEED = 0.06;
    const viewModeRef = useRef(viewMode);
    const prevViewModeRef = useRef(viewMode);
    // Track whether a mode transition is in progress
    const isTransitioning = useRef(false);
    viewModeRef.current = viewMode;

    // Update targets when viewMode or panOffset changes
    useEffect(() => {
        const [px, pz] = panOffset;
        if (viewMode === '3d') {
            target.current = {
                x: 10 + px, y: 10, z: 10 + pz,
                lx: px, ly: 0, lz: pz,
            };
        } else {
            target.current = {
                x: px, y: 15, z: pz + 0.001, // tiny offset avoids gimbal lock
                lx: px, ly: 0, lz: pz,
            };
        }

        // Detect mode switch → start transition
        if (viewMode !== prevViewModeRef.current) {
            isTransitioning.current = true;
            prevViewModeRef.current = viewMode;
        }

        // On first mount, snap immediately (no transition on page load)
        if (isFirstMount.current) {
            const t = target.current;
            camera.position.set(t.x, t.y, t.z);
            camera.lookAt(t.lx, t.ly, t.lz);
            if (viewMode === '2d') {
                camera.rotation.set(-Math.PI / 2, 0, 0);
            }
            isFirstMount.current = false;
        }
        // Reset stable flag so useFrame processes the new target
        isStable.current = false;
    }, [viewMode, panOffset]);

    // Smooth lerp — skip when camera fully stable
    const isStable = useRef(false);
    useFrame(() => {
        const oc = camera as THREE.OrthographicCamera;
        const t = target.current;
        const is2D = viewModeRef.current === '2d';
        const zoomDiff = Math.abs(oc.zoom - zoom);

        if (isTransitioning.current) {
            isStable.current = false;
            const s = TRANSITION_LERP_SPEED;
            camera.position.x = THREE.MathUtils.lerp(camera.position.x, t.x, s);
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, t.y, s);
            camera.position.z = THREE.MathUtils.lerp(camera.position.z, t.z, s);
            camera.lookAt(t.lx, t.ly, t.lz);

            const dx = Math.abs(camera.position.x - t.x);
            const dy = Math.abs(camera.position.y - t.y);
            const dz = Math.abs(camera.position.z - t.z);
            if (dx < 0.05 && dy < 0.05 && dz < 0.05) {
                isTransitioning.current = false;
                camera.position.set(t.x, t.y, t.z);
                camera.lookAt(t.lx, t.ly, t.lz);
            }
        } else if (is2D) {
            // 2D 稳态下检测是否已收敛
            if (isStable.current && zoomDiff < 0.1) return;
            camera.position.set(t.x, t.y, t.z);
            camera.lookAt(camera.position.x, 0, camera.position.z);
        } else {
            // 3D 稳态检测
            const posDiff = Math.abs(camera.position.x - t.x) + Math.abs(camera.position.y - t.y) + Math.abs(camera.position.z - t.z);
            if (isStable.current && posDiff < 0.02 && zoomDiff < 0.1) return;
            isStable.current = false;
            const s = LERP_SPEED;
            camera.position.x = THREE.MathUtils.lerp(camera.position.x, t.x, s);
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, t.y, s);
            camera.position.z = THREE.MathUtils.lerp(camera.position.z, t.z, s);
            camera.lookAt(t.lx, t.ly, t.lz);
        }

        // Smooth zoom — mark stable once converged
        if (zoomDiff > 0.1) {
            oc.zoom = THREE.MathUtils.lerp(oc.zoom, zoom, 0.05);
            oc.updateProjectionMatrix();
            isStable.current = false;
        } else if (!isStable.current) {
            oc.zoom = zoom;
            oc.updateProjectionMatrix();
            isStable.current = true;
        }
    });

    return null;
};

/* ─────────────── Main Scene ─────────────── */

interface SceneProps {
    stations: any[];
    agents: Record<string, any>;
    walls: any[];
    viewMode: '2d' | '3d';
    onStationSelect: (id: string | null) => void;
    zoom: number;
    zoneDefs?: { name: string; color: string; xMin: number; xMax: number; yMin: number; yMax: number }[];
    panOffset: [number, number];
    callConnections?: { id: string; type: string; agentStationIdx: number; targetStationIdx?: number; zoneIndex: number }[];
    zoneQueues?: { zoneIndex: number; activeCallCount: number; queueCount: number; avgWaitTimeSec: number }[];
    zoneQuality?: ZoneQualityData[];
    extraFloors?: { floorId: string; yOffset: number; stations: any[]; walls: any[]; zoneDefs: any[]; callConnections: any[]; zoneQueues: any[]; zoneQuality?: ZoneQualityData[]; agents: Record<string, any> }[];
    systemQueue?: { queueCount: number; activeCallCount: number; avgWaitTimeSec: number };
    showHeatmap?: boolean;
    filteredStationIds?: Set<string> | null;
    onAutoPan?: (x: number, z: number) => void;
    onPanDelta?: (dx: number, dz: number) => void;
    systemQueueX?: number;
    systemQueueY?: number;
    onSystemQueueChange?: (pos: { x: number; y: number }) => void;
    onZoomToZone?: (cx: number, cz: number, zoom: number) => void;
    stressMap?: Map<string, { agent_id: string; stress_score: number; ts: number }>;
    isCritical?: boolean;
    lockedCardIds?: Set<string>;
    onToggleLock?: (agentId: string) => void;
}

interface ExtraFloorLayerProps {
    floorId: string;
    yOffset: number;
    stations: any[];
    agents: Record<string, any>;
    zoneDefs: { name: string; color: string; xMin: number; xMax: number; yMin: number; yMax: number }[];
    callConnections: any[];
    zoneQueues: any[];
    zoneQuality?: ZoneQualityData[];
    isBottom: boolean;
    filteredStationIds?: Set<string> | null;
    stressMap?: Map<string, { agent_id: string; stress_score: number; ts: number }>;
    lockedCardIds?: Set<string>;
    onToggleLock?: (agentId: string) => void;
    onHoverStation?: (agentId: string | null) => void;
    lodLevel?: number;
}

// ... SystemQueueIndicator (unchanged) ...
const SystemQueueIndicator: React.FC<{ position: [number, number, number]; queueCount: number; avgWaitTimeSec: number }> = ({ position, queueCount, avgWaitTimeSec }) => {
    // Agitation animation based on wait time
    const groupRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        if (!groupRef.current || avgWaitTimeSec <= 30) return;
        const time = state.clock.getElapsedTime();

        if (avgWaitTimeSec > 300) {
            groupRef.current.position.x = position[0] + Math.sin(time * 50) * 0.05;
            groupRef.current.rotation.z = Math.sin(time * 30) * 0.05;
        } else if (avgWaitTimeSec > 120) {
            groupRef.current.position.y = position[1] + Math.sin(time * 10) * 0.1;
            groupRef.current.rotation.z = Math.sin(time * 5) * 0.02;
        } else {
            groupRef.current.position.y = position[1] + Math.sin(time * 2) * 0.05;
        }
    });

    const color = avgWaitTimeSec > 300 ? '#ef4444' : avgWaitTimeSec > 120 ? '#f97316' : avgWaitTimeSec > 30 ? '#eab308' : '#22c55e';

    return (
        <group ref={groupRef} position={position}>
            <Billboard>
                <mesh>
                    <circleGeometry args={[1.2, 32]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.9} />
                </mesh>
                <React.Suspense fallback={null}>
                    <Text font="/fonts/kenpixel.ttf" position={[0, 0.4, 0.1]} fontSize={0.7} color="white" fontWeight="bold" anchorX="center" anchorY="middle">
                        {queueCount}
                    </Text>
                    <Text font="/fonts/kenpixel.ttf" position={[0, -0.4, 0.1]} fontSize={0.25} color="white" anchorX="center" anchorY="middle">
                        WAITING
                    </Text>
                </React.Suspense>
            </Billboard>
        </group>
    );
};


const ExtraFloorLayer: React.FC<ExtraFloorLayerProps & { viewMode?: '2d' | '3d' }> = ({ floorId, yOffset, stations, agents, zoneDefs, callConnections, zoneQuality, isBottom, filteredStationIds = null, viewMode, stressMap, lockedCardIds, onToggleLock, onHoverStation, lodLevel = 2 }) => {
    // Compute layout center for this floor
    const layoutCenter = useMemo(() => {
        const allX = zoneDefs.flatMap(z => [z.xMin, z.xMax]);
        const allY = zoneDefs.flatMap(z => [z.yMin, z.yMax]);
        return {
            cx: (Math.min(...allX) + Math.max(...allX)) / 2,
            cy: (Math.min(...allY) + Math.max(...allY)) / 2,
        };
    }, [zoneDefs]);

    const mapCoord = (px: number, py: number): [number, number, number] => {
        return [(px - layoutCenter.cx) / 40, 0, (py - layoutCenter.cy) / 40];
    };

    const zoneWalls = useMemo(() => zoneDefs.map(z => {
        const x1 = (z.xMin - layoutCenter.cx) / 40;
        const x2 = (z.xMax - layoutCenter.cx) / 40;
        const z1 = (z.yMin - layoutCenter.cy) / 40;
        const z2 = (z.yMax - layoutCenter.cy) / 40;
        return [
            { start: [x1, 0, z1] as [number, number, number], end: [x2, 0, z1] as [number, number, number] },
            { start: [x2, 0, z1] as [number, number, number], end: [x2, 0, z2] as [number, number, number] },
            { start: [x2, 0, z2] as [number, number, number], end: [x1, 0, z2] as [number, number, number] },
            { start: [x1, 0, z2] as [number, number, number], end: [x1, 0, z1] as [number, number, number] },
        ];
    }), [zoneDefs, layoutCenter]);



    // Use solid material if bottom-most, otherwise transparent


    const is2D = viewMode === '2d';
    return (
        <group position={is2D ? [0, 0, yOffset] : [0, yOffset, 0]}>
            {/* Floor label */}
            <Billboard position={[0, 2, -8]}>
                <React.Suspense fallback={null}>
                    <Text font="/fonts/kenpixel.ttf" fontSize={0.5} color="#94a3b8" anchorX="center" anchorY="middle" fontWeight={700}>
                        {floorId}
                    </Text>
                </React.Suspense>
            </Billboard>

            {/* Floor plane (opaque if bottom or 2D, transparent if stacked in 3D). Note: FloorGrid shader also uses white base. */}
            <FloorGrid opacity={is2D || isBottom ? 1 : 0.4} />

            {/* Zone walls (semi-transparent) */}
            {zoneWalls.map((walls, zi) => (
                <group key={`ew-${floorId}-${zi}`}>
                    {walls.map((w, wi) => (
                        <Line
                            key={`ewl-${zi}-${wi}`}
                            points={[w.start, w.end]}
                            color={zoneDefs[zi].color}
                            lineWidth={1.5}
                            transparent
                            opacity={0.3}
                        />
                    ))}
                    {/* Zone label */}
                    <Billboard position={[
                        (zoneDefs[zi].xMin + zoneDefs[zi].xMax) / 2 - layoutCenter.cx,
                        1.5,
                        (zoneDefs[zi].yMin - layoutCenter.cy) / 40 - 0.3
                    ].map((v, i) => i === 0 ? v / 40 : v) as [number, number, number]}>
                        <React.Suspense fallback={null}>
                            <Text font="/fonts/kenpixel.ttf" fontSize={0.18} color={zoneDefs[zi].color} anchorX="center" anchorY="middle" fontWeight={700}>
                                {zoneDefs[zi].name}
                            </Text>
                        </React.Suspense>
                    </Billboard>
                    {/* Zone Quality Card */}
                    {(() => {
                        const qd = zoneQuality?.find(q => q.zoneIndex === zi);
                        if (!qd) return null;
                        const qcx = (zoneDefs[zi].xMin + zoneDefs[zi].xMax) / 2 - layoutCenter.cx;
                        const qcBottomY = (zoneDefs[zi].yMax - layoutCenter.cy) / 40;
                        const qcW = (zoneDefs[zi].xMax - zoneDefs[zi].xMin) / 40;
                        return <ZoneQualityCard key={`zqc-${floorId}-${zi}`} position={[qcx / 40, 0.3, qcBottomY - 0.5]} data={qd} zoneColor={zoneDefs[zi].color} width={qcW} />;
                    })()}
                </group>
            ))}

            {/* Workstations */}
            {stations.map((s, i) => {
                const pos = mapCoord(s.x, s.y);
                const isDimmed = filteredStationIds ? !filteredStationIds.has(s.id) : false;
                return (
                    <ErrorBoundary key={s.id} fallback={null}>
                        <React.Suspense fallback={null}>
                            <Workstation
                                position={pos}
                                agent={s.agentId ? agents[s.agentId] : null}
                                isSelected={false}
                                onClick={() => { }}
                                zoneColor={zoneDefs?.find((z: any) =>
                                    s.x >= z.xMin && s.x <= z.xMax &&
                                    s.y >= z.yMin && s.y <= z.yMax
                                )?.color || '#334155'}
                                label={s.label || s.id}
                                avatarIndex={i}
                                isDimmed={isDimmed}
                                isHighlighted={!!filteredStationIds && filteredStationIds.has(s.id)}
                                lodLevel={lodLevel}
                                viewMode={viewMode || '3d'}
                                stressScore={s.agentId && stressMap?.get(s.agentId)?.stress_score}
                                isCardLocked={s.agentId ? lockedCardIds?.has(s.agentId) : false}
                                onToggleLock={s.agentId ? () => onToggleLock?.(s.agentId) : undefined}
                                agentId={s.agentId}
                                onHover={onHoverStation}
                            />
                        </React.Suspense>
                    </ErrorBoundary>
                );
            })}



            {/* Connection Lines (Agent-Agent ONLY) */}
            <CallConnectionLines
                stations={stations}
                connections={callConnections.filter(c => c.type === 'agent-agent')}
                zoneDefs={zoneDefs}
                mapCoord={mapCoord}

            />
        </group>
    );
};

const Scene: React.FC<SceneProps & { isEditing?: boolean; onStationChange?: (id: string, newAttrs: any) => void; selectedStationId?: string | null; onZoneChange?: (zoneIndex: number, newAttrs: any) => void; onSystemQueueChange?: (pos: { x: number; y: number }) => void }> = ({
    stations, agents, walls: _walls, viewMode, onStationSelect, zoom, zoneDefs: zoneDefsProp, panOffset,
    callConnections = [], extraFloors = [], systemQueue, zoneQueues, zoneQuality, showHeatmap = false, filteredStationIds = null,
    onAutoPan, onPanDelta, isEditing, onStationChange, selectedStationId, onZoneChange, systemQueueX, systemQueueY, onSystemQueueChange,
    onZoomToZone, stressMap, isCritical = false, lockedCardIds, onToggleLock
}) => {

    // LOD: 0=far (avatar only), 1=mid (+name), 2=near (full detail)
    // zoom range: 10–120 (default 35 = 100%)
    const lodLevel = zoom > 25 ? 2 : zoom > 15 ? 1 : 0;

    type ZoneDef = { name: string; color: string; xMin: number; xMax: number; yMin: number; yMax: number };

    const DEFAULT_ZONE_DEFS: ZoneDef[] = [
        { name: 'ZONE A // SALES', color: '#67e8f9', xMin: 50, xMax: 250, yMin: 50, yMax: 350 },
        { name: 'ZONE B // SUPPORT', color: '#c4b5fd', xMin: 290, xMax: 490, yMin: 50, yMax: 350 },
        { name: 'ZONE C // VIP', color: '#fbbf24', xMin: 530, xMax: 730, yMin: 50, yMax: 350 },
        { name: 'ZONE D // TECH', color: '#34d399', xMin: 50, xMax: 250, yMin: 400, yMax: 700 },
        { name: 'ZONE E // OPS', color: '#f472b6', xMin: 290, xMax: 730, yMin: 400, yMax: 700 },
    ];

    const ZONE_DEFS: ZoneDef[] = useMemo(() => zoneDefsProp || DEFAULT_ZONE_DEFS, [zoneDefsProp]);

    // DRAG STATE
    type DragType = 'station' | 'queue' | 'systemQueue';
    const [dragState, setDragState] = useState<{
        type: DragType;
        id: string; // stationId or zoneIndex string or 'system'
        startX: number;
        startZ: number;
        originalX: number;
        originalY: number;
        currentX: number;
        currentY: number
    } | null>(null);

    const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isTooltipHoveredRef = useRef(false);


    const handleStationHover = useCallback((id: string | null) => {
        if (id) {
            // ENTER STATION: Clear any pending close timer immediately
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            setHoveredAgentId(id);
        } else {
            // LEAVE STATION: 
            // Only schedule close if we are NOT hovering the tooltip!
            // The station's onPointerOut delay might fire AFTER we entered the tooltip.
            if (isTooltipHoveredRef.current) return;

            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = setTimeout(() => {
                setHoveredAgentId(prev => (prev && lockedCardIds?.has(prev)) ? prev : null);
            }, 300);
        }
    }, [lockedCardIds]);

    const handleTooltipEnter = useCallback(() => {
        // ENTER TOOLTIP
        isTooltipHoveredRef.current = true;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    }, []);

    const handleTooltipLeave = useCallback(() => {
        // LEAVE TOOLTIP
        isTooltipHoveredRef.current = false;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            setHoveredAgentId(prev => (prev && lockedCardIds?.has(prev)) ? prev : null);
        }, 300);
    }, [lockedCardIds]);

    const handlePointerDown = useCallback((e: any, stationId: string, originalX: number, originalY: number) => {
        if (!isEditing || viewMode !== '2d') return;
        e.stopPropagation();
        setDragState({
            type: 'station',
            id: stationId,
            startX: e.point.x,
            startZ: e.point.z,
            originalX,
            originalY,
            currentX: originalX,
            currentY: originalY
        });
    }, [isEditing, viewMode]);

    const handleSystemQueueDrag = useCallback((e: any, originalX: number, originalY: number) => {
        if (!isEditing || viewMode !== '2d') return;
        e.stopPropagation();
        setDragState({
            type: 'systemQueue',
            id: 'system',
            startX: e.point.x, // 3D world calc
            startZ: e.point.z,
            originalX,
            originalY,
            currentX: originalX,
            currentY: originalY
        });
    }, [isEditing, viewMode]);



    const handlePlanePointerMove = useCallback((e: any) => {
        if (!dragState) return;
        e.stopPropagation();

        // 算World Delta
        const dxWorld = e.point.x - dragState.startX;
        const dzWorld = e.point.z - dragState.startZ;

        // Convert World Delta to Pixel Delta (1 unit = 40px)
        const dxPx = dxWorld * 40;
        const dyPx = dzWorld * 40;

        // New Layout Position (Raw)
        let newX = dragState.originalX + dxPx;
        let newY = dragState.originalY + dyPx;

        // Grid Snap (5px)
        const SNAP_THRESHOLD = 5;
        const GRID_SIZE = 5;

        let finalX = newX;
        let finalY = newY;

        if (!e.shiftKey) {
            if (dragState.type === 'station') {
                // 1. Adsorption (Snap to other stations)
                const otherStations = stations.filter(s => s.id !== dragState.id);
                const xTargets = otherStations.map(s => s.x);
                const yTargets = otherStations.map(s => s.y);

                const getClosestSnap = (val: number, targets: number[]) => {
                    let closest = val;
                    let minDiff = SNAP_THRESHOLD;
                    for (const t of targets) {
                        const diff = Math.abs(val - t);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closest = t; // Found a snap target
                        }
                    }
                    return closest;
                };

                const snappedX = getClosestSnap(newX, xTargets);
                const snappedY = getClosestSnap(newY, yTargets);

                finalX = snappedX !== newX ? snappedX : Math.round(newX / GRID_SIZE) * GRID_SIZE;
                finalY = snappedY !== newY ? snappedY : Math.round(newY / GRID_SIZE) * GRID_SIZE;
            } else {
                // Queue/SystemQueue dragging: Simple 5px grid snap
                finalX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                finalY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
            }
        }

        // Apply
        setDragState(prev => prev ? { ...prev, currentX: finalX, currentY: finalY } : null);
    }, [dragState, stations]);

    const handlePointerUp = useCallback((e: any) => {
        if (dragState) {
            e.stopPropagation();
            // Commit change
            if (dragState.currentX !== dragState.originalX || dragState.currentY !== dragState.originalY) {
                if (dragState.type === 'station') {
                    onStationChange?.(dragState.id, { x: dragState.currentX, y: dragState.currentY });
                } else if (dragState.type === 'queue') {
                    const zoneIndex = parseInt(dragState.id, 10);
                    onZoneChange?.(zoneIndex, { queueX: dragState.currentX, queueY: dragState.currentY });
                } else if (dragState.type === 'systemQueue') {
                    onSystemQueueChange?.({ x: dragState.currentX, y: dragState.currentY });
                }
            }
            setDragState(null);
        }
    }, [dragState, onStationChange, onZoneChange, onSystemQueueChange]);


    // Dynamic center calculation based on zone bounds
    const layoutCenter = useMemo(() => {
        const allX = ZONE_DEFS.flatMap(z => [z.xMin, z.xMax]);
        const allY = ZONE_DEFS.flatMap(z => [z.yMin, z.yMax]);
        return {
            cx: (Math.min(...allX) + Math.max(...allX)) / 2,
            cy: (Math.min(...allY) + Math.max(...allY)) / 2,
        };
    }, [ZONE_DEFS]);

    const mapCoord = (px: number, py: number): [number, number, number] => {
        return [(px - layoutCenter.cx) / 40, 0, (py - layoutCenter.cy) / 40];
    };

    // Auto-pan when searching (single result)
    useEffect(() => {
        if (filteredStationIds && filteredStationIds.size === 1 && onAutoPan) {
            const targetId = Array.from(filteredStationIds)[0];
            let targetStation = stations.find(s => s.id === targetId);
            if (!targetStation) {
                // Check extra floors
                for (const ef of extraFloors) {
                    const found = ef.stations.find((s: any) => s.id === targetId);
                    if (found) {
                        targetStation = found;
                        // floorY = ef.yOffset; // Removed unused
                        break;
                    }
                }
            }

            if (targetStation) {
                const [tx, , tz] = mapCoord(targetStation.x, targetStation.y);
                onAutoPan(tx, tz);
            }
        }
    }, [filteredStationIds, stations, extraFloors, onAutoPan, layoutCenter]);

    // Generate walls for each zone
    const zoneWalls = useMemo(() => ZONE_DEFS.map(z => {
        const x1 = (z.xMin - layoutCenter.cx) / 40;
        const x2 = (z.xMax - layoutCenter.cx) / 40;
        const z1 = (z.yMin - layoutCenter.cy) / 40;
        const z2 = (z.yMax - layoutCenter.cy) / 40;
        return [
            { start: [x1, z1] as [number, number], end: [x2, z1] as [number, number] },
            { start: [x2, z1] as [number, number], end: [x2, z2] as [number, number] },
            { start: [x2, z2] as [number, number], end: [x1, z2] as [number, number] },
            { start: [x1, z2] as [number, number], end: [x1, z1] as [number, number] },
        ];
    }), [ZONE_DEFS, layoutCenter]);

    return (
        <>
            {/* Drag Plane (Invisible, catches moves) */}
            {dragState && (
                <mesh
                    position={[0, 0, 0]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    visible={false}
                    onPointerMove={handlePlanePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp} // Safety
                >
                    <planeGeometry args={[1000, 1000]} />
                    <meshBasicMaterial />
                </mesh>
            )}

            <CameraController viewMode={viewMode} zoom={zoom} panOffset={panOffset} />
            {onPanDelta && <PanHandler viewMode={viewMode} zoom={zoom} onPan={onPanDelta} />}

            {/* Lighting */}
            <ambientLight intensity={0.15} />
            <directionalLight position={[5, 10, 5]} intensity={0.4} color="#b4d4ff" />
            <pointLight position={[-6, 3, -4]} intensity={0.3} color="#67e8f9" distance={20} />
            <pointLight position={[4, 3, -4]} intensity={0.3} color="#fbbf24" distance={20} />
            <pointLight position={[-6, 3, 5]} intensity={0.3} color="#34d399" distance={20} />
            <pointLight position={[4, 3, 5]} intensity={0.3} color="#f472b6" distance={20} />

            {/* Floor (transparent if not bottom-most in 3D; always opaque in 2D) */}
            {(() => {
                const minY = Math.min(0, ...extraFloors.map(f => f.yOffset));
                const isMainBottom = viewMode === '2d' || 0 === minY;
                const opacity = isMainBottom ? 0.35 : 0.2;
                return (
                    <React.Suspense fallback={null}>
                        <FloorGrid opacity={opacity} isCritical={isCritical} />
                    </React.Suspense>
                );
            })()}

            {/* Heatmap Overlay */}
            {(() => {
                // C2-P2: Prepare stress heat sources
                const stressHeatSources = useMemo(() => {
                    const sources: { x: number; z: number; intensity: number }[] = [];
                    if (!stressMap) return sources;

                    stations.forEach(s => {
                        if (!s.agentId) return;
                        const entry = stressMap.get(s.agentId);
                        if (entry && entry.stress_score > 0.5) { // Only show heat for moderate/high stress
                            sources.push({
                                x: s.x,
                                z: s.y, // Map 2D y is 3D z
                                intensity: entry.stress_score * 0.8 // Scale intensity
                            });
                        }
                    });
                    return sources;
                }, [stations, stressMap]);

                return (
                    <HeatmapOverlay
                        zoneDefs={zoneDefsProp || []}
                        zoneQueues={zoneQueues || []}
                        mapCoord={mapCoord}
                        visible={showHeatmap}
                        stressHeatSources={stressHeatSources}
                    />
                );
            })()}

            {/* Per-zone pulse waves (only during active calls) */}
            {ZONE_DEFS.map((z, i) => {
                const cx = ((z.xMin + z.xMax) / 2 - layoutCenter.cx) / 40;
                const cz = ((z.yMin + z.yMax) / 2 - layoutCenter.cy) / 40;
                const callCount = stations.filter((s: any) =>
                    s.zone === i && s.agentId && ['oncall', 'ring'].includes(agents[s.agentId]?.status)
                ).length;
                return (
                    <ZonePulse
                        key={`pulse-${i}`}
                        center={[cx, 0, cz]}
                        ringingCount={callCount}
                        color={z.color}
                        maxRadius={4}
                    />
                );
            })}



            {/* Zone Walls (LED glow only when online agents present) */}
            {ZONE_DEFS.map((z, zi) => {
                const hasOnline = stations.some((s: any) =>
                    s.zone === zi && s.agentId && agents[s.agentId]?.status !== 'offline'
                );
                const queueStats = zoneQueues?.find(q => q.zoneIndex === zi);
                let alertLevel: 'normal' | 'warning' | 'critical' = 'normal';

                if (queueStats) {
                    if (queueStats.avgWaitTimeSec > 120 || queueStats.queueCount > 8) alertLevel = 'critical';
                    else if (queueStats.avgWaitTimeSec > 45 || queueStats.queueCount > 3) alertLevel = 'warning';
                }

                // Zone center in world coords for double-click zoom
                const zcx = ((z.xMin + z.xMax) / 2 - layoutCenter.cx) / 40;
                const zcz = ((z.yMin + z.yMax) / 2 - layoutCenter.cy) / 40;
                // 算zoom让zone刚好fit (zone越宽zoom越小)
                const zoneW = (z.xMax - z.xMin) / 40;
                const zoneH = (z.yMax - z.yMin) / 40;
                const fitZoom = Math.min(80, 300 / Math.max(zoneW, zoneH));

                // Count agents for summary bar
                const zoneStations = stations.filter((s: any) => s.zone === zi);
                const onlineCount = zoneStations.filter((s: any) =>
                    s.agentId && agents[s.agentId]?.status !== 'offline'
                ).length;
                const totalCount = zoneStations.length;

                // Bottom center of zone in world coords
                const bottomY = (z.yMax - layoutCenter.cy) / 40;
                const centerX = ((z.xMin + z.xMax) / 2 - layoutCenter.cx) / 40;

                return (
                    <group
                        key={`z${zi}-group`}
                    >
                        {/* Transparent hit-plane for double-click zoom */}
                        <mesh
                            position={[zcx, 0.01, zcz]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                onZoomToZone?.(zcx, zcz, fitZoom);
                            }}
                        >
                            <planeGeometry args={[zoneW, zoneH]} />
                            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                        </mesh>
                        {zoneWalls[zi].map((w, wi) => (
                            <GlassWall
                                key={`z${zi}-${wi}`}
                                start={w.start}
                                end={w.end}
                                height={2.5}
                                color={z.color}
                                label={wi === 0 ? z.name : undefined}
                                active={hasOnline}
                                alertLevel={alertLevel}
                            />
                        ))}

                        {/* Zone Summary Bar — top-left of zone */}
                        <ZoneSummaryBar
                            position={[((z.xMin - layoutCenter.cx) / 40) + 0.5, 0.3, ((z.yMin - layoutCenter.cy) / 40) - 0.4]}
                            onlineCount={onlineCount}
                            totalCount={totalCount}
                            color={z.color}
                            width={zoneW}
                        />

                        {/* Zone Quality Card */}
                        {(() => {
                            const qd = zoneQuality?.find(q => q.zoneIndex === zi);
                            if (!qd) return null;
                            return <ZoneQualityCard key={`zqc-main-${zi}`} position={[centerX, 0.3, bottomY - 0.5]} data={qd} zoneColor={z.color} width={zoneW} />;
                        })()}
                    </group>
                );
            })}

            {/* Workstations */}
            {/* Workstations - use InstancedMesh component */}
            {/* Workstations */}
            {stations.map((s, i) => {
                // Determine position: Dragging override vs Static
                const isDragging = dragState?.id === s.id;
                const x = (isDragging && dragState) ? dragState.currentX : s.x;
                const y = (isDragging && dragState) ? dragState.currentY : s.y;

                const pos = mapCoord(x, y);
                const isDimmed = filteredStationIds ? !filteredStationIds.has(s.id) : false;

                return (
                    // Wrap in group specific for drag events if needed? 
                    // Or attach events to Workstation component root group?
                    // We'll pass handlers to Workstation? 
                    // No, Workstation accepts onClick. We can add onPointerDown?
                    // Workstation component interface update needed?
                    // Actually, we can just wrap capture in a group here.
                    <group
                        key={s.id}
                        position={pos}
                        onPointerDown={(e) => handlePointerDown(e, s.id, s.x, s.y)}
                    >
                        <ErrorBoundary fallback={null}>
                            <React.Suspense fallback={null}>
                                <Workstation
                                    position={[0, 0, 0]} // Relative to wrapper which is at `pos`
                                    agent={s.agentId ? agents[s.agentId] : null}
                                    isSelected={s.id === selectedStationId}
                                    onClick={() => onStationSelect(s.id)}
                                    zoneColor={ZONE_DEFS.find(z =>
                                        x >= z.xMin && x <= z.xMax &&
                                        y >= z.yMin && y <= z.yMax
                                    )?.color || '#334155'}
                                    label={s.label || s.id}
                                    avatarIndex={i}
                                    isDimmed={isDimmed}
                                    isHighlighted={!!filteredStationIds && filteredStationIds.has(s.id)}
                                    lodLevel={lodLevel}
                                    viewMode={viewMode}
                                    stressScore={s.agentId && stressMap?.get(s.agentId)?.stress_score}
                                    isCardLocked={s.agentId ? lockedCardIds?.has(s.agentId) : false}
                                    onToggleLock={s.agentId ? () => onToggleLock?.(s.agentId) : undefined}
                                    agentId={s.agentId}
                                    onHover={handleStationHover}
                                />
                            </React.Suspense>
                        </ErrorBoundary>
                    </group>
                );
            })}

            {/* System Queue Indicator (Top Left) */}
            {/* System Queue Indicator (Top Left) */}
            {
                systemQueue && (() => {
                    const isDragging = dragState?.type === 'systemQueue';
                    // Default to approx top-left relative to center if no overrides
                    // (layoutCenter.cx - 480, layoutCenter.cy - 320) ~ (-12, -8) in map units
                    const defaultX = layoutCenter.cx - 480;
                    const defaultY = layoutCenter.cy - 320;

                    const curX = isDragging ? dragState.currentX : (systemQueueX ?? defaultX);
                    const curY = isDragging ? dragState.currentY : (systemQueueY ?? defaultY);

                    const pos = mapCoord(curX, curY);
                    // y-pos: Fixed at 6 for visibility (overriding mapCoord's 0 y)
                    // Wait, legacy was [-12, 6, -8]. mapCoord gives [x, 0, z].
                    // We want [x, 6, z].

                    return (
                        <group
                            position={[pos[0], 6, pos[2]]}
                            onPointerDown={(e) => handleSystemQueueDrag(e, curX, curY)}
                        >
                            <SystemQueueIndicator
                                position={[0, 0, 0]} // Local to group
                                queueCount={systemQueue.queueCount}
                                avgWaitTimeSec={systemQueue.avgWaitTimeSec}
                            />
                        </group>
                    );
                })()
            }



            {/* Connection Lines (Agent-Agent ONLY) */}
            <CallConnectionLines
                stations={stations}
                connections={callConnections.filter(c => c.type === 'agent-agent')}
                zoneDefs={ZONE_DEFS}
                mapCoord={mapCoord}

            />

            {/* Extra Floors (stacked in 3D) */}
            {/* Extra Floors (stacked in 3D) */}
            {
                extraFloors.map(ef => {
                    // Determine if this is the bottom-most floor in the entire visual set
                    // 算最小Y, 含主楼层(y=0)
                    const minY = Math.min(0, ...extraFloors.map(f => f.yOffset));
                    const isBottom = ef.yOffset === minY;

                    return (
                        <ExtraFloorLayer
                            key={`extra-${ef.floorId}`}
                            floorId={ef.floorId}
                            yOffset={ef.yOffset}
                            stations={ef.stations}
                            agents={ef.agents}
                            zoneDefs={ef.zoneDefs}
                            callConnections={ef.callConnections}
                            zoneQueues={ef.zoneQueues}
                            zoneQuality={ef.zoneQuality}
                            isBottom={isBottom}
                            filteredStationIds={filteredStationIds}
                            viewMode={viewMode}
                            stressMap={stressMap}

                            lockedCardIds={lockedCardIds}
                            onToggleLock={onToggleLock}
                            onHoverStation={handleStationHover}
                            lodLevel={lodLevel}
                        />
                    );
                })
            }

            {/* Particles */}
            <ParticleField />

            {/* HUD Labels */}
            <HUDLabels />

            {/* Post Processing - Temporarily disabled to debug black screen flicker */}
            {/* <EffectComposer>
                <Bloom
                    intensity={0.8}
                    luminanceThreshold={0.2}
                    luminanceSmoothing={0.9}
                    mipmapBlur
                />
                <Vignette eskil={false} offset={0.1} darkness={isCritical ? 1.4 : 0.8} />
            </EffectComposer> */}
            {/* ── Pinned (Locked) Agent Tooltips ── */}
            {lockedCardIds && Array.from(lockedCardIds).map(lockedId => {
                // Don't render locked card if it's also the hovered card (avoid duplicate)
                if (lockedId === hoveredAgentId) return null;
                if (!agents[lockedId]) return null;

                let targetStation = stations.find(s => s.agentId === lockedId);
                let stationYOffset = 0;
                if (!targetStation) {
                    for (const ef of extraFloors) {
                        const s = ef.stations.find((s: any) => s.agentId === lockedId);
                        if (s) { targetStation = s; stationYOffset = ef.yOffset; break; }
                    }
                }
                if (!targetStation) return null;

                const pos = mapCoord(targetStation.x, targetStation.y);
                const tooltipPos: [number, number, number] = [
                    pos[0],
                    (viewMode === '2d' ? 0 : pos[1]) + stationYOffset + (viewMode === '2d' ? 2 : 2.5),
                    pos[2] + (viewMode === '2d' ? 0.5 : 0)
                ];

                return (
                    <ErrorBoundary key={`locked-tt-eb-${lockedId}`} fallback={null}>
                        <Html key={`locked-tt-${lockedId}`} position={tooltipPos} center style={{ pointerEvents: 'none' }}>
                            <div style={{ pointerEvents: 'auto' }}>
                                <AgentTooltip
                                    agent={agents[lockedId]}
                                    isLocked={true}
                                    onLock={() => { }}
                                    onClose={() => { onToggleLock?.(lockedId); }}
                                    onMouseEnter={() => { }}
                                    onMouseLeave={() => { }}
                                />
                            </div>
                        </Html>
                    </ErrorBoundary>
                );
            })}

            {/* ── Hovered Agent Tooltip (active hover or locked+hovered) ── */}
            {hoveredAgentId && (() => {
                if (!agents[hoveredAgentId]) return null;

                let targetStation = stations.find(s => s.agentId === hoveredAgentId);
                let stationYOffset = 0;
                if (!targetStation) {
                    for (const ef of extraFloors) {
                        const s = ef.stations.find((s: any) => s.agentId === hoveredAgentId);
                        if (s) { targetStation = s; stationYOffset = ef.yOffset; break; }
                    }
                }
                if (!targetStation) return null;

                const pos = mapCoord(targetStation.x, targetStation.y);
                const tooltipPos: [number, number, number] = [
                    pos[0],
                    (viewMode === '2d' ? 0 : pos[1]) + stationYOffset + (viewMode === '2d' ? 2 : 2.5),
                    pos[2] + (viewMode === '2d' ? 0.5 : 0)
                ];
                const isLocked = !!lockedCardIds?.has(hoveredAgentId);

                return (
                    <ErrorBoundary key="hover-tooltip-eb" fallback={null}>
                        <Html key={`hover-tt-${hoveredAgentId}`} position={tooltipPos} center style={{ pointerEvents: 'none' }}>
                            <div style={{ pointerEvents: 'auto' }} onClickCapture={() => {
                                // Capture phase: fires BEFORE AgentTooltip's stopPropagation
                                const ts = stations.find(s => s.agentId === hoveredAgentId)
                                    || extraFloors.flatMap(ef => ef.stations).find((s: any) => s.agentId === hoveredAgentId);
                                if (ts) onStationSelect(ts.id);
                            }}>
                                <AgentTooltip
                                    agent={agents[hoveredAgentId]}
                                    isLocked={isLocked}
                                    onLock={() => onToggleLock?.(hoveredAgentId)}
                                    onClose={() => { onToggleLock?.(hoveredAgentId); setHoveredAgentId(null); }}
                                    onMouseEnter={handleTooltipEnter}
                                    onMouseLeave={handleTooltipLeave}
                                />
                            </div>
                        </Html>
                    </ErrorBoundary>
                );
            })()}

        </>
    );
};

// Removed FontPreloader as it blocks the initial scene load via Suspense


class ErrorBoundary extends React.Component<{ fallback: React.ReactNode, children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: any) {
        console.error("MapCanvas3D Error:", error);
    }
    render() {
        if (this.state.hasError) return this.props.fallback;
        return this.props.children;
    }
}

/* ─────────────── Exported Component ─────────────── */

export const MapCanvas3D: React.FC<MapCanvas3DProps> = ({
    width,
    height,
    stations,
    agents,
    isEditing,
    onStationChange,
    onStationSelect,
    viewMode = '3d',
    walls = [],
    zoom: externalZoom,
    onZoomChange,
    zoneDefs,
    callConnections,
    zoneQueues,
    zoneQuality,
    extraFloors,
    systemQueue,
    showHeatmap = false,
    filteredStationIds = null,
    panOffset: externalPanOffset,
    onPanOffsetChange,
    floorId,
    selectedStationId,
    onZoneChange,
    systemQueueX,
    systemQueueY,
    onSystemQueueChange,
    stressMap,
    systemStats,
    lockedCardIds,
    onToggleLock,
}) => {
    // Removed: Preload dynamic agent avatars to prevent Suspense fallback
    // The AvatarPortrait component now loads textures asynchronously without useLoader
    // to prevent blocking the entire 3D scene from rendering if an image URL is slow.
    useEffect(() => {
        // Kept empty to preserve hook order if any
    }, [agents]);

    const [internalZoom, setInternalZoom] = useState(35);
    const zoom = externalZoom ?? internalZoom;

    // Determine critical mode from system stats
    const isCritical = useMemo(() => {
        return (systemStats?.sipErrorRate || 0) > 5.0;
    }, [systemStats]);

    // Pan state (lifted when external props provided)
    const [internalPanOffset, setInternalPanOffset] = useState<[number, number]>([0, 0]);
    const panOffset = externalPanOffset ?? internalPanOffset;
    const setPanOffset = (v: [number, number] | ((prev: [number, number]) => [number, number])) => {
        const resolved = typeof v === 'function' ? v(externalPanOffset ?? internalPanOffset) : v;
        setInternalPanOffset(resolved);
        onPanOffsetChange?.(resolved);
    };
    // Keep a ref to always access the latest setPanOffset (avoids stale closures)
    const setPanOffsetRef = useRef(setPanOffset);
    setPanOffsetRef.current = setPanOffset;


    const handleZoom = (newZoom: number) => {
        const clamped = Math.max(10, Math.min(120, newZoom));
        setInternalZoom(clamped);
        onZoomChange?.(clamped);
    };

    // Reset pan only when floor changes (based on floorId)
    useEffect(() => {
        setPanOffset([0, 0]);
    }, [floorId]);

    // PanHandler来的delta平移 (累加到当前offset)
    const handlePanDelta = useCallback((dx: number, dz: number) => {
        setPanOffsetRef.current(prev => [prev[0] + dx, prev[1] + dz]);
    }, []);

    // Wheel zoom handler
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            handleZoom(zoom + (e.deltaY > 0 ? -3 : 3));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [zoom]);

    return (
        <div
            ref={containerRef}
            style={{ width, height, background: '#05070A', position: 'relative', touchAction: 'none' }}
        >

            {/* System Alert Banner Overlay */}
            <SystemAlertBanner stats={systemStats || null} />

            <Canvas
                orthographic
                frameloop="demand"
                camera={{
                    position: [10, 10, 10],
                    zoom: zoom,
                    near: -100,
                    far: 100,
                }}
                gl={{
                    antialias: true,
                    alpha: false,
                    powerPreference: 'high-performance',
                }}
                onPointerMissed={() => onStationSelect(null)}
                style={{ width: '100%', height: '100%' }}
            >
                <color attach="background" args={['#05070A']} />
                <RenderHeartbeat />
                <ErrorBoundary fallback={<Html center><div style={{ background: 'rgba(255,0,0,0.8)', padding: 20, color: 'white' }}>Crash in Scene. Check console.</div></Html>}>
                    <React.Suspense fallback={<Html center><div style={{ color: 'white' }}>Loading map assets/fonts...</div></Html>}>
                        <Scene
                            stations={stations}
                            agents={agents}
                            walls={walls}
                            viewMode={viewMode}
                            onStationSelect={onStationSelect}
                            zoom={zoom}
                            zoneDefs={zoneDefs}
                            panOffset={panOffset}
                            onPanDelta={handlePanDelta}
                            callConnections={callConnections}
                            zoneQueues={zoneQueues}
                            zoneQuality={zoneQuality}
                            extraFloors={extraFloors}
                            systemQueue={systemQueue}
                            showHeatmap={showHeatmap}
                            filteredStationIds={filteredStationIds}
                            onAutoPan={(x, z) => setPanOffset([x, z])}
                            isEditing={isEditing}

                            onStationChange={onStationChange}
                            selectedStationId={selectedStationId}
                            onZoneChange={onZoneChange}
                            lockedCardIds={lockedCardIds}
                            onToggleLock={onToggleLock}
                            systemQueueX={systemQueueX}
                            systemQueueY={systemQueueY}
                            onSystemQueueChange={onSystemQueueChange}
                            onZoomToZone={(cx, cz, targetZoom) => {
                                setPanOffset([cx, cz]);
                                handleZoom(targetZoom);
                            }}
                            stressMap={stressMap}
                            isCritical={isCritical}
                        />
                    </React.Suspense>
                </ErrorBoundary>
            </Canvas>
        </div>
    );
};
