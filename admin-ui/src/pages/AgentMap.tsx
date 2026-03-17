import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
// import { MapCanvas } from '../components/agent-map/MapCanvas'; // Konva 2D fallback
import { MapCanvas3D } from '../components/agent-map/MapCanvas3D';
import { MapLegend } from '../components/agent-map/MapLegend';
import { ConfigPanel } from '../components/agent-map/ConfigPanel';
import { ZoneOverlay } from '../components/agent-map/ZoneOverlay';
import { useSimulation } from '../components/agent-map/SimulationController';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import screenfull from 'screenfull';
import { useWebSocket } from '../context/WebSocketContext';
import { FloorManager } from '../components/agent-map/FloorManager';
import { OperationsCard } from '../components/agent-map/ui/OperationsCard';
import { AgentDetailCard } from '../components/agent-map/ui/AgentDetailCard';
import { DashboardProvider } from '../dashboard/DashboardContext';
import LiveCallsCard from '../components/agent-map/ui/LiveCallsCard';

class WebGLFallbackBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { hasError: boolean }> {
    state = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: Error) {
        console.warn("WebGL or Canvas error caught:", error.message);
    }
    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}
// Components LiveCallsCard from '../components/agent-map/ui/LiveCallsCard';
import AlertFeedCard from '../components/agent-map/ui/AlertFeedCard';
import QualityStatsCard from '../components/agent-map/ui/QualityStatsCard';
import BehaviorCard from '../components/agent-map/ui/BehaviorCard';
import LeaderboardCard from '../components/agent-map/ui/LeaderboardCard';
import OutcomeCard from '../components/agent-map/ui/OutcomeCard';
import EmotionCard from '../components/agent-map/ui/EmotionCard';
import { useFatigueDetect } from '../components/agent-map/useFatigueDetect';
import { toast } from 'react-hot-toast';
import { getLayouts, getLayoutStats, getAgents, getSipOnlineAgents, getPlatformSettings } from '../services/api';
import { getMockLayouts, getMockLayoutStats, getMockAgents } from '../services/mock-data';
import { usePreference } from '../hooks/usePreference';
import { useDemoMode } from '../hooks/useDemoMode';
import { CARD_CATALOG } from '../components/agent-map/card-registry';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ConfiguredStatus } from '../components/agent-map/utils';
import '../styles/agent-map.css';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { Eye, EyeOff, Flame, Search, Filter, X, Settings, Monitor, PanelLeftClose, PanelRightClose, Users } from 'lucide-react';

import { Button } from '../components/ui/button';

const EMPTY_ARRAY: any[] = [];


/* ═══════════ Multi-Floor Zone Definitions ═══════════ */

type FloorId = string;

interface CallConnection {
    id: string;
    type: 'agent-customer' | 'agent-agent';
    agentStationIdx: number;
    targetStationIdx?: number;       // for agent-agent
    zoneIndex: number;
}

interface ZoneQueueData {
    zoneIndex: number;
    activeCallCount: number;         // customers in-call (inside customer sub-area)
    queueCount: number;              // customers waiting (outside zone)
    avgWaitTimeSec: number;          // average wait time → agitation level
}

interface FloorDef {
    id: FloorId;
    floorId: string; // Add this
    _id?: string; // MongoDB ID for uniqueness
    label: string;
    width: number;
    height: number;
    zoneLayout: { zone: number; x: number; y: number; w: number; h: number; cols: number; rows: number }[];
    zoneDefs: { name: string; color: string; xMin: number; xMax: number; yMin: number; yMax: number }[];
    agentAssignments: Record<string, any>;
    callConnections: CallConnection[];
    zoneQueues: ZoneQueueData[];
    zoneQuality: { zoneIndex: number; avgScore: number; inspections: number; excellentCount: number; goodCount: number; poorCount: number; topAgent?: string; topAgentScore?: number; trend: 'up' | 'down' | 'stable' }[];
}

const generateStations = (floor: FloorDef) => {
    const stations: any[] = [];
    let idx = 0;

    for (const zl of floor.zoneLayout) {
        // Reserve bottom 12% of zone height for QI Card area
        const reservedH = Math.max(20, zl.h * 0.12);
        const effectiveH = zl.h - reservedH;

        const colSpacing = (zl.w - 80) / Math.max(zl.cols - 1, 1);
        const rowSpacing = (effectiveH - 80) / Math.max(zl.rows - 1, 1);
        const count = zl.cols * zl.rows;

        for (let r = 0; r < zl.rows; r++) {
            for (let c = 0; c < zl.cols; c++) {
                if (r * zl.cols + c >= count) break;
                const assignment = floor.agentAssignments[idx];
                // Check if assignment has override coordinates
                const overrideX = (assignment as any)?.x;
                const overrideY = (assignment as any)?.y;

                stations.push({
                    id: `st_${floor.id}_${String(idx + 1).padStart(3, '0')}`,
                    x: typeof overrideX === 'number' ? overrideX : (zl.x + 40 + c * colSpacing),
                    y: typeof overrideY === 'number' ? overrideY : (zl.y + 40 + r * rowSpacing),
                    type: 'desk_standard',
                    agentId: assignment?.agentId || null,
                    label: (assignment as any)?.label || String(idx + 1).padStart(3, '0'), // Also allow label override
                    zone: zl.zone,
                });
                idx++;
            }
        }
    }
    return stations;
};

const generateWalls = (floor: FloorDef) => {
    const walls: any[] = [];
    for (const zl of floor.zoneLayout) {
        const { x, y, w, h, zone } = zl;
        walls.push(
            { x1: x, y1: y, x2: x + w, y2: y, height: 80, zone },
            { x1: x + w, y1: y, x2: x + w, y2: y + h, height: 80, zone },
            { x1: x + w, y1: y + h, x2: x, y2: y + h, height: 80, zone },
            { x1: x, y1: y + h, x2: x, y2: y, height: 80, zone },
        );
    }
    return walls;
};

