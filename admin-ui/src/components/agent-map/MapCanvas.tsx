import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Ring, Line, Path } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { projectPoint, getStatusColor, getGlowColor } from './utils';

interface MapCanvasProps {
    width: number;
    height: number;
    imageUrl?: string;
    stations: any[];
    agents: Record<string, any>;
    isEditing: boolean;
    onStationChange: (id: string, newAttrs: any) => void;
    onStationSelect: (id: string | null) => void;
    scale?: number;
    x?: number;
    y?: number;
    onViewChange?: (view: { x: number, y: number, scale: number }) => void;
    viewMode?: '2d' | '3d';
    walls?: any[];
}

const WallNode = ({ x1, y1, x2, y2, height, width, heightCanvas, viewMode, label }: any) => {
    // 1. Project Base Points
    const p1 = projectPoint(x1, y1, width, heightCanvas, viewMode);
    const p2 = projectPoint(x2, y2, width, heightCanvas, viewMode);

    // 2. Extrude Height
    const wallHeight = viewMode === '3d' ? (height || 60) : 0;

    // Top Vertices
    const p1_top = { x: p1.x, y: p1.y - wallHeight };
    const p2_top = { x: p2.x, y: p2.y - wallHeight };

    // Wall Center for Label
    const center = {
        x: (p1.x + p2.x + p1_top.x + p2_top.x) / 4,
        y: (p1.y + p2.y + p1_top.y + p2_top.y) / 4
    };

    // Animation Ref
    const screenRef = useRef<Konva.Group>(null);
    useEffect(() => {
        const node = screenRef.current;
        if (!node) return;

        const anim = new Konva.Animation((frame) => {
            if (!frame) return;
            // Scroll vertical dash lines
            node.y(Math.sin(frame.time / 2000) * 5);
        }, node.getLayer());
        anim.start();
        return () => { anim.stop(); };
    }, []);

    // Tech Pattern: Horizontal Lines (Data Stream)
    // We create a few "lines" that span the wall width at different heights
    const numLines = 5;
    const lines = [];
    for (let i = 0; i < numLines; i++) {
        const t = (i + 1) / (numLines + 1); // Interpolation factor (0 to 1)
        // Lerp between P1/P2 and P1_Top/P2_Top is hard because it's a quad.
        // It's Lerp(Lerp(p1, p1_top, t), Lerp(p2, p2_top, t), u) basically.
        // Left point at height t
        const l_x = p1.x + (p1_top.x - p1.x) * t;
        const l_y = p1.y + (p1_top.y - p1.y) * t;
        // Right point at height t
        const r_x = p2.x + (p2_top.x - p2.x) * t;
        const r_y = p2.y + (p2_top.y - p2.y) * t;

        lines.push({ x1: l_x, y1: l_y, x2: r_x, y2: r_y });
    }

    return (
        <Group listening={false}>
            {/* Main Force Field Panel (Glass) */}
            <Line
                points={[
                    p1.x, p1.y,
                    p2.x, p2.y,
                    p2_top.x, p2_top.y,
                    p1_top.x, p1_top.y
                ]}
                closed
                fillLinearGradientStartPoint={{ x: p1.x, y: p1.y }}
                fillLinearGradientEndPoint={{ x: p1_top.x, y: p1_top.y }}
                fillLinearGradientColorStops={[0, "rgba(6, 182, 212, 0.2)", 1, "rgba(6, 182, 212, 0.05)"]}
                stroke="rgba(34, 211, 238, 0.3)"
                strokeWidth={1}
            />

            {/* Bottom Emitter Glow */}
            <Line
                points={[p1.x, p1.y, p2.x, p2.y]}
                stroke="#22d3ee"
                strokeWidth={2}
                shadowColor="#0891b2"
                shadowBlur={10}
            />

            {/* Top Hologram Edge */}
            <Line
                points={[p1_top.x, p1_top.y, p2_top.x, p2_top.y]}
                stroke="#67e8f9"
                strokeWidth={1}
                opacity={0.5}
            />

            {/* Tech UI Layout (Data Stream Lines) */}
            <Group ref={screenRef}>
                {lines.map((l, i) => (
                    <Line
                        key={i}
                        points={[l.x1, l.y1, l.x2, l.y2]}
                        stroke="#22d3ee"
                        strokeWidth={1}
                        opacity={0.2}
                        dash={[5, 10 + Math.random() * 20]} // Random data pattern
                    />
                ))}
            </Group>

            {/* Holographic Label / Header */}
            {viewMode === '3d' && (
                <Group x={center.x} y={center.y - 10}>
                    {/* Floating Zone Label */}
                    <Rect
                        x={-40} y={-10}
                        width={80} height={20}
                        fill="rgba(8, 145, 178, 0.6)"
                        cornerRadius={4}
                        shadowColor="#22d3ee"
                        shadowBlur={10}
                    />
                    <Text
                        text={label || "ZONE SECURE"}
                        fontSize={10}
                        fontFamily="ui-monospace, Consolas, monospace"
                        fill="#fff"
                        align="center"
                        width={80}
                        y={-6}
                        x={-40}
                    />
                </Group>
            )}
        </Group>
    );
};

