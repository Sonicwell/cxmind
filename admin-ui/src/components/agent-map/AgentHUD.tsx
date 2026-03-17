import React from 'react';
import { projectPoint, getStatusColor, getGlowColor } from './utils';
import { Button } from '../ui/button';

interface AgentHUDProps {
    width: number;
    height: number;
    stations: any[];
    agents: Record<string, any>;
    viewState: { x: number, y: number, scale: number };
    viewMode: '2d' | '3d';
    onSelect: (id: string) => void;
    selectedId: string | null;
}

export const AgentHUD: React.FC<AgentHUDProps> = ({
    width,
    height,
    stations,
    agents,
    viewState,
    viewMode,
    onSelect,
    selectedId
}) => {
    return (
        <div
            className="absolute top-0 left-0 pointer-events-none overflow-hidden"
            style={{ width, height, pointerEvents: 'none' }}
        >
            {/* Center Debug Dot (Optional, remove for prod) */}
            {/* <div className="absolute w-2 h-2 bg-red-500 rounded-full" style={{ left: width/2 * viewState.scale + viewState.x, top: height/2 * viewState.scale + viewState.y, transform: 'translate(-50%, -50%)' }} /> */}

            {stations.map(station => {
                const agent = station.agentId ? agents[station.agentId] : null;
                const status = agent?.status || 'offline';
                const statusColor = getStatusColor(status);
                const glowColor = getGlowColor(status);

                // Project logical coordinates to Canvas space
                const p = projectPoint(station.x, station.y, width, height, viewMode);

                // Apply ViewState (Pan/Zoom) Transform
                // screenX = (logicalX * scale) + panX
                // NOTE: The Stage transform is: x + ptr * scale ... wait.
                // The Stage transform is simply: x, y is offset, scale is scale.
                // Konva stage transform: ctx.translate(x, y); ctx.scale(scale, scale);
                // So screenX = p.x * scale + viewState.x
                const screenX = p.x * viewState.scale + viewState.x;
                const screenY = p.y * viewState.scale + viewState.y;

                // Visibility Check (Culling)
                if (screenX < -100 || screenX > width + 100 || screenY < -100 || screenY > height + 100) return null;

                const isSelected = selectedId === station.id;
                const isActive = ['oncall', 'ring', 'available'].includes(status);

                return (
                    <div
                        key={station.id}
                        className="absolute flex flex-col items-center pointer-events-auto transition-all duration-300"
                        style={{
                            left: screenX,
                            top: screenY - 45 * viewState.scale, // Offset up like the old HUD
                            transform: 'translate(-50%, -50%)', // Center pivot
                            zIndex: isSelected ? 50 : 10
                        }}
                        onClick={() => onSelect(station.id)}
                    >
                        {/* Status Badge (replacing the ring/orb text) */}
                        {/* Avatars are now rendered in Canvas layer (MapCanvas.tsx) */}

                        {/* Status Card (Floating above) */}
                        {(isSelected || isActive) && (
                            <div
                                className="absolute bottom-full mb-2 organic-hud-panel border border-opacity-50 rounded-lg p-3 shadow-lg flex flex-col gap-1 min-w-[160px] animate-in fade-in slide-in-from-bottom-2 duration-200 z-50"
                                style={{
                                    backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                    borderColor: statusColor,
                                    boxShadow: `0 4px 20px ${glowColor}40`
                                }}
                            >
                                {/* Header */}
                                <div className="flex justify-between items-center border-b border-gray-700 pb-1 mb-1">
                                    <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">
                                        {agent?.name || 'Unknown'}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        {station.label}
                                    </span>
                                </div>

                                {/* Body */}
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="w-2 h-2 rounded-full animate-pulse"
                                            style={{ backgroundColor: statusColor }}
                                        />
                                        <span className="text-xs text-gray-300 font-mono">
                                            {status.toUpperCase()}
                                        </span>
                                    </div>
                                    {status === 'oncall' && (
                                        <span className="text-xs text-cyan-400 font-mono">03:12</span>
                                    )}
                                </div>

                                {/* Action Buttons (Interactive HTML!) */}
                                {isSelected && (
                                    <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
                                        <Button variant="none" className="flex-1 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 text-[10px] py-1 px-2 rounded border border-cyan-800 transition-colors">
                                            LISTEN
                                        </Button>
                                        <Button variant="none" className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 text-[10px] py-1 px-2 rounded border border-red-800 transition-colors">
                                            BARGE
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Minimal Label if inactive? Or relying on Canvas Avatar for clicking?
                            If we want clicking the *person* to select, we need a hit area here or rely on Canvas click passing through.
                            We made this div `pointer-events-auto`. 
                            If the user clicks the Avatar (Canvas), `MapCanvas` handles it.
                            If they click this Card (HTML), this div handles it.
                            Ideally we need a transparent hit box over the avatar area too if we want HTML to handle all "Select" logic?
                            No, let's keep Canvas handling "Scene Object" selection, and this HUD handles "Card Interaction".
                        */}
                    </div>
                );
            })}
        </div>
    );
};
