import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { AGENT_STATUS_MAP } from '../components/agent-map/utils';

interface DBStatus { id: string; label: string; color: string; }

// 与 agent-map/utils.ts 的 COLOR_NAME_MAP 保持一致
const COLOR_NAME_MAP: Record<string, string> = {
    green: '#22c55e',
    orange: '#f59e0b',
    yellow: '#eab308',
    red: '#ef4444',
    gray: '#6b7280',
    blue: '#3b82f6',
    purple: '#a855f7',
    cyan: '#06b6d4',
};

const resolveHex = (c: string) => COLOR_NAME_MAP[c] || c;

/** 从 DB 读取 agentStatuses 颜色, fallback 到 AGENT_STATUS_MAP 硬编码值 */
export function useAgentStatusColors(): Record<string, string> {
    const [dbStatuses, setDbStatuses] = useState<DBStatus[]>([]);

    useEffect(() => {
        api.get('/platform/settings')
            .then(res => setDbStatuses(res.data?.data?.agentStatuses || []))
            .catch(() => {}); // fallback 到 AGENT_STATUS_MAP
    }, []);

    return useMemo(() => {
        const colorMap: Record<string, string> = {};
        // DB 优先
        for (const s of dbStatuses) {
            colorMap[s.id] = resolveHex(s.color);
        }
        // 未覆盖的用 AGENT_STATUS_MAP fallback
        for (const [id, def] of Object.entries(AGENT_STATUS_MAP)) {
            if (!colorMap[id]) colorMap[id] = def.color;
        }
        return colorMap;
    }, [dbStatuses]);
}