const GridScanLine = ({ width, height }: { width: number, height: number }) => {
    const lineRef = useRef<Konva.Line>(null);
    useEffect(() => {
        const node = lineRef.current;
        if (!node) return;

        const anim = new Konva.Animation((frame) => {
            if (!frame) return;
            const y = (frame.time / 10) % height;
            node.y(y);
            node.opacity(1 - y / height); // Fade out at bottom
        }, node.getLayer());
        anim.start();
        return () => { anim.stop(); };
    }, [height]);

    return (
        <Line
            ref={lineRef}
            points={[0, 0, width, 0]}
            stroke="#3b82f6"
            strokeWidth={2}
            shadowColor="#3b82f6"
            shadowBlur={15}
            opacity={0.8}
            listening={false}
        />
    );
};

const ParticleSystem = ({ width, height }: { width: number, height: number }) => {
    // Generate static particles, animate group or individual in future if needed
    // For performance, we can just animate the group slowly panning or individual twinkling
    const particles = useRef([...Array(30)].map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2,
        opacity: Math.random() * 0.5 + 0.1
    }))).current;

    return (
        <Group listening={false}>
            {particles.map((p, i) => (
                <Circle
                    key={i}
                    x={p.x}
                    y={p.y}
                    radius={p.r}
                    fill="#60a5fa"
                    opacity={p.opacity}
                />
            ))}
        </Group>
    );
};

const URLImage = ({ src, width, height }: { src: string, width: number, height: number }) => {
    const [image] = useImage(src, 'anonymous'); // Add anonymous for CORS if needed, though dicebear is permissive
    return <KonvaImage image={image} width={width} height={height} />;
};

// Avatar Component using local images (no CORS issues)
const AvatarNode = ({ src, x, y, size = 36, statusColor, isActive, copilotOnline }: {
    src: string,
    x: number,
    y: number,
    size?: number,
    statusColor: string,
    isActive: boolean,
    copilotOnline?: boolean
}) => {
    // DiceBear avatars need crossOrigin for CORS
    const [image] = useImage(src, 'anonymous');

    // Don't render until image is loaded
    if (!image) return null;

    // Brightness: offline < SIP-only < Copilot
    const ringOpacity = copilotOnline ? 0.8 : (isActive ? 0.35 : 0.2);
    const imgOpacity = copilotOnline ? 1.0 : (isActive ? 0.35 : 0.2);

    return (
        <Group
            x={x}
            y={y}
            rotation={-45} // Counteract isometric rotation to face user
        >
            {/* Status Ring */}
            <Ring
                innerRadius={size / 2 + 2}
                outerRadius={size / 2 + 4}
                fill={copilotOnline ? '#22d3ee' : statusColor}
                opacity={ringOpacity}
            />
            {/* Avatar Circle with Image */}
            <Group clipFunc={(ctx) => {
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2, false);
            }}>
                <KonvaImage
                    image={image}
                    x={-size / 2}
                    y={-size / 2}
                    width={size}
                    height={size}
                    opacity={imgOpacity}
                />
            </Group>
            {/* Status Dot */}
            <Circle
                x={size / 2 - 4}
                y={size / 2 - 4}
                radius={4}
                fill={statusColor}
                stroke="#000"
                strokeWidth={1}
            />
        </Group>
    );
};

