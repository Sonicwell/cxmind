import { TrendingUp, Phone, AlertTriangle, Gauge, HeartPulse, Trophy, Brain } from 'lucide-react';
import type { WidgetDef } from '../../shared/widget-types';
import { OperationsCard } from './ui/OperationsCard';
import LiveCallsCard from './ui/LiveCallsCard';
import AlertFeedCard from './ui/AlertFeedCard';
import QualityStatsCard from './ui/QualityStatsCard';
import OutcomeCard from './ui/OutcomeCard';
import BehaviorCard from './ui/BehaviorCard';
import LeaderboardCard from './ui/LeaderboardCard';
import EmotionCard from './ui/EmotionCard';

/**
 * Agent Map Card Registry — uses the unified WidgetDef interface.
 *
 * Each card is registered here and can be referenced by `AgentMap.tsx`
 * for the slot grid, card picker, and persistence. Component implementations
 * remain Agent-Map-specific (different data source than Dashboard widgets).
 */
export const CARD_REGISTRY: WidgetDef[] = [
    {
        id: 'operations',
        name: 'Operations',
        icon: TrendingUp,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: OperationsCard as any,
    },
    {
        id: 'live-calls',
        name: 'Live Calls',
        icon: Phone,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: LiveCallsCard as any,
    },
    {
        id: 'alerts',
        name: 'Alerts',
        icon: AlertTriangle,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: AlertFeedCard as any,
    },
    {
        id: 'quality',
        name: 'Quality',
        icon: Gauge,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: QualityStatsCard as any,
    },
    {
        id: 'outcomes',
        name: 'Outcomes',
        icon: TrendingUp,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: OutcomeCard as any,
    },
    {
        id: 'behavior',
        name: 'Behavior',
        icon: HeartPulse,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: BehaviorCard as any,
    },
    {
        id: 'leaderboard',
        name: 'Leaderboard',
        icon: Trophy,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: LeaderboardCard as any,
    },
    {
        id: 'emotion',
        name: 'Emotion SER',
        icon: Brain,
        category: 'card',
        defaultW: 1,
        defaultH: 1,
        component: EmotionCard as any,
    },
];

/** Lookup map: card id → WidgetDef */
export const CARD_MAP = new Map(CARD_REGISTRY.map(c => [c.id, c]));

/** Card catalog for picker UI (label + emoji preserved for backward compat) */
export const CARD_CATALOG = CARD_REGISTRY.map(c => ({
    type: c.id as 'operations' | 'live-calls' | 'alerts' | 'quality' | 'outcomes' | 'behavior' | 'leaderboard' | 'emotion',
    label: c.name,
    icon: c.id === 'operations' ? '📊' :
        c.id === 'live-calls' ? '📞' :
            c.id === 'alerts' ? '⚠️' :
                c.id === 'quality' ? '📡' :
                    c.id === 'outcomes' ? '🎯' :
                        c.id === 'behavior' ? '💓' :
                            c.id === 'leaderboard' ? '🏆' :
                                c.id === 'emotion' ? '🧠' : '📦',
}));