const AgentMapContent: React.FC = () => {
    const { t } = useTranslation();
    const [layouts, setLayouts] = useState<Record<string, FloorDef>>({});
    const [isPending, startTransition] = React.useTransition();
    const [floorOrder, setFloorOrder] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [configuredStatuses, setConfiguredStatuses] = useState<ConfiguredStatus[]>([]);
    const mapContainerRef = useRef<HTMLDivElement>(null);

    // ── Slot Grid Types (needed before defaultPrefs) ──
    type CardType = 'operations' | 'agent' | 'live-calls' | 'alerts' | 'quality' | 'outcomes' | 'behavior' | 'leaderboard' | 'emotion';
    interface SlotCard { type: CardType; agentId?: string; }
    const SLOT_COUNT = 8;

    // ── Server-synced preferences (floor, slots, viewMode) ──
    const defaultPrefs = useMemo(() => ({
        currentFloor: 'GF',
        viewMode: '3d' as '2d' | '3d',
        slots: (() => {
            const init: (SlotCard | null)[] = new Array(SLOT_COUNT).fill(null);
            init[1] = { type: 'operations' as CardType };
            init[3] = { type: 'live-calls' as CardType };
            init[5] = { type: 'alerts' as CardType };
            return init;
        })(),
    }), []);
    const { data: prefs, save: savePrefs } = usePreference('agent_map_prefs', defaultPrefs);

    const [currentFloor, setCurrentFloor] = useState<string>(prefs?.currentFloor ?? 'GF');
    const [isFloorManagerOpen, setIsFloorManagerOpen] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [tvMode, setTvMode] = useState(false);
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    const [floorTransitioning, setFloorTransitioning] = useState(false);

    // Smooth floor switch with fade transition
    const switchFloor = useCallback((fid: string) => {
        if (fid === currentFloor) return;
        setFloorTransitioning(true); // fade out
        setTimeout(() => {
            startTransition(() => {
                setCurrentFloor(fid);
                setFloorTransitioning(false); // fade in
            });
        }, 150);
    }, [currentFloor]);

    // Locked Hover Cards (max 10)
    const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());
    const toggleCardLock = useCallback((agentId: string) => {
        setLockedCardIds(prev => {
            const next = new Set(prev);
            if (next.has(agentId)) {
                next.delete(agentId);
            } else {
                if (next.size >= 10) return prev; // Max 10 limit
                next.add(agentId);
            }
            return next;
        });
    }, []);

    // Filtering State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['all']));
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
    const [groupFilter, setGroupFilter] = useState<string>('all');
    const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
    const [groupList, setGroupList] = useState<{ _id: string; name: string; code: string }[]>([]);


    const { user } = useAuth();
    const canManageFloors = user?.role === 'platform_admin' || user?.role === 'supervisor';

    const { demoMode } = useDemoMode();
    const { theme } = useTheme();

    // Fetch Data
    const fetchData = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            // 1. Fetch Layouts (mock or real)
            const layoutData = demoMode ? await getMockLayouts() : await getLayouts();
            if (!layoutData || layoutData.length === 0) {
                // If no layouts, we might still want to open manager
                if (canManageFloors) {
                    setFloorOrder([]);
                    setLayouts({});
                    setLoading(false);
                    return;
                }
                throw new Error('No layouts found. Please seed data.');
            }

            // Phase 1: Render Map Shell Instantly
            const tempLayouts: Record<string, FloorDef> = {};
            const activeOrder: string[] = [];
            layoutData.forEach((l: any) => {
                activeOrder.push(l.floorId);
                const cleanedAssignments: Record<string, any> = {};
                for (const [key, val] of Object.entries(l.agentAssignments || {})) {
                    if (key === '_systemQueue') {
                        cleanedAssignments[key] = val;
                        continue;
                    }
                    const { status, ...persistedFields } = val as any;
                    if (Object.keys(persistedFields).length > 0) {
                        cleanedAssignments[key] = persistedFields;
                    }
                }
                tempLayouts[l.floorId] = {
                    id: l.floorId,
                    floorId: l.floorId,
                    _id: l._id,
                    label: l.label,
                    width: l.width,
                    height: l.height,
                    zoneLayout: l.zoneLayout,
                    zoneDefs: l.zoneDefs,
                    agentAssignments: cleanedAssignments,
                    callConnections: [],
                    zoneQueues: [],
                    zoneQuality: [],
                };
            });

            setFloorOrder(activeOrder);
            setLayouts(tempLayouts);
            if ((!currentFloor || !tempLayouts[currentFloor]) && activeOrder.length > 0) {
                setCurrentFloor(activeOrder[0]);
            }
            if (!silent) setLoading(false);

            // Phase 2: Fetch Live Stats & Agents Concurrently
            const statsPromises = layoutData.map((l: any) =>
                (demoMode ? getMockLayoutStats(l.floorId) : getLayoutStats(l.floorId)).catch((err: any) => {
                    console.warn(`Failed to fetch stats for ${l.floorId}`, err);
                    return { agentAssignments: {}, zoneQueues: [], callConnections: [], zoneQuality: [] };
                })
            );

            const agentsPromise = (demoMode ? getMockAgents() : getAgents()).catch((err: any) => {
                console.warn('Failed to fetch agents list', err);
                return null;
            });

            const groupsPromise = (!demoMode ? import('../services/api').then(m => m.default.get('/groups')) : Promise.resolve(null)).catch(() => null);

            const sipOnlinePromise = (!demoMode ? getSipOnlineAgents() : Promise.resolve({ online: [], copilotOnline: [] })).catch((err: any) => {
                console.warn('Failed to fetch SIP-online status', err);
                return { online: [], copilotOnline: [] };
            });

            const settingsPromise = getPlatformSettings().catch(() => null);

            const [statsResults, agentsRes, groupsRes, sipOnlineRes, settingsRes] = await Promise.all([
                Promise.all(statsPromises),
                agentsPromise,
                groupsPromise,
                sipOnlinePromise,
                settingsPromise
            ]);

            // Phase 3: Hydrate Live Data
            setLayouts(prev => {
                const next = { ...prev };
                layoutData.forEach((l: any, index: number) => {
                    if (!next[l.floorId]) return;
                    const stats = statsResults[index];
                    const mergedAssignments = { ...next[l.floorId].agentAssignments };

                    if (stats.agentAssignments) {
                        Object.entries(stats.agentAssignments).forEach(([key, val]: [string, any]) => {
                            mergedAssignments[key] = {
                                ...(mergedAssignments[key] || {}), // Persisted
                                ...val // Live
                            };
                        });
                    }

                    next[l.floorId] = {
                        ...next[l.floorId],
                        agentAssignments: mergedAssignments,
                        callConnections: stats.callConnections || [],
                        zoneQueues: stats.zoneQueues || [],
                        zoneQuality: stats.zoneQuality || [],
                    };
                });
                return next;
            });


            // 4. Process Agents
            if (agentsRes) {
                const rawData = agentsRes.data;
                const agentList = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.data) ? rawData.data : []);

                const agentMap: Record<string, any> = {};
                const onlineSet = new Set(sipOnlineRes.online);
                const copilotSet = new Set(sipOnlineRes.copilotOnline);

                agentList.forEach((a: any) => {
                    const id = a._id || a.id;
                    const { status: _dbStatus, ...rest } = a;
                    const sipNum = a.sipNumber;

                    const isSipOnline = sipNum ? onlineSet.has(sipNum) : false;
                    const isCopilotOnline = sipNum ? copilotSet.has(sipNum) : false;

                    const finalStatus = (isSipOnline || isCopilotOnline)
                        ? (a.availabilityStatus && a.availabilityStatus !== 'offline' ? a.availabilityStatus : 'available')
                        : (a.availabilityStatus || 'offline');

                    agentMap[id] = {
                        ...rest,
                        id: id,
                        name: a.boundUser?.displayName || a.displayName || `Agent ${a.sipNumber || 'Unknown'}`,
                        displayName: a.boundUser?.displayName || a.displayName || `Agent ${a.sipNumber || 'Unknown'}`,
                        sipNumber: a.sipNumber,
                        groupId: a.groupId || null,
                        status: finalStatus,
                        availabilityStatus: a.availabilityStatus,
                        copilotOnline: isCopilotOnline,
                        avatar: a.boundUser?.avatar || `/avatars/agent_${(parseInt((a.sipNumber || '0').slice(-3)) % 6 + 1)}.png`,
                        lastStatusChange: new Date().toISOString(),
                    };
                });

                setAgents(prev => ({ ...prev, ...agentMap }));
            }

            if (groupsRes && groupsRes.data?.data) {
                setGroupList(groupsRes.data.data);
            }

            // 5. Setup Settings
            if (settingsRes?.agentStatuses?.length) {
                setConfiguredStatuses(settingsRes.agentStatuses);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load map data');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [demoMode]);


    const floorDef = layouts[currentFloor];

    // Memoize stations and walls based on floorDef
    const stations = useMemo(() => {
        if (!floorDef) return [];
        return generateStations(floorDef);
    }, [floorDef]);

    const walls = useMemo(() => {
        if (!floorDef) return [];
        return generateWalls(floorDef);
    }, [floorDef]);

    const [agents, setAgents] = useState<Record<string, any>>({});

    // Synchronous initial agents derived from floorDef + stations
    // This prevents the black flash caused by the async useEffect gap
    const initialAgents = useMemo(() => {
        if (!floorDef || stations.length === 0) return {};
        const result: Record<string, any> = {};

        // Note: agentAssignments.status is the DB management status ('active'/'inactive'),
        // NOT the runtime SIP status. Runtime status defaults to 'offline' and is
        // updated by WebSocket events or simulation.
        stations.forEach(st => {
            if (st.agentId) {
                result[st.agentId] = {
                    id: st.agentId,
                    name: `Agent ${st.agentId.slice(-3)}`,
                    status: 'offline',
                    lastStatusChange: new Date().toISOString(),
                    avatar: `/avatars/agent_${(parseInt(st.agentId.slice(-3)) % 6 + 1)}.png`,
                };
            }
        });
        return result;
    }, [floorDef, stations]);

    // Filter Stations Logic
    const filteredStationIds = useMemo(() => {
        if (!searchTerm && statusFilter.has('all') && groupFilter === 'all') return null;

        const ids = new Set<string>();
        stations.forEach(st => {
            const agent = st.agentId ? agents[st.agentId] : null;
            const status = agent?.status || 'offline';

            // Status Filter
            if (!statusFilter.has('all')) {
                if (!statusFilter.has(status)) return;
            }

            // Group Filter
            if (groupFilter !== 'all') {
                if (!agent?.groupId || agent.groupId !== groupFilter) return;
            }

            // Search Filter — match sipNumber or displayName only
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                const sipMatch = agent?.sipNumber?.toLowerCase().includes(q);
                const displayMatch = agent?.displayName?.toLowerCase().includes(q);
                if (!sipMatch && !displayMatch) return;
            }

            ids.add(st.id);
        });
        return ids;
    }, [stations, agents, searchTerm, statusFilter, groupFilter]);

    // 换楼层时清空slot卡片
    useEffect(() => {
        if (floorDef) {
            startTransition(() => {
                setSlots(prev => prev.map(s => s?.type === 'agent' ? null : s));
            });
        }
    }, [floorDef?.floorId]);

    const [isEditing, setIsEditing] = useState(false);
    const [editSelectedStationId, setEditSelectedStationId] = useState<string | null>(null);
    const [selectedZoneIndex, setSelectedZoneIndex] = useState<number | null>(null);
    const [isSimulating, setIsSimulating] = useState(() => localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true');

    // Sync with Dashboard demoMode toggle (localStorage bridge)
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEYS.DEMO_MODE) {
                setIsSimulating(e.newValue === 'true');
            }
        };
        const onDemoChanged = () => {
            setIsSimulating(localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true');
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener('demo-mode-changed', onDemoChanged);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('demo-mode-changed', onDemoChanged);
        };
    }, []);

    // Auto-start simulation in demo mode
    useEffect(() => {
        if (demoMode && !isSimulating) {
            setIsSimulating(true);
        }
    }, [demoMode]);

    // ── Slot Grid Model ──
    const [slots, setSlots] = useState<(SlotCard | null)[]>(prefs?.slots ?? new Array(SLOT_COUNT).fill(null));
    const [viewMode, setViewMode] = useState<'2d' | '3d'>(prefs?.viewMode ?? '3d');

    // Persist slots + floor + viewMode to server
    // Use a ref to prevent infinite loops from `prefs` object re-renders
    const lastSavedPrefsRef = useRef<any>(prefs || defaultPrefs);
    useEffect(() => {
        const currentPrefs = {
            currentFloor,
            viewMode,
            slots,
        };
        // Simple deep equal check for the 3 fields we care about
        const isChanged = JSON.stringify(currentPrefs) !== JSON.stringify({
            currentFloor: lastSavedPrefsRef.current.currentFloor,
            viewMode: lastSavedPrefsRef.current.viewMode,
            slots: lastSavedPrefsRef.current.slots,
        });

        if (isChanged) {
            const nextPrefs = { ...(prefs || defaultPrefs), ...currentPrefs };
            lastSavedPrefsRef.current = nextPrefs;
            savePrefs(nextPrefs);
        }
    }, [slots, currentFloor, viewMode, defaultPrefs]);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const dragSrcIdx = useRef<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);


    // 点工位 toggle agent card
    const handleStationSelect = useCallback((stationId: string | null) => {
        if (!stationId) {
            if (isEditing) setEditSelectedStationId(null);
            return;
        }

        // In edit mode, select the station directly (any station, even vacant)
        if (isEditing) {
            setEditSelectedStationId(prev => prev === stationId ? null : stationId);
            return;
        }

        // In monitor mode, toggle agent card
        const st = stations.find(s => s.id === stationId);
        const agentId = st?.agentId;
        if (!agentId || !agents[agentId]) return;
        setSlots(prev => {
            // If agent already has a card, remove it
            const existingIdx = prev.findIndex(s => s?.type === 'agent' && s.agentId === agentId);
            if (existingIdx !== -1) {
                const next = [...prev];
                next[existingIdx] = null;
                return next;
            }
            // Find empty slot
            const emptyIdx = prev.findIndex(s => s === null);
            if (emptyIdx === -1) return prev; // all slots full
            const next = [...prev];
            next[emptyIdx] = { type: 'agent', agentId };
            return next;
        });
    }, [stations, agents, isEditing]);

    // Remove card from slot (close button)
    const handleRemoveCard = useCallback((idx: number) => {
        setSlots(prev => {
            const next = [...prev];
            next[idx] = null;
            return next;
        });
    }, []);

    // Drag-and-drop: move to empty slot OR swap
    const handleDragStart = useCallback((idx: number) => {
        console.log('Drag Start:', idx);
        dragSrcIdx.current = idx;
        setIsDragging(true);
    }, []);
    const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
        e.preventDefault();
        setDragOverIdx(idx);
    }, []);
    const handleDrop = useCallback((idx: number) => {
        const src = dragSrcIdx.current;
        if (src === null || src === idx) { setDragOverIdx(null); return; }
        setSlots(prev => {
            const next = [...prev];
            // Swap or move
            const temp = next[idx];
            next[idx] = next[src];
            next[src] = temp;
            return next;
        });
        setDragOverIdx(null);
        dragSrcIdx.current = null;
        setIsDragging(false);
        console.log('Drop Handled');
    }, []);
    const handleDragEnd = useCallback(() => {
        console.log('Drag End');
        setDragOverIdx(null);
        dragSrcIdx.current = null;
        setIsDragging(false);
    }, []);

    // Card picker — add closed cards back
    const [cardPickerOpen, setCardPickerOpen] = useState(false);
    const availableCards = useMemo(() => {
        const activeTypes = new Set(slots.filter(Boolean).map(s => s!.type));
        return CARD_CATALOG.filter(c => !activeTypes.has(c.type));
    }, [slots]);
    const handleAddCard = useCallback((type: CardType) => {
        setSlots(prev => {
            // Priority: Right Col (1,3,5,7) -> Left Col (0,2,4,6)
            const priorityOrder = [1, 3, 5, 7, 0, 2, 4, 6];
            const emptyIdx = priorityOrder.find(idx => prev[idx] === null);

            if (emptyIdx === undefined) return prev;

            const next = [...prev];
            next[emptyIdx] = { type };
            return next;
        });
        setCardPickerOpen(false);
    }, []);

    const [floorDropdownOpen, setFloorDropdownOpen] = useState(false);
    const [visibleFloors, setVisibleFloors] = useState<Set<FloorId>>(new Set());

    const toggleExtraFloor = (fid: FloorId) => {
        setVisibleFloors(prev => {
            const next = new Set(prev);
            if (next.has(fid)) next.delete(fid);
            else next.add(fid);
            return next;
        });
    };

    // 3D堆叠/2D列表用的楼层额外数据
    const extraFloorsData = useMemo(() => {
        if (!floorDef) return [];
        const extras: { floorId: FloorId; yOffset: number; stations: any[]; walls: any[]; zoneDefs: typeof floorDef.zoneDefs; callConnections: typeof floorDef.callConnections; zoneQueues: typeof floorDef.zoneQueues; zoneQuality: typeof floorDef.zoneQuality; agents: Record<string, any> }[] = [];

        const allFloors = floorOrder.filter(fid => fid !== currentFloor && visibleFloors.has(fid));

        // For 2D mode, compute cumulative z-offset based on layout heights
        // Each floor's height in world units ≈ (yMax - yMin) / 40, plus gap
        const getFloorDepth = (fd: FloorDef) => {
            const allY = fd.zoneDefs.flatMap(z => [z.yMin, z.yMax]);
            return (Math.max(...allY) - Math.min(...allY)) / 40 + 4; // 4 units gap
        };
        const currentFloorDepth = getFloorDepth(floorDef);

        // Separate floors above and below current
        const currentIdx = floorOrder.indexOf(currentFloor);
        let aboveOffset = -(currentFloorDepth / 2 + 2); // start above main floor
        let belowOffset = currentFloorDepth / 2 + 2;     // start below main floor

        allFloors.forEach(fid => {
            const fd = layouts[fid];
            if (!fd) return;

            const floorIdx = floorOrder.indexOf(fid);
            let yOffset: number;

            if (viewMode === '3d') {
                yOffset = (floorIdx - currentIdx) * 8;  // 8 units vertical spacing
            } else {
                // 2D: offset along z-axis (will be applied in ExtraFloorLayer)
                const depth = getFloorDepth(fd);
                if (floorIdx < currentIdx) {
                    yOffset = aboveOffset - depth / 2;
                    aboveOffset -= depth;
                } else {
                    yOffset = belowOffset + depth / 2;
                    belowOffset += depth;
                }
            }

            const sts = generateStations(fd);
            const wls = generateWalls(fd);
            // Build agents for this floor
            const floorAgents: Record<string, any> = {};
            sts.forEach((st: any) => {
                if (st.agentId) {

                    floorAgents[st.agentId] = {
                        id: st.agentId,
                        name: `Agent ${st.agentId.slice(-3)}`,
                        status: 'offline',
                        lastStatusChange: new Date().toISOString(),
                    };
                }
            });
            extras.push({
                floorId: fid,
                yOffset,
                stations: sts,
                walls: wls,
                zoneDefs: fd.zoneDefs,
                callConnections: fd.callConnections,
                zoneQueues: fd.zoneQueues,
                zoneQuality: fd.zoneQuality,
                agents: floorAgents,
            });
        });
        return extras;
    }, [viewMode, currentFloor, visibleFloors, layouts, floorOrder, floorDef]);



    // 全局队列统计
    const systemQueueData = useMemo(() => {
        if (!floorDef) return { queueCount: 0, activeCallCount: 0, avgWaitTimeSec: 0 };

        let totalQueue = 0;
        let totalActive = 0;
        let weightedWaitTime = 0;

        // Sum from current floor
        floorDef.zoneQueues.forEach(q => {
            totalQueue += q.queueCount;
            totalActive += q.activeCallCount;
            weightedWaitTime += q.avgWaitTimeSec * q.queueCount;
        });

        // Sum from extra visible floors
        extraFloorsData.forEach(ef => {
            ef.zoneQueues.forEach(q => {
                totalQueue += q.queueCount;
                totalActive += q.activeCallCount;
                weightedWaitTime += q.avgWaitTimeSec * q.queueCount;
            });
        });

        return {
            queueCount: totalQueue,
            activeCallCount: totalActive,
            avgWaitTimeSec: totalQueue > 0 ? Math.round(weightedWaitTime / totalQueue) : 0
        };
    }, [floorDef, extraFloorsData]);
    const DEFAULT_ZOOM = 35;
    const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
    const [mapPanOffset, setMapPanOffset] = useState<[number, number]>([0, 0]);

    // Responsive canvas sizing
    const canvasRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState<[number, number] | null>(null);

    const onResize = useCallback((width: number, height: number) => {
        const newWidth = Math.min(4096, Math.max(100, Math.round(width)));
        const newHeight = Math.min(4096, Math.max(100, Math.round(height)));
        setCanvasSize([newWidth, newHeight]);
    }, []);

    useEffect(() => {
        const el = canvasRef.current;
        if (!el) {
            return;
        }

        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                onResize(width, height);
            }
        });
        ro.observe(el);
        onResize(el.clientWidth || 1200, el.clientHeight || 800);
        return () => ro.disconnect();
    }, [loading]);

    // View State for Pan/Zoom
    // const [viewState] = useState({ x: 0, y: 0, scale: 1 });

    const { subscribe, connected } = useWebSocket();

    // Zoom percentage (relative to default = 100%)
    const zoomPercent = Math.round((mapZoom / DEFAULT_ZOOM) * 100);

    // Real-time Status Updates
    useEffect(() => {
        if (isSimulating || !connected) return;

        const handleStatusChange = (message: any) => {
            const data = message.data || message; // 兼容wrapped和直传格式
            if (!data.agentId) return;

            setAgents(prev => ({
                ...prev,
                [data.agentId]: {
                    ...prev[data.agentId],
                    status: data.status,
                    lastStatusChange: data.timestamp
                }
            }));
        };

        const unsubscribe = subscribe('agent:status_change', handleStatusChange);

        return () => {
            unsubscribe();
        };
    }, [subscribe, connected, isSimulating]);

    // 定时拉取批量坐席通话统计，注入 agents state 中
    useEffect(() => {
        let cancelled = false;
        const fetchBatchStats = async () => {
            try {
                let data: Record<string, { callCount: number; avgDuration: number }> = {};
                if (isSimulating) {
                    // Provide stable mock data based on sipNumber for demo purposes
                    Object.values(agents).forEach(a => {
                        if (a.sipNumber) {
                            const seed = parseInt(a.sipNumber) || 1234;
                            data[a.sipNumber] = {
                                callCount: 15 + (seed % 30),
                                avgDuration: 120 + (seed % 180)
                            };
                        }
                    });
                } else {
                    const res = await import('../services/api').then(m => m.default.get('/agent-stats/batch'));
                    data = res.data?.data || {};
                }
                
                if (cancelled || Object.keys(data).length === 0) return;

                setAgents(prev => {
                    const next = { ...prev };
                    // 通过 sipNumber 匹配 agent
                    for (const [sipNum, stats] of Object.entries(data)) {
                        const agentEntry = Object.entries(next).find(([, a]) => a.sipNumber === sipNum);
                        if (agentEntry) {
                            const [agentId, agent] = agentEntry;
                            next[agentId] = {
                                ...agent,
                                callsToday: stats.callCount,
                                avgHandleTime: `${Math.floor(stats.avgDuration / 60)}m ${stats.avgDuration % 60}s`,
                            };
                        }
                    }
                    return next;
                });
            } catch { /* 非关键, 静默失败 */ }
        };

        fetchBatchStats();
        const iv = setInterval(fetchBatchStats, 60_000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [isSimulating, agents]);

    // C2-P2: Fatigue Detection
    const { process: processFatigue } = useFatigueDetect(
        (agentId: string) => {
            const agent = agents[agentId];
            const name = agent?.name || `Agent ${agentId}`;
            toast.error(
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>{t('agentMap.fatigueAlert')}</span>
                    <span style={{ fontSize: '0.9em' }}>{t('agentMap.fatigueDesc', { name })}</span>
                </div>,
                { duration: 5000, icon: '⚠️' }
            );
        }
    );

    // C2-P2: Behavior snapshot subscription for stress aura
    const [stressMap, setStressMap] = useState<Map<string, { agent_id: string; stress_score: number; ts: number }>>(new Map());
    useEffect(() => {
        if (!connected) return;
        const unsubscribe = subscribe('behavior:snapshot', (message: any) => {
            const snap = message.data || message;
            const key = snap.agent_id || snap.call_id;
            if (!key) return;
            setStressMap(prev => {
                const next = new Map(prev);
                next.set(key, { agent_id: snap.agent_id, stress_score: snap.stress_score ?? 0, ts: snap.ts });
                // Evict stale entries (>30s)
                const cutoff = Date.now() - 30_000;
                for (const [k, v] of next) {
                    const vts = typeof v.ts === 'number' ? v.ts : 0;
                    if (vts < cutoff) next.delete(k);
                }

                // 更新后跑疲劳检测
                processFatigue(next);

                return next;
            });
        });
        return () => unsubscribe();
    }, [subscribe, connected, processFatigue]);

    // 换楼层时同步初始化agents
    // Using useEffect that merges state from the memoized initialAgents
    // Only add entries for agents not already in state (API data takes priority)
    useEffect(() => {
        if (Object.keys(initialAgents).length > 0) {
            setAgents(prev => {
                const merged = { ...prev };
                for (const [id, agent] of Object.entries(initialAgents)) {
                    if (!merged[id]) {
                        merged[id] = agent;
                    }
                }
                return merged;
            });
        }
    }, [initialAgents]);

    // Simulation Hook: 仅在模拟器从 ON→OFF 转换时重置状态
    // 不能依赖 stations 变化触发，否则 fetchData 获取的真实状态会被覆盖成 offline
    const prevSimulatingRef = useRef(isSimulating);
    useEffect(() => {
        const wasSimulating = prevSimulatingRef.current;
        prevSimulatingRef.current = isSimulating;

        // 仅处理 true→false 转换（模拟器被关闭）
        if (!wasSimulating || isSimulating) return;

        if (stations.length > 0) {
            setAgents(prev => {
                const updated = { ...prev };
                stations.forEach(st => {
                    if (st.agentId && updated[st.agentId]) {
                        updated[st.agentId] = {
                            ...updated[st.agentId],
                            status: 'offline',
                            lastStatusChange: new Date().toISOString(),
                        };
                    }
                });
                return updated;
            });
            // 模拟器关闭后重新拉取真实数据
            fetchData(true);
        }
    }, [isSimulating, stations]);



    useSimulation(isSimulating, stations, setAgents, setLayouts, currentFloor, setStressMap);

    // System Stats for critical alert mode (demo mode simulation)
    const [systemStats, setSystemStats] = useState<{ sipErrorRate: number; activeCalls: number } | null>(null);
    useEffect(() => {
        if (!isSimulating) { setSystemStats(null); return; }
        const update = () => {
            const isCritical = Math.random() > 0.85; // 15% chance
            setSystemStats({
                sipErrorRate: isCritical ? parseFloat((5.5 + Math.random() * 6.5).toFixed(1)) : parseFloat((0.1 + Math.random() * 2).toFixed(1)),
                activeCalls: Math.floor(5 + Math.random() * 20),
            });
        };
        update();
        const iv = setInterval(update, 8000); // 8s刷一次
        return () => clearInterval(iv);
    }, [isSimulating]);

    // Keyboard Shortcuts
    useEffect(() => {
        const PAN_STEP = 0.8; // world units per arrow key press (~35px on screen)
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    setMapZoom(DEFAULT_ZOOM);
                    setMapPanOffset([0, 0]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setMapPanOffset(prev => [prev[0], prev[1] + PAN_STEP]);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setMapPanOffset(prev => [prev[0], prev[1] - PAN_STEP]);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    setMapPanOffset(prev => [prev[0] + PAN_STEP, prev[1]]);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    setMapPanOffset(prev => [prev[0] - PAN_STEP, prev[1]]);
                    break;
                case 'h':
                case 'H':
                    setShowHeatmap(prev => !prev);
                    break;
                case 's':
                case 'S':
                    setIsSimulating(prev => !prev);
                    break;
                case 'f':
                case 'F':
                    console.log('F key pressed. Screenfull enabled:', screenfull.isEnabled, 'Is Fullscreen:', screenfull.isFullscreen);
                    if (screenfull.isEnabled && mapContainerRef.current) {
                        screenfull.toggle(mapContainerRef.current).catch(err => console.error('Screenfull error:', err));
                    } else {
                        console.warn('Fullscreen not supported or ref missing');
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setMapPanOffset]);

    // Sync tvMode with screenfull changes (ESC exit, etc.)
    useEffect(() => {
        if (!screenfull.isEnabled) return;
        const onChange = () => setTvMode(screenfull.isFullscreen);
        screenfull.on('change', onChange);
        return () => { screenfull.off('change', onChange); };
    }, []);

    // handleAddStation removed (not supported in auto-generated grid layout)

    const handleUpdateStation = (id: string, data: any) => {
        if (!floorDef) return;

        // 解析ID格式: st_{floorId}_{idx}
        // e.g., st_floor1_001 -> idx = 0
        const parts = id.split('_');
        const idxStr = parts.pop();
        if (!idxStr) return;

        // The station ID uses 1-based index padded to 3 digits
        const idx = parseInt(idxStr, 10) - 1;

        if (idx >= 0) {
            setLayouts(prev => {
                const floorToCheck = prev[currentFloor];
                if (!floorToCheck) return prev;

                const newFloor = { ...floorToCheck };
                // 新建ref避免mutation
                // Depending on structure, it's likely an object with numeric keys
                const newAssignments = { ...newFloor.agentAssignments };

                // Merge new data
                // agentAssignments keys are numbers in local interface but might be strings in JSON
                newAssignments[idx] = { ...(newAssignments[idx] || {}), ...data };
                newFloor.agentAssignments = newAssignments;

                return { ...prev, [currentFloor]: newFloor };
            });
        }
    };

    // handleDeleteStation removed (unused)

    // Zone layout change handler (from ConfigPanel zone editor)
    const handleZoneLayoutChange = useCallback((newZoneLayout: typeof floorDef.zoneLayout, newZoneDefs: typeof floorDef.zoneDefs) => {
        if (!floorDef) return;
        setLayouts(prev => {
            const floor = prev[currentFloor];
            if (!floor) return prev;

            // 新layout的station总数
            const newTotalStations = newZoneLayout.reduce((sum, zl) => sum + zl.cols * zl.rows, 0);

            // Clean up agentAssignments: only keep entries for valid station indices
            const oldAssignments = floor.agentAssignments || {};
            const cleanedAssignments: Record<string, any> = {};
            for (const [key, val] of Object.entries(oldAssignments)) {
                if (key === '_systemQueue') {
                    cleanedAssignments[key] = val;
                    continue;
                }
                const idx = parseInt(key, 10);
                if (!isNaN(idx) && idx >= 0 && idx < newTotalStations) {
                    cleanedAssignments[key] = val;
                }
            }

            return {
                ...prev,
                [currentFloor]: {
                    ...floor,
                    zoneLayout: newZoneLayout,
                    zoneDefs: newZoneDefs,
                    agentAssignments: cleanedAssignments,
                }
            };
        });
    }, [currentFloor, floorDef]);

    const handleZoneQueueChange = useCallback((zoneIndex: number, newAttrs: any) => {
        if (!floorDef) return;
        setLayouts(prev => {
            const floorToCheck = prev[currentFloor];
            if (!floorToCheck) return prev;

            const newZoneDefs = [...floorToCheck.zoneDefs];
            if (newZoneDefs[zoneIndex]) {
                newZoneDefs[zoneIndex] = { ...newZoneDefs[zoneIndex], ...newAttrs };
            }

            return {
                ...prev,
                [currentFloor]: {
                    ...floorToCheck,
                    zoneDefs: newZoneDefs
                }
            };
        });
    }, [floorDef, currentFloor]);

    const handleSystemQueueChange = useCallback((newAttrs: { x: number, y: number }) => {
        if (!floorDef) return;
        setLayouts(prev => {
            const floor = prev[currentFloor];
            if (!floor) return prev;

            const newAssignments = {
                ...floor.agentAssignments,
                _systemQueue: { x: newAttrs.x, y: newAttrs.y }
            };

            return {
                ...prev,
                [currentFloor]: {
                    ...floor,
                    agentAssignments: newAssignments
                }
            };
        });
    }, [floorDef, currentFloor]);

    // Auto-relayout: clear position overrides for stations in the target zone
    // so generateStations() recomputes positions from the current zone dimensions
    const handleAutoRelayout = useCallback((zoneIndex: number) => {
        if (!floorDef) return;
        // 这个zone的station index范围
        let startIdx = 0;
        for (let i = 0; i < zoneIndex; i++) {
            const zl = floorDef.zoneLayout[i];
            if (zl) startIdx += zl.cols * zl.rows;
        }
        const targetZone = floorDef.zoneLayout[zoneIndex];
        if (!targetZone) return;
        const count = targetZone.cols * targetZone.rows;

        setLayouts(prev => {
            const floor = prev[currentFloor];
            if (!floor) return prev;

            const newAssignments = { ...floor.agentAssignments };
            for (let i = startIdx; i < startIdx + count; i++) {
                if (newAssignments[i]) {
                    const { x, y, ...rest } = newAssignments[i];
                    newAssignments[i] = rest;
                }
            }

            return {
                ...prev,
                [currentFloor]: {
                    ...floor,
                    agentAssignments: newAssignments,
                },
            };
        });
    }, [floorDef, currentFloor]);

    // Zone move handler (from MapCanvas3D drag)
    const handleZoneMove = useCallback((zoneIndex: number, newX: number, newY: number) => {
        if (!floorDef) return;
        const newLayout = floorDef.zoneLayout.map((zl, i) =>
            i === zoneIndex ? { ...zl, x: Math.round(newX), y: Math.round(newY) } : zl
        );
        const newDefs = newLayout.map((zl, i) => ({
            name: floorDef.zoneDefs[i]?.name || `Zone ${zl.zone}`,
            color: floorDef.zoneDefs[i]?.color || '#6366f1',
            xMin: zl.x,
            xMax: zl.x + zl.w,
            yMin: zl.y,
            yMax: zl.y + zl.h,
        }));
        handleZoneLayoutChange(newLayout, newDefs);
    }, [floorDef, handleZoneLayoutChange]);

    // Zone resize handler (from MapCanvas3D drag)
    const handleZoneResize = useCallback((zoneIndex: number, newW: number, newH: number, newX?: number, newY?: number) => {
        if (!floorDef) return;
        const newLayout = floorDef.zoneLayout.map((zl, i) =>
            i === zoneIndex ? {
                ...zl,
                w: Math.max(100, Math.round(newW)),
                h: Math.max(100, Math.round(newH)),
                ...(newX !== undefined ? { x: Math.round(newX) } : {}),
                ...(newY !== undefined ? { y: Math.round(newY) } : {}),
            } : zl
        );
        const newDefs = newLayout.map((zl, i) => ({
            name: floorDef.zoneDefs[i]?.name || `Zone ${zl.zone}`,
            color: floorDef.zoneDefs[i]?.color || '#6366f1',
            xMin: zl.x,
            xMax: zl.x + zl.w,
            yMin: zl.y,
            yMax: zl.y + zl.h,
        }));
        handleZoneLayoutChange(newLayout, newDefs);
    }, [floorDef, handleZoneLayoutChange]);

    // Bulk update stations (for Auto-Assign / Unbind Zone)
    const handleBulkUpdateStations = useCallback((updates: Record<number, any>) => {
        setLayouts(prev => {
            const floor = prev[currentFloor];
            if (!floor) return prev;

            const newAssignments = { ...floor.agentAssignments };
            Object.entries(updates).forEach(([key, val]) => {
                const idx = parseInt(key);
                if (val === null) {
                    delete newAssignments[idx];
                } else {
                    const merged = {
                        ...(newAssignments[idx] || {}),
                        ...val
                    };
                    // Remove undefined keys
                    Object.keys(merged).forEach(k => {
                        if (merged[k] === undefined) delete merged[k];
                    });
                    newAssignments[idx] = merged;
                }
            });

            return {
                ...prev,
                [currentFloor]: {
                    ...floor,
                    agentAssignments: newAssignments
                }
            };
        });
    }, [currentFloor]);

    // Seed Data Helper - Removed for Production/Global Demo
    // const handleSeedData = async () => ...

    // In edit mode, use editSelectedStationId; in monitor mode, use agent slot
    const selectedStation = isEditing
        ? stations.find(s => s.id === editSelectedStationId) || null
        : stations.find(s => {
            const firstAgentSlot = slots.find(sl => sl?.type === 'agent');
            if (!firstAgentSlot?.agentId) return false;
            return s.agentId === firstAgentSlot.agentId;
        }) || null;

    // Loading Overlay Logic is now handled inside the structure instead of early return
    // to prevent Canvas context loss on re-mounts.

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
                <div className="text-center p-8 bg-gray-800 rounded-lg">
                    <h2 className="text-xl text-red-400 mb-2">{t('agentMap.errorLoadingMap')}</h2>
                    <p className="mb-4">{error}</p>
                    <Button variant="none" onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">
                        {t('agentMap.retry')}
                    </Button>
                </div>
            </div>
        );
    }

    // Check for floor def only after loading check to allow preservation of view
    // if (!floorDef) return null; // Removed to prevent unmount

    return (
        <div className={`agent-map-container ${tvMode ? 'tv-mode' : ''}`} ref={mapContainerRef}>

            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm text-white">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
                        <p>{t('common.loading', 'Loading...')}</p>
                    </div>
                </div>
            )}

            {/* Main Canvas Area — toolbar always visible */}
            <div className="map-content-area">
                {/* Header Toolbar */}
                <div className="map-toolbar">
                    <div className="sim-indicator">
                        <h1 className="text-white font-bold text-lg mr-4">{t('agentMap.liveFloorView')}</h1>
                        <div className="toggle-group mr-4">
                            <Button
                                variant="none"
                                onClick={() => { setIsEditing(false); setEditSelectedStationId(null); }}
                                className={`toggle-btn ${!isEditing ? 'active' : 'inactive'}`}
                            >
                                {t('agentMap.monitor')}
                            </Button>
                            <Button
                                variant="none"
                                onClick={() => {
                                    if (viewMode !== '2d') setViewMode('2d');
                                    setIsEditing(true);
                                }}
                                className={`toggle-btn ${isEditing ? 'active' : 'inactive'}`}
                                title={isEditing ? t('agentMap.exitEditMode') : t('agentMap.editLayoutSwitches')}
                            >
                                {t('agentMap.editLayout')}
                            </Button>
                        </div>

                        {/* Search & Filter Controls (Monitor Mode Only) */}
                        {!isEditing && floorDef && (
                            <div className="map-toolbar-group">
                                {/* Search */}
                                <div className="map-search-container">
                                    <Search size={14} className="map-search-icon" />
                                    <input
                                        type="text"
                                        placeholder={t('agentMap.searchPlaceholder')}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="map-search-input"
                                    />
                                    {searchTerm && (
                                        <Button
                                            variant="none"
                                            onClick={() => setSearchTerm('')} title={t('common.clear', 'Clear')}
                                            className="map-search-clear"
                                        >
                                            <X size={12} />
                                        </Button>
                                    )}
                                </div>

                                <div className="map-divider" />

                                {/* Status Filter */}
                                <div className="map-filter-container">
                                    {/* Status Filter Checkbox Dropdown */}
                                    <div className="map-filter-container relative">
                                        <Button variant="none" className="map-status-select-btn"
                                            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                                        >
                                            <span>
                                                {statusFilter.has('all')
                                                    ? t('agentMap.allStatus')
                                                    : t('agentMap.selected', { count: statusFilter.size })}
                                            </span>
                                            <Filter size={12} className="ml-2 opacity-70" />
                                        </Button>

                                        {statusDropdownOpen && (
                                            <div className="floor-dropdown-menu" style={{ minWidth: '160px', right: 0, left: 'auto' }}>
                                                {['all', 'online', 'on_call', 'available', 'break', 'offline'].map(st => (
                                                    <div
                                                        key={st}
                                                        className={`floor-dropdown-item ${statusFilter.has(st) ? 'active' : ''}`}
                                                        onClick={() => {
                                                            const newSet = new Set(statusFilter);
                                                            if (st === 'all') {
                                                                newSet.clear();
                                                                newSet.add('all');
                                                            } else {
                                                                if (newSet.has('all')) newSet.delete('all');

                                                                if (newSet.has(st)) {
                                                                    newSet.delete(st);
                                                                    if (newSet.size === 0) newSet.add('all');
                                                                } else {
                                                                    newSet.add(st);
                                                                }
                                                            }
                                                            setStatusFilter(newSet);
                                                        }}
                                                    >
                                                        <div className={`w-3 h-3 rounded-sm border mr-2 flex items-center justify-center ${statusFilter.has(st) ? 'bg-blue-500 border-blue-500' : 'border-slate-500'}`}>
                                                            {statusFilter.has(st) && <div className="w-1.5 h-1.5 bg-white rounded-[1px]" />}
                                                        </div>
                                                        <span className="capitalize">{st.replace('_', ' ')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="map-divider" />

                                {/* Group Filter */}
                                <div className="map-filter-container relative">
                                    <Button variant="none" className="map-status-select-btn"
                                        onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
                                    >
                                        <Users size={12} className="mr-1 opacity-70" />
                                        <span>
                                            {groupFilter === 'all'
                                                ? t('agentMap.allGroups')
                                                : groupList.find(g => g._id === groupFilter)?.name || t('agentMap.group')}
                                        </span>
                                        <Filter size={12} className="ml-2 opacity-70" />
                                    </Button>
                                    {groupDropdownOpen && (
                                        <div className="floor-dropdown-menu" style={{ minWidth: '160px', right: 0, left: 'auto' }}>
                                            <div
                                                className={`floor-dropdown-item ${groupFilter === 'all' ? 'active' : ''}`}
                                                onClick={() => { setGroupFilter('all'); setGroupDropdownOpen(false); }}
                                            >
                                                {t('agentMap.allGroups')}
                                            </div>
                                            {groupList.map(g => (
                                                <div
                                                    key={g._id}
                                                    className={`floor-dropdown-item ${groupFilter === g._id ? 'active' : ''}`}
                                                    onClick={() => { setGroupFilter(g._id); setGroupDropdownOpen(false); }}
                                                >
                                                    {g.name}
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>#{g.code}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Floor Selector */}
                        <div className="floor-selector mr-2">
                            <Button variant="none" className="floor-select-btn"
                                onClick={() => setFloorDropdownOpen(!floorDropdownOpen)}
                            >
                                <span className="floor-icon">🏢</span>
                                <span className="floor-label">{layouts[currentFloor]?.label || t('agentMap.selectFloor', 'Select Floor')}</span>
                                <span className="chevron-icon">▼</span>
                            </Button>
                            {floorDropdownOpen && (
                                <ul className="floor-dropdown-menu">
                                    {floorOrder.length === 0 && (
                                        <li className="floor-dropdown-item" style={{ opacity: 0.5, cursor: 'default' }}>
                                            <span className="floor-name">{t('agentMap.noFloorsAvailable')}</span>
                                        </li>
                                    )}
                                    {floorOrder.map(fid => {
                                        const isActive = fid === currentFloor;
                                        const isExtra = visibleFloors.has(fid);
                                        return (
                                            <li
                                                key={fid}
                                                className={`floor-dropdown-item ${isActive ? 'active' : ''}`}
                                                onClick={() => {
                                                    switchFloor(fid);
                                                    setFloorDropdownOpen(false);
                                                }}
                                            >
                                                <div className="floor-item-left" onClick={e => e.stopPropagation()}>
                                                    {!isActive && (
                                                        <Button
                                                            variant="none"
                                                            className={`floor-vis-btn ${isExtra ? 'visible' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                startTransition(() => {
                                                                    toggleExtraFloor(fid);
                                                                });
                                                            }}
                                                            title={isExtra ? t('agentMap.hideFloor', 'Hide Floor') : t('agentMap.showFloor', 'Show Floor')}
                                                        >
                                                            {isExtra ? <Eye size={14} /> : <EyeOff size={14} />}
                                                        </Button>
                                                    )}
                                                    {isActive && <span className="floor-active-dot" />}
                                                </div>

                                                <span className="floor-name">{layouts[fid]?.label}</span>

                                                {/* Show ID only if different from label */}
                                                {fid !== layouts[fid]?.label && (
                                                    <span className="floor-id-tag ml-2">{fid}</span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {/* Manage Button */}
                        <div className="floor-dropdown">
                            {canManageFloors && (
                                <Button
                                    variant="none"
                                    onClick={() => setIsFloorManagerOpen(true)}
                                    className="map-icon-btn"
                                    title={t('agentMap.manageFloors')}
                                >
                                    <Settings size={14} />
                                </Button>
                            )}
                        </div>


                        {/* View Mode Toggle */}
                        <div className="toggle-group ml-4">
                            <Button
                                variant="none"
                                onClick={() => setViewMode('2d')}
                                className={`toggle-btn ${viewMode === '2d' ? 'active' : 'inactive'}`}
                            >
                                2D
                            </Button>
                            <Button
                                variant="none"
                                onClick={() => { setViewMode('3d'); setIsEditing(false); }}
                                className={`toggle-btn ${viewMode === '3d' ? 'active' : 'inactive'}`}
                            >
                                3D
                            </Button>
                            <Button
                                variant="none"
                                onClick={() => setShowHeatmap(!showHeatmap)}
                                className={`toggle-btn ${showHeatmap ? 'active' : 'inactive'}`}
                                title={t('agentMap.toggleHeatmap', 'Toggle Heatmap')}
                                style={{ marginLeft: '1px' }}
                            >
                                <Flame size={14} className={showHeatmap ? 'text-orange-500' : ''} />
                            </Button>
                            <Button
                                variant="none"
                                onClick={() => {
                                    if (screenfull.isEnabled && mapContainerRef.current) {
                                        screenfull.toggle(mapContainerRef.current).catch(err => console.error('Screenfull error:', err));
                                    }
                                }}
                                className={`toggle-btn ${tvMode ? 'active' : 'inactive'}`}
                                title={tvMode ? t('agentMap.exitTvMode', 'Exit TV Mode (F)') : t('agentMap.tvMode', 'TV Mode (F)')}
                                style={{ marginLeft: '1px' }}
                            >
                                <Monitor size={14} />
                            </Button>
                        </div>

                        {/* Zoom Controls */}
                        <div className="zoom-controls ml-4 mr-4">
                            <Button variant="none" onClick={() => setMapZoom(z => Math.max(10, z - 5))} className="zoom-btn">-</Button>
                            <span className="zoom-label">{zoomPercent}%</span>
                            <Button variant="none" onClick={() => setMapZoom(z => Math.min(120, z + 5))} className="zoom-btn">+</Button>
                            <Button
                                variant="none"
                                onClick={() => setMapZoom(DEFAULT_ZOOM)}
                                className="zoom-btn"
                                title={t('agentMap.resetZoom', 'Reset to 100%')}
                                style={{ marginLeft: 4, fontSize: '14px', opacity: zoomPercent === 100 ? 0.4 : 1 }}
                            >
                                ⊙
                            </Button>
                        </div>

                        {/* Simulation Toggle — hidden in demo mode (always live) */}
                        {!demoMode && (
                            <div className="sim-indicator">
                                <span className={`sim-text mr-2 ${isSimulating ? 'active' : 'inactive'}`}>
                                    ● {isSimulating ? t('agentMap.simulationLive') : t('agentMap.realTime')}
                                </span>
                                <ToggleSwitch
                                    checked={isSimulating}
                                    onCheckedChange={setIsSimulating}
                                    size="sm"
                                    variant="success"
                                />
                            </div>
                        )}
                    </div>


                </div>




                {/* Canvas Container */}
                <div className="canvas-container">
                    {!floorDef && !loading ? (
                        /* Empty state when no floors exist */
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            gap: '16px',
                            color: '#94a3b8',
                        }}>
                            <span style={{ fontSize: '48px' }}>🏢</span>
                            <p style={{ fontSize: '16px', margin: 0 }}>{t('agentMap.noFloorsConfigured')}</p>
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px' }}>
                                {t('agentMap.noFloorsHint')}
                            </p>
                            {canManageFloors && (
                                <div style={{ marginTop: '8px' }}>
                                    <Button
                                        variant="none"
                                        onClick={() => setIsFloorManagerOpen(true)}
                                        style={{
                                            padding: '8px 20px',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(0,245,212,0.4)',
                                            background: 'rgba(0,245,212,0.1)',
                                            color: '#6C4BF5',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                        }}
                                    >
                                        {t('agentMap.manageFloors')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="canvas-wrapper" ref={canvasRef} style={{ width: '100%', height: '100%', opacity: floorTransitioning ? 0 : isPending ? 0.7 : 1, transition: floorTransitioning ? 'opacity 0.25s ease-out' : 'opacity 0.3s ease-in' }}>
                            {canvasSize && (
                                <WebGLFallbackBoundary fallback={
                                    <div className="flex items-center justify-center w-full h-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                                        <div className="text-center p-6 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] shadow-lg max-w-md">
                                            <svg className="w-12 h-12 mx-auto text-[var(--accent-primary)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{t('agentMap.3dUnavailable.title', '3D View Unavailable')}</h3>
                                            <p className="text-sm">{t('agentMap.3dUnavailable.desc', 'Your browser or device does not support WebGL, which is required for the 3D Agent Map. Please enable hardware acceleration or use a supported browser.')}</p>
                                        </div>
                                    </div>
                                }>
                                    <MapCanvas3D
                                        width={canvasSize[0]}
                                        height={canvasSize[1]}
                                        stations={stations}
                                        agents={agents}
                                        isEditing={isEditing}
                                        onStationChange={handleUpdateStation}
                                        onStationSelect={handleStationSelect}
                                        onZoneChange={handleZoneQueueChange}
                                        onSystemQueueChange={handleSystemQueueChange}
                                        theme={theme}
                                        systemQueueX={floorDef?.agentAssignments?._systemQueue?.x}
                                        systemQueueY={floorDef?.agentAssignments?._systemQueue?.y}
                                        viewMode={viewMode}
                                        walls={walls}
                                        zoom={mapZoom}
                                        onZoomChange={setMapZoom}
                                        zoneDefs={floorDef?.zoneDefs || EMPTY_ARRAY}
                                        callConnections={floorDef?.callConnections || EMPTY_ARRAY}
                                        zoneQueues={floorDef?.zoneQueues || EMPTY_ARRAY}
                                        zoneQuality={floorDef?.zoneQuality || EMPTY_ARRAY}
                                        extraFloors={extraFloorsData}
                                        systemQueue={systemQueueData}
                                        showHeatmap={showHeatmap}
                                        filteredStationIds={filteredStationIds}
                                        panOffset={mapPanOffset}
                                        onPanOffsetChange={setMapPanOffset}
                                        floorId={currentFloor}
                                        lockedCardIds={lockedCardIds}
                                        onToggleLock={toggleCardLock}
                                        selectedStationId={isEditing ? (selectedStation?.id || null) : null}
                                        stressMap={stressMap}
                                        systemStats={systemStats}
                                    />
                                </WebGLFallbackBoundary>
                            )}
                            {/* Zone editing overlay — 2D edit mode only */}
                            {canvasSize && isEditing && viewMode === '2d' && floorDef && (
                                <ZoneOverlay
                                    zoneLayout={floorDef.zoneLayout || []}
                                    zoneDefs={floorDef.zoneDefs || []}
                                    canvasWidth={canvasSize[0]}
                                    canvasHeight={canvasSize[1]}
                                    zoom={mapZoom}
                                    panOffset={mapPanOffset}
                                    selectedZoneIndex={selectedZoneIndex}
                                    onSelectZone={setSelectedZoneIndex}
                                    onZoneMove={handleZoneMove}
                                    onZoneResize={handleZoneResize}
                                    stations={stations}
                                    agents={agents}
                                />
                            )}

                            {!isEditing && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 12,
                                    left: 12,
                                    zIndex: 10,
                                }}>
                                    <MapLegend configuredStatuses={configuredStatuses} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel — Operations + Agent Cards (2-col grid) */}
            {
                !isEditing && (
                    <div className={`map-right-panel ${panelCollapsed ? 'collapsed' : ''}`} style={{ pointerEvents: 'none' }}>
                        {/* Panel collapse toggle + Card picker */}
                        <div className="panel-toolbar" style={{ pointerEvents: 'auto' }}>
                            {!panelCollapsed && availableCards.length > 0 && slots.some(s => s === null) && (
                                <Button variant="none" className="card-picker-btn"
                                    onClick={() => setCardPickerOpen(!cardPickerOpen)}
                                    title={t('agentMap.addCard', 'Add card')}
                                >+</Button>
                            )}
                            <Button variant="none" className="panel-collapse-btn"
                                onClick={() => { setPanelCollapsed(p => !p); setCardPickerOpen(false); }}
                                title={panelCollapsed ? t('agentMap.showCards') : t('agentMap.hideCards')}
                            >
                                {panelCollapsed ? <PanelLeftClose size={16} /> : <PanelRightClose size={16} />}
                            </Button>
                            {!panelCollapsed && cardPickerOpen && (
                                <div className="card-picker-menu">
                                    {availableCards.map(c => (
                                        <Button
                                            variant="none"
                                            key={c.type}
                                            className="card-picker-item"
                                            onClick={() => handleAddCard(c.type)}
                                        >
                                            <span>{c.icon}</span>
                                            <span>{t(`agentMap.cards.${c.type}`, c.label)}</span>
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="slot-grid" style={{ pointerEvents: 'none' }}>
                            {slots.map((slot, idx) => (
                                <div
                                    key={idx}
                                    className={`slot-cell ${slot ? 'slot-occupied' : 'slot-empty'} ${dragOverIdx === idx ? 'drag-over' : ''} ${(!slot && !isDragging) ? 'invisible-slot' : ''}`}
                                    style={{ pointerEvents: (!slot && !isDragging) ? 'none' : 'auto' }}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDrop={() => handleDrop(idx)}
                                    onDragEnd={handleDragEnd}
                                >
                                    {slot ? (
                                        <div
                                            className="slot-card-wrapper"
                                            draggable
                                            onDragStart={() => handleDragStart(idx)}
                                        >
                                            {slot.type === 'operations' && (
                                                <OperationsCard agents={agents} isSimulating={isSimulating} configuredStatuses={configuredStatuses} queueCount={systemQueueData.queueCount} />
                                            )}
                                            {slot.type === 'agent' && slot.agentId && agents[slot.agentId] && (
                                                <AgentDetailCard
                                                    agent={agents[slot.agentId]}
                                                    isSimulating={isSimulating}
                                                    onClose={() => handleRemoveCard(idx)}
                                                />
                                            )}
                                            {slot.type === 'live-calls' && (
                                                <LiveCallsCard agents={agents} isSimulating={isSimulating} />
                                            )}
                                            {slot.type === 'alerts' && (
                                                <AlertFeedCard agents={agents} isSimulating={isSimulating} />
                                            )}
                                            {slot.type === 'quality' && (
                                                <QualityStatsCard />
                                            )}
                                            {slot.type === 'outcomes' && (
                                                <OutcomeCard />
                                            )}
                                            {slot.type === 'behavior' && (
                                                <BehaviorCard agents={agents} isSimulating={isSimulating} />
                                            )}
                                            {slot.type === 'leaderboard' && (
                                                <LeaderboardCard agents={agents} isSimulating={isSimulating} />
                                            )}
                                            {slot.type === 'emotion' && (
                                                <EmotionCard isSimulating={isSimulating} />
                                            )}
                                            {/* Close button on all cards */}
                                            <Button variant="none" className="slot-close-btn" onClick={() => handleRemoveCard(idx)}>×</Button>
                                        </div>
                                    ) : (
                                        isDragging && (
                                            <div className="slot-placeholder">
                                                <span>{t('agentMap.dropCardHere')}</span>
                                            </div>
                                        )
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }



            {/* Right Sidebar (Config) - Only in Edit Mode */}
            {
                isEditing && (
                    <ConfigPanel
                        floorDef={floorDef || null}
                        currentFloor={currentFloor}
                        selectedZoneIndex={selectedZoneIndex}
                        onSelectZone={setSelectedZoneIndex}
                        onZoneLayoutChange={handleZoneLayoutChange}
                        onSaveComplete={() => fetchData(true)}
                        selectedStation={selectedStation}
                        onUpdateStation={handleUpdateStation}
                        onBulkUpdateStations={handleBulkUpdateStations}
                        onAutoRelayout={handleAutoRelayout}
                        agents={agents}
                        groups={groupList}
                    />
                )
            }
            {/* Floor Manager Modal */}
            {
                isFloorManagerOpen && (
                    <FloorManager
                        floors={floorOrder.map(fid => layouts[fid]).filter(Boolean)}
                        onUpdate={fetchData}
                        onClose={() => setIsFloorManagerOpen(false)}
                    />
                )
            }
        </div >
    );
};

export const AgentMapPage: React.FC = () => {
    // 预设 analytics widget ID 确保 OutcomeCard 所需的 analytics 数据组被加载
    // 同时保证 quality 组加载（live-calls 依赖）
    const mapWidgetIds = useMemo(() => ['outcome-distribution', 'quality-overview'], []);
    return (
        <DashboardProvider activeWidgetIds={mapWidgetIds}>
            <AgentMapContent />
        </DashboardProvider>
    );
};