// Better Avatar Implementation:
// Just modify existing URLImage or create a specific one that creates a Circle node with fillPattern, OR just a clipped Group.
// The easiest for Konva is Circle with fillPatternImage.




// Connection Lines Component (Visualizing Network Traffic)
const ConnectionLines = ({ stations, agents, width, height, viewMode }: any) => {
    // Find active agents
    const activeStations = stations.filter((s: any) => {
        const agent = s.agentId ? agents[s.agentId] : null;
        return agent && ['oncall', 'ring'].includes(agent.status);
    });

    const center = { x: width / 2, y: height / 2 };

    return (
        <Group listening={false}>
            {activeStations.map((s: any) => {
                const start = projectPoint(s.x, s.y, width, height, viewMode);
                // Draw line to center (Gateway)
                return (
                    <Group key={`conn-${s.id}`}>
                        {/* Beam */}
                        <Line
                            points={[start.x, start.y, center.x, center.y]}
                            stroke="#22d3ee"
                            strokeWidth={1}
                            opacity={0.2}
                            dash={[10, 10]}
                        />
                        {/* Moving Packet (simple pulse effect via keyframe or just static for now to save perf) */}
                        <Circle
                            x={start.x + (center.x - start.x) * 0.5} // Fixed at mid-point for now
                            y={start.y + (center.y - start.y) * 0.5}
                            fill="#fff"
                            radius={2}
                            opacity={0.6}
                        />
                    </Group>
                );
            })}
        </Group>
    );
};

const TargetingReticle = ({ x, y, size = 40, color = "#22d3ee" }: { x: number, y: number, size?: number, color?: string }) => {
    const groupRef = useRef<Konva.Group>(null);

    useEffect(() => {
        const node = groupRef.current;
        if (!node) return;

        const anim = new Konva.Animation((frame) => {
            if (!frame) return;
            // Rotate slowly
            node.rotation((frame.time / 50) % 360);
            // Pulse scale slightly
            const scale = 1 + Math.sin(frame.time / 200) * 0.1;
            node.scale({ x: scale, y: scale });
        }, node.getLayer());
        anim.start();
        return () => { anim.stop(); };
    }, []);

    const cornerLen = 10;
    // Corners for a bracket effect
    // Top-Left
    const tl = `M -${size / 2} -${size / 2 + cornerLen} L -${size / 2} -${size / 2} L -${size / 2 + cornerLen} -${size / 2}`;
    // Top-Right
    const tr = `M ${size / 2} -${size / 2 + cornerLen} L ${size / 2} -${size / 2} L ${size / 2 - cornerLen} -${size / 2}`;
    // Bottom-Right
    const br = `M ${size / 2} ${size / 2 + cornerLen} L ${size / 2} ${size / 2} L ${size / 2 - cornerLen} ${size / 2}`;
    // Bottom-Left
    const bl = `M -${size / 2} ${size / 2 + cornerLen} L -${size / 2} ${size / 2} L -${size / 2 + cornerLen} ${size / 2}`;

    return (
        <Group x={x} y={y} ref={groupRef} listening={false}>
            {/* Reticle Brackets */}
            <Path data={tl} stroke={color} strokeWidth={2} />
            <Path data={tr} stroke={color} strokeWidth={2} />
            <Path data={br} stroke={color} strokeWidth={2} />
            <Path data={bl} stroke={color} strokeWidth={2} />

            {/* Inner Crosshair */}
            <Circle radius={2} fill={color} opacity={0.8} />
            <Rect x={-size / 2} y={0} width={size} height={1} fill={color} opacity={0.2} />
            <Rect x={0} y={-size / 2} width={1} height={size} fill={color} opacity={0.2} />
        </Group>
    );
};

