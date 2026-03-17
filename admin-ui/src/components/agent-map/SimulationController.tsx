// Logic for simulation loop
import { useEffect, useRef } from 'react';

const AVATAR_PATHS = [
    '/avatars/agent_1.png',
    '/avatars/agent_2.png',
    '/avatars/agent_3.png',
    '/avatars/agent_4.png',
    '/avatars/agent_5.png',
    '/avatars/agent_6.png',
];

export const useSimulation = (
    isSimulating: boolean,
    stations: any[],
    setAgents: React.Dispatch<React.SetStateAction<Record<string, any>>>,
    setLayouts?: React.Dispatch<React.SetStateAction<Record<string, any>>>,
    currentFloorId?: string,
    setStressMap?: React.Dispatch<React.SetStateAction<Map<string, { agent_id: string; stress_score: number; ts: number }>>>
) => {
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Track per-agent stress drift targets for smooth animation
    const stressTargetsRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        if (!isSimulating) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            // Clear stress data when simulation stops
            if (setStressMap) setStressMap(new Map());
            stressTargetsRef.current.clear();
            return;
        }

        const statuses = ['oncall', 'available', 'break', 'wrapup', 'ring'];

        // Initial population
        setAgents(prev => {
            const newAgents: Record<string, any> = { ...prev };
            stations.forEach((st, idx) => {
                if (st.agentId && !newAgents[st.agentId]) {
                    newAgents[st.agentId] = {
                        id: st.agentId,
                        name: `Agent ${st.agentId.slice(-3)}`,
                        status: 'available',
                        extension: '100' + st.id.slice(-1),
                        avatar: AVATAR_PATHS[idx % AVATAR_PATHS.length]
                    };
                }
            });
            return newAgents;
        });

        // Loop
        intervalRef.current = setInterval(() => {
            setAgents(prev => {
                const next = { ...prev };
                const agentIds = Object.keys(next);

                // Randomly change status of 10% of agents
                const numToChange = Math.max(1, Math.floor(agentIds.length * 0.1));

                for (let i = 0; i < numToChange; i++) {
                    const randomId = agentIds[Math.floor(Math.random() * agentIds.length)];
                    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
                    if (next[randomId]) {
                        // For on_call: randomize call start time (0-10 min ago) to show breathing-speed variation
                        const statusChangeTime = randomStatus === 'oncall'
                            ? new Date(Date.now() - Math.random() * 10 * 60000).toISOString()
                            : new Date().toISOString();
                        next[randomId] = {
                            ...next[randomId],
                            status: randomStatus,
                            lastStatusChange: statusChangeTime
                        };
                    }
                }

                // C2-P2: Generate mock stress scores for on_call agents
                if (setStressMap) {
                    const stressTargets = stressTargetsRef.current;
                    setStressMap(_prev => {
                        const stressNext = new Map<string, { agent_id: string; stress_score: number; ts: number }>();
                        for (const id of agentIds) {
                            if (next[id]?.status === 'oncall') {
                                // Get or initialize a drift target
                                let target = stressTargets.get(id);
                                if (target === undefined) {
                                    // New call: start with random stress level
                                    target = Math.random() * 0.6; // 0–0.6 initial
                                    stressTargets.set(id, target);
                                }
                                // Occasionally shift target (simulates call dynamics)
                                if (Math.random() < 0.15) {
                                    // 10% chance of spike
                                    target = Math.random() < 0.3
                                        ? 0.6 + Math.random() * 0.4  // stress spike: 0.6–1.0
                                        : Math.random() * 0.5;       // calm down: 0–0.5
                                    stressTargets.set(id, target);
                                }
                                // Smooth drift toward target with noise
                                const current = _prev.get(id)?.stress_score ?? target;
                                const drifted = current + (target - current) * 0.3 + (Math.random() - 0.5) * 0.05;
                                const clamped = Math.max(0, Math.min(1, drifted));

                                stressNext.set(id, {
                                    agent_id: id,
                                    stress_score: clamped,
                                    ts: Date.now(),
                                });
                            } else {
                                // Not on_call: remove from stress map and targets
                                stressTargets.delete(id);
                            }
                        }
                        return stressNext;
                    });
                }

                return next;
            });

            // Simulate Queue Metrics (Heatmap Data)
            if (setLayouts && currentFloorId) {
                setLayouts(prev => {
                    const next = { ...prev };
                    const floor = next[currentFloorId];
                    if (floor && floor.zoneQueues) {
                        const newQueues = floor.zoneQueues.map((q: any) => {
                            // Random fluctuation
                            let newActive = (q.activeCallCount || 0) + (Math.random() > 0.6 ? (Math.random() > 0.5 ? 1 : -1) : 0);
                            newActive = Math.max(0, Math.min(20, newActive));

                            let newQueue = (q.queueCount || 0) + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0);
                            newQueue = Math.max(0, Math.min(50, newQueue));

                            // Wait time spikes if queue is high
                            let newWait = (q.avgWaitTimeSec || 0);
                            if (newQueue > 10) newWait += Math.random() * 5;
                            else newWait -= Math.random() * 2;
                            newWait = Math.max(0, Math.min(300, newWait));

                            return {
                                ...q,
                                activeCallCount: newActive,
                                queueCount: newQueue,
                                avgWaitTimeSec: newWait
                            };
                        });
                        next[currentFloorId] = { ...floor, zoneQueues: newQueues };
                    }
                    return next;
                });
            }
        }, 1500); // Update every 1.5s

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isSimulating, stations, setAgents]);
};
