import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Environment, OrbitControls, PerspectiveCamera, OrthographicCamera, MapControls } from '@react-three/drei';
import { EffectComposer, Bloom, Noise, Vignette, ToneMapping } from '@react-three/postprocessing';

interface SceneEnvironmentProps {
    children: React.ReactNode;
    target?: [number, number, number];
    viewMode?: '2d' | '3d';
    zoom?: number; // 0-100+
}

export const SceneEnvironment: React.FC<SceneEnvironmentProps> = ({ children, target = [0, 0, 0], viewMode = '3d', zoom = 35 }) => {
    const controlsRef = useRef<any>(null);

    // Reset controls when switching modes to ensure proper target
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.target.set(...target);
            controlsRef.current.update();
        }
    }, [viewMode, target]);

    // Apply Zoom (Distance for 3D, Zoom for 2D)
    useEffect(() => {
        if (!controlsRef.current) return;

        // Base distance logic: 100% = Frame well.
        // Map width ~2000. Frame 2000 at FOV 35 -> Dist ~ 3200.
        // Let's set 100% = 2500 units distance.

        if (viewMode === '3d') {
            const baseDistance = 2500;
            const factor = Math.max(0.1, zoom / 100); // Normalized to 100
            const newDist = baseDistance / factor;

            const camera = controlsRef.current.object;
            const direction = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(...target)).normalize();

            // If direction is invalid (perfectly vertical?), default to some angle
            if (direction.lengthSq() < 0.01) direction.set(0, 1, 1).normalize();

            const targetPos = new THREE.Vector3(...target).add(direction.multiplyScalar(newDist));

            camera.position.copy(targetPos);
            controlsRef.current.update();
        } else {
            // 2D View Logic
            const camera = controlsRef.current.object as THREE.OrthographicCamera;
            // Force top-down position!
            const tVal = new THREE.Vector3(...target);
            camera.position.set(tVal.x, 2000, tVal.z); // High up
            camera.lookAt(tVal);
            camera.zoom = 20 * (zoom / 100); // normalize
            camera.updateProjectionMatrix();
        }

    }, [zoom, viewMode, target]);

    return (
        <>
            {viewMode === '3d' ? (
                <>
                    <PerspectiveCamera makeDefault position={[0, 40, 40]} fov={35} />
                    <OrbitControls
                        ref={controlsRef}
                        makeDefault
                        maxPolarAngle={Math.PI / 2 - 0.1}
                        minDistance={10}
                        maxDistance={5000}
                        enableDamping
                        dampingFactor={0.05}
                        target={target}
                    />
                </>
            ) : (
                <>
                    <OrthographicCamera makeDefault position={[0, 100, 0]} zoom={20} near={0.1} far={5000} />
                    <MapControls
                        ref={controlsRef}
                        makeDefault
                        enableRotate={false} // Lock rotation for 2D
                        enableDamping
                        dampingFactor={0.05}
                        target={target}
                        maxDistance={5000}
                        minPolarAngle={0}
                        maxPolarAngle={0}
                    />
                </>
            )}

            {/* Lights - Daylight Studio Setup */}
            <ambientLight intensity={0.9} color="#ffffff" />
            <directionalLight
                position={[100, 200, 100]}
                intensity={1.0}
                color="#ffffff"
                castShadow
                shadow-mapSize={[4096, 4096]}
            />
            <pointLight position={[-50, 100, -50]} intensity={0.5} color="#e2e8f0" />

            <Environment preset="city" blur={0.8} background={false} />

            <group>
                {children}
            </group>

            <EffectComposer>
                <Bloom luminanceThreshold={1.1} mipmapBlur intensity={0.3} radius={0.5} />
                <Noise opacity={0.02} />
                <Vignette eskil={false} offset={0.1} darkness={0.3} />
                <ToneMapping adaptive={false} resolution={256} middleGrey={0.7} maxLuminance={16.0} averageLuminance={1.0} adaptationRate={1.0} />
            </EffectComposer>

            <color attach="background" args={['#f8fafc']} /> {/* Slate 50 Background */}
            <fog attach="fog" args={['#f8fafc', 2000, 8000]} /> {/* Light Fog */}
        </>
    );
};