const StationBaseNode = ({ station, agent, isEditing, isSelected, onSelect, onChange }: any) => {
    // Determine State: 'empty' | 'offline' | 'online'
    // 'empty' = No agent assigned (agent prop is null/undefined)
    // 'offline' = Agent assigned but status is 'offline'
    // 'online' = Agent assigned and status is NOT 'offline'

    let renderState = 'empty';
    if (agent) {
        renderState = agent.status === 'offline' ? 'offline' : 'online';
    }

    const status = agent?.status || 'offline';
    const statusColor = getStatusColor(status);
    const glowColor = getGlowColor(status);
    const isActive = renderState === 'online';

    // Base Animations (Pulse)
    const pulseRef = useRef<Konva.Ring>(null);
    useEffect(() => {
        const node = pulseRef.current;
        if (!node || !isActive) return;

        const anim = new Konva.Animation((frame) => {
            if (!frame) return;
            const scale = 1 + Math.sin(frame.time / 800) * 0.15;
            node.scale({ x: scale, y: scale });
            node.opacity(0.4 + Math.sin(frame.time / 800) * 0.3);
        }, node.getLayer());
        anim.start();
        return () => { anim.stop(); };
    }, [isActive]);

    // Empty workstation: render a subtle dashed circle placeholder
    if (renderState === 'empty') {
        return (
            <Group
                x={station.x}
                y={station.y}
                draggable={isEditing}
                onClick={() => onSelect(station.id)}
                onTap={() => onSelect(station.id)}
                onDragEnd={(e) => {
                    onChange(station.id, {
                        x: e.target.x(),
                        y: e.target.y()
                    });
                }}
            >
                {isSelected && (
                    <TargetingReticle x={0} y={0} size={70} color="#3b82f6" />
                )}
                {/* Dashed ring placeholder */}
                <Ring
                    innerRadius={14}
                    outerRadius={16}
                    stroke="#334155"
                    strokeWidth={1}
                    dash={[4, 4]}
                    opacity={0.5}
                />
                {/* Small dot center */}
                <Circle
                    radius={3}
                    fill="#334155"
                    opacity={0.4}
                />
            </Group>
        );
    }

    // Occupied workstation: full desk rendering
    return (
        <Group
            x={station.x}
            y={station.y}
            draggable={isEditing}
            onClick={() => onSelect(station.id)}
            onTap={() => onSelect(station.id)}
            onDragEnd={(e) => {
                onChange(station.id, {
                    x: e.target.x(),
                    y: e.target.y()
                });
            }}
        >
            {/* Selection Ring / Targeting Reticle */}
            {isSelected && (
                <TargetingReticle x={0} y={0} size={70} color="#3b82f6" />
            )}

            {/* Status Glow (Floor Projection) - Only if Online */}
            {isActive && (
                <Ring
                    ref={pulseRef}
                    innerRadius={25}
                    outerRadius={40}
                    fill={glowColor}
                    opacity={0.15}
                    listening={false}
                />
            )}

            {/* --- 3D Cylinder Extrusion (Side Base) --- */}
            <Group y={4}>
                <Circle
                    radius={24}
                    fill="#020617"
                    scaleY={0.5}
                />
            </Group>

            {/* --- Chair (Behind) --- */}
            <Group y={18} opacity={1}>
                <Circle
                    y={5}
                    radius={8}
                    fill="#1e293b"
                    scaleY={0.6}
                />
                <Rect
                    x={-10} y={-8}
                    width={20} height={16}
                    cornerRadius={2}
                    fill="#334155"
                    stroke={isSelected ? '#3b82f6' : '#1e293b'}
                    strokeWidth={1}
                    shadowColor="#000"
                    shadowBlur={5}
                />
            </Group>

            {/* --- AVATAR / PERSON --- */}
            <Group y={0}>
                <Path
                    data="M -12 10 Q 0 5 12 10 L 12 25 L -12 25 Z"
                    fill={isActive ? statusColor : "#475569"}
                    opacity={isActive ? 0.9 : 0.6}
                    shadowColor={isActive ? glowColor : 'transparent'}
                    shadowBlur={10}
                />
                <Circle
                    y={-2}
                    radius={6}
                    fill={isActive ? statusColor : "#475569"}
                    opacity={isActive ? 1 : 0.7}
                    shadowColor={isActive ? glowColor : 'transparent'}
                    shadowBlur={10}
                />
            </Group>

            {/* --- Desk Surface (Front) --- */}
            <Path
                data="M -30 0 Q 0 -15 30 0 L 30 12 Q 0 -3 -30 12 Z"
                y={-2}
                fill="#1e293b"
                stroke={isActive ? statusColor : '#475569'}
                strokeWidth={1}
                shadowColor="#000"
                shadowBlur={10}
            />

            {/* --- Holographic Emitter (Center of Desk) --- */}
            <Circle
                radius={4}
                fill={isActive ? glowColor : '#334155'}
                opacity={0.8}
                shadowColor={isActive ? glowColor : undefined}
                shadowBlur={8}
            />

            {/* Inner Tech Ring (Only Online) */}
            {isActive && (
                <Ring
                    innerRadius={10}
                    outerRadius={14}
                    stroke={statusColor}
                    strokeWidth={1}
                    opacity={0.3}
                    dash={[5, 5]}
                    rotation={45}
                />
            )}
        </Group>
    );
};

