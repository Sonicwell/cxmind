import { useRef, useCallback } from 'react';

/**
 * useFatigueDetect — Monitors per-agent stress scores and detects consecutive
 * high-stress windows, triggering a callback when an agent may be experiencing fatigue.
 *
 * C2-P2: Called from AgentMap with the stressMap on each render cycle.
 *
 * Detection logic:
 * - An agent is "high stress" when stress_score > threshold (default 0.7)
 * - After N consecutive high-stress snapshots (default 3 = ~15s at 5s interval), trigger alert
 * - Max 1 alert per agent per cooldown period (default 5 min)
 */

interface FatigueConfig {
    /** Stress score threshold (0.0–1.0). Default 0.7 */
    threshold?: number;
    /** Consecutive high-stress snapshots needed. Default 3 (~15s) */
    consecutiveCount?: number;
    /** Cooldown per agent in ms. Default 300_000 (5 min) */
    cooldownMs?: number;
}

interface AgentTracker {
    count: number;       // Consecutive high-stress snapshots
    lastAlertAt: number; // Timestamp of last alert for cooldown
}

export function useFatigueDetect(
    onFatigueAlert: (agentId: string) => void,
    config: FatigueConfig = {}
) {
    const {
        threshold = 0.7,
        consecutiveCount = 3,
        cooldownMs = 300_000,
    } = config;

    const trackersRef = useRef<Map<string, AgentTracker>>(new Map());

    /**
     * Process a batch of stress scores. Call this whenever stressMap updates.
     * @param stressEntries - Map of agentId → { stress_score }
     */
    const process = useCallback((stressEntries: Map<string, { agent_id: string; stress_score: number }>) => {
        const now = Date.now();
        const trackers = trackersRef.current;

        for (const [agentId, entry] of stressEntries) {
            let tracker = trackers.get(agentId);
            if (!tracker) {
                tracker = { count: 0, lastAlertAt: 0 };
                trackers.set(agentId, tracker);
            }

            if (entry.stress_score > threshold) {
                tracker.count++;

                if (tracker.count >= consecutiveCount) {
                    // Check cooldown
                    if (now - tracker.lastAlertAt >= cooldownMs) {
                        tracker.lastAlertAt = now;
                        tracker.count = 0; // Reset after alert
                        onFatigueAlert(agentId);
                    }
                }
            } else {
                // Reset consecutive count when stress drops below threshold
                tracker.count = 0;
            }
        }

        // Cleanup trackers for agents no longer in the map
        for (const agentId of trackers.keys()) {
            if (!stressEntries.has(agentId)) {
                trackers.delete(agentId);
            }
        }
    }, [threshold, consecutiveCount, cooldownMs, onFatigueAlert]);

    return { process };
}
