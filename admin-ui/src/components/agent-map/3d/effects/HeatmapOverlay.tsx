import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HeatmapOverlayProps {
    zoneDefs: { name: string; xMin: number; xMax: number; yMin: number; yMax: number }[];
    zoneQueues: { zoneIndex: number; activeCallCount: number; queueCount: number; avgWaitTimeSec: number }[];
    mapCoord: (px: number, py: number) => [number, number, number];
    visible: boolean;
    stressHeatSources?: { x: number; z: number; intensity: number }[];
}

const vertexShader = `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uPoints[20]; // x, z, intensity
uniform int uPointCount;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
    vec2 pos = vWorldPos.xz;
    float totalHeat = 0.0;
    
    // Accumulate heat
    for(int i = 0; i < 20; i++) {
        if(i >= uPointCount) break;
        
        vec2 pointPos = uPoints[i].xy;
        float intensity = uPoints[i].z;
        
        float dist = distance(pos, pointPos);
        
        // Gaussian falloff (radius ~ 5.0 units)
        float heat = intensity * exp(-0.5 * pow(dist / 5.0, 2.0));
        totalHeat += heat;
    }
    
    // Clamp heat
    totalHeat = clamp(totalHeat, 0.0, 1.0);
    
    if (totalHeat < 0.01) discard;

    // Gradient: Blue -> Teal -> Green -> Yellow -> Red
    vec3 c1 = vec3(0.0, 0.0, 0.5); // Deep Blue
    vec3 c2 = vec3(0.0, 1.0, 1.0); // Cyan
    vec3 c3 = vec3(0.0, 1.0, 0.0); // Green
    vec3 c4 = vec3(1.0, 1.0, 0.0); // Yellow
    vec3 c5 = vec3(1.0, 0.0, 0.0); // Red
    
    vec3 color = c1;
    color = mix(color, c2, smoothstep(0.0, 0.25, totalHeat));
    color = mix(color, c3, smoothstep(0.25, 0.5, totalHeat));
    color = mix(color, c4, smoothstep(0.5, 0.75, totalHeat));
    color = mix(color, c5, smoothstep(0.75, 1.0, totalHeat));
    
    // Alpha
    float alpha = smoothstep(0.0, 0.1, totalHeat) * 0.5 * uOpacity;
    
    gl_FragColor = vec4(color, alpha);
}
`;

export const HeatmapOverlay: React.FC<HeatmapOverlayProps> = ({ zoneDefs, zoneQueues, mapCoord, visible, stressHeatSources = [] }) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    // Calculate heat points
    const heatPoints = useMemo(() => {

        const points: THREE.Vector3[] = [];

        // 1. Zone-based queue heat
        zoneDefs.forEach((zone, idx) => {
            const queueData = zoneQueues.find(q => q.zoneIndex === idx);

            let intensity = 0;
            if (queueData) {
                intensity += (queueData.activeCallCount || 0) * 0.15;
                intensity += (queueData.queueCount || 0) * 0.3;
                if ((queueData.avgWaitTimeSec || 0) > 30) intensity += 0.2;
                if ((queueData.avgWaitTimeSec || 0) > 60) intensity += 0.4;
            }

            if (intensity > 0.05) {
                // Center of zone
                const cx = (zone.xMin + zone.xMax) / 2;
                const cy = (zone.yMin + zone.yMax) / 2;
                const [vx, , vz] = mapCoord(cx, cy);
                points.push(new THREE.Vector3(vx, vz, Math.min(intensity, 1.5)));
            }
        });

        // 2. C2-P2: Stress-based heat (per agent)
        stressHeatSources.forEach(source => {
            const [vx, , vz] = mapCoord(source.x, source.z);
            // Stress intensity 0.0-1.0. Scale down slightly to blend with queues.
            points.push(new THREE.Vector3(vx, vz, source.intensity));
        });

        return points;
    }, [zoneDefs, zoneQueues, mapCoord, stressHeatSources]);

    // Pre-allocate static Vector3 array — reused every frame (no GC pressure)
    const staticPoints = useMemo(() => Array.from({ length: 20 }, () => new THREE.Vector3(0, 0, 0)), []);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uPoints: { value: staticPoints },
        uPointCount: { value: 0 },
        uOpacity: { value: 0 },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    useFrame(({ clock }) => {
        if (!materialRef.current) return;

        // Skip entirely when invisible and already faded out
        const currentOpacity = materialRef.current.uniforms.uOpacity.value;
        if (!visible && currentOpacity < 0.01) return;

        materialRef.current.uniforms.uTime.value = clock.getElapsedTime();

        const pulse = 0.8 + Math.sin(clock.getElapsedTime()) * 0.2;

        const targetOpacity = visible ? pulse : 0.0;
        materialRef.current.uniforms.uOpacity.value = THREE.MathUtils.lerp(currentOpacity, targetOpacity, 0.1);

        // Update points IN-PLACE (no allocation)
        const len = Math.min(heatPoints.length, 20);
        for (let i = 0; i < 20; i++) {
            if (i < len) {
                staticPoints[i].copy(heatPoints[i]);
            } else {
                staticPoints[i].set(0, 0, 0);
            }
        }
        materialRef.current.uniforms.uPoints.value = staticPoints;
        materialRef.current.uniforms.uPointCount.value = len;
    });

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <planeGeometry args={[200, 200]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                transparent
                depthWrite={false}
                uniforms={uniforms}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
};