interface MapCanvasProps {
    width: number;
    height: number;
    imageUrl?: string;
    stations: any[];
    agents: Record<string, any>;
    isEditing: boolean;
    onStationChange: (id: string, newAttrs: any) => void;
    onStationSelect: (id: string | null) => void;
    scale?: number;
    x?: number; // Stage X
    y?: number; // Stage Y
    onViewChange?: (newPos: { x: number, y: number, scale: number }) => void; // Propagate view changes
    viewMode?: '2d' | '3d';
    walls?: any[];
}
// ...
export const MapCanvas: React.FC<MapCanvasProps> = ({
    width,
    height,
    imageUrl,
    stations,
    agents,
    isEditing,
    onStationChange,
    onStationSelect,
    scale = 1,
    x = 0,
    y = 0,
    onViewChange,
    viewMode = '2d',
    walls = []
}) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const floorGroupRef = useRef<Konva.Group>(null);

    useEffect(() => {
        if (floorGroupRef.current) {
            floorGroupRef.current.cache();
        }
    }, [width, height, imageUrl, viewMode]);


    const handleSelect = (id: string) => {
        setSelectedId(id);
        onStationSelect(id);
    };

    // 3D Transform values
    const isometricProps = {
        x: width / 2,
        y: height / 2,
        scaleX: 0.8,
        scaleY: 0.6,
        rotation: 45,
        offset: { x: width / 2, y: height / 2 }
    };
    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();

        if (!onViewChange) return;

        const stage = e.target.getStage();
        if (!stage) return;

        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        // Zoom Speed
        const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;

        // Clamping
        const clampedScale = Math.max(0.1, Math.min(newScale, 5));

        const newPos = {
            x: pointer.x - mousePointTo.x * clampedScale,
            y: pointer.y - mousePointTo.y * clampedScale,
        };

        onViewChange({ x: newPos.x, y: newPos.y, scale: clampedScale });
    };

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
        // Only update if it's the stage dragging (not an item)
        // Checking via target type or just assuming Stage if e.target === stage (though stage doesn't fire dragend as transparently sometimes)
        // Actually Stage draggable works well.
        if (e.target === e.target.getStage() && onViewChange) {
            onViewChange({
                x: e.target.x(),
                y: e.target.y(),
                scale: scale
            });
        }
    };

    return (
        <Stage
            width={width}
            height={height}
            scaleX={scale}
            scaleY={scale}
            x={x}
            y={y}
            draggable={true} // Enable Drag
            onWheel={handleWheel} // Enable Wheel Zoom
            onDragEnd={handleDragEnd}
            className="bg-gray-950"
            onMouseDown={(e) => {
                const clickedOnEmpty = e.target === e.target.getStage();
                if (clickedOnEmpty && onStationSelect) onStationSelect(null);
            }}
        >
            <Layer>
                {/* --- Bottom Layer: Isometric Floor --- */}
                {/* --- Bottom Layer: Isometric Floor (Cached) --- */}
                <Group
                    ref={floorGroupRef}
                    {...(viewMode === '3d' ? isometricProps : {})}
                >
                    {/* Background / Floor */}
                    {imageUrl ? (
                        <URLImage src={imageUrl} width={width} height={height} />
                    ) : (
                        <Group>
                            {/* Floor Base */}
                            <Rect width={width} height={height} fill="#050b14" opacity={0.9} />

                            {/* Floor Tiles (Carpet Effect) */}
                            {/* We create a tiling pattern using Rects for a "Office Carpet" look */}
                            <Group>
                                {[...Array(Math.ceil(width / 50))].map((_, i) => (
                                    <Group key={`col-${i}`}>
                                        {[...Array(Math.ceil(height / 50))].map((_, j) => (
                                            <Rect
                                                key={`tile-${i}-${j}`}
                                                x={i * 50}
                                                y={j * 50}
                                                width={49}
                                                height={49}
                                                fill={(i + j) % 2 === 0 ? "#0f172a" : "#1e293b"}
                                                opacity={0.15}
                                                cornerRadius={2}
                                            />
                                        ))}
                                    </Group>
                                ))}
                            </Group>

                            {/* Scanning Grid Line Animation */}
                            <GridScanLine width={width} height={height} />

                            {/* Decorative Floor Rings & Labels */}
                            <Circle x={width / 2} y={height / 2} radius={450} stroke="#172554" strokeWidth={1} opacity={0.15} />

                            {/* Floor Sector Labels */}
                            <Text x={100} y={100} text="SECTOR_A" fontSize={24} fill="rgba(59, 130, 246, 0.2)" fontStyle="bold" rotation={-45} />
                            <Text x={width - 200} y={height - 200} text="SECTOR_B" fontSize={24} fill="rgba(59, 130, 246, 0.2)" fontStyle="bold" rotation={-45} />


                            {/* Floating Particles (Dust/Data) */}
                            <ParticleSystem width={width} height={height} />
                        </Group>
                    )}
                </Group>

                {/* --- Dynamic Floor Layer (Uncached) --- */}
                <Group {...(viewMode === '3d' ? isometricProps : {})}>
                    <ConnectionLines stations={stations} agents={agents} width={width} height={height} viewMode={viewMode} />

                    {/* Station Bases (Skewed) */}
                    {stations.map((station) => (
                        <StationBaseNode
                            key={`base-${station.id}`}
                            station={station}
                            // Pass full agent object if valid, else null
                            agent={station.agentId ? agents[station.agentId] : null}
                            isEditing={isEditing}
                            isSelected={selectedId === station.id}
                            onSelect={handleSelect}
                            onChange={onStationChange}
                        />
                    ))}

                    {/* Avatars (rendered in isometric space, above stations) */}
                    {stations.map(station => {
                        const agent = station.agentId ? agents[station.agentId] : null;
                        if (!agent) return null;

                        const status = agent.status || 'offline';
                        const statusColor = getStatusColor(status);
                        const isActive = status !== 'offline';

                        return (
                            <AvatarNode
                                key={`avatar-${station.id}`}
                                src={agent.avatar}
                                x={station.x}
                                y={station.y - 50}
                                size={60}
                                statusColor={statusColor}
                                isActive={isActive}
                                copilotOnline={!!agent.copilotOnline}
                            />
                        );
                    })}
                </Group>

                {/* --- Top Layer: Holographic HUD (Upright) --- */}
                <Group>
                    {/* Walls (Glass Partitions) - Use projectPoint internally */}
                    {walls.map((wall, i) => (
                        <WallNode
                            key={`wall-${i}`}
                            {...wall}
                            width={width}
                            heightCanvas={height}
                            viewMode={viewMode}
                            label={i % 2 === 0 ? "ZONE A // SALES" : "ZONE B // SUPPORT"}
                        />
                    ))}

                    {/* Global Vignette / Bloom Overlay (fake) */}
                    <Rect width={width} height={height} fill="transparent" stroke="rgba(0,0,0,0.5)" strokeWidth={100} listening={false} />

                    {/* Screen Overlays */}
                    <Text
                        text={`NEXUS CONNECT // ${viewMode === '3d' ? 'ISOMETRIC' : 'TOP-DOWN'} // LIVE`}
                        x={20}
                        y={20}
                        fontSize={14}
                        fontFamily="ui-monospace, Consolas, monospace"
                        fill="#60a5fa" // Lighter blue
                        opacity={0.9}
                        shadowColor="#3b82f6"
                        shadowBlur={10}
                    />
                    <Text
                        text="SYSTEM STATUS: ONLINE"
                        x={width - 200}
                        y={20}
                        fontSize={12}
                        fontFamily="ui-monospace, Consolas, monospace"
                        fill="#4ade80"
                        opacity={0.8}
                        shadowColor="#4ade80"
                        shadowBlur={5}
                    />
                </Group>
            </Layer>
        </Stage >
    );
};
