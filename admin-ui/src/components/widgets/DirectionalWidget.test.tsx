import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InboundWidget, OutboundWidget } from './DirectionalWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../dashboard/DashboardContext', () => {
    const mockVal = {
        directionalStats: {
            inbound: { total: 1234, answered: 1142, abandoned: 92, answer_rate: 92.5, agent_reach_rate: 85.0, avg_wait_time: 35, avg_talk_time: 180 },
            outbound: { total: 567, answered: 443, abandoned: 124, answer_rate: 78.3, avg_ring_time: 12, avg_talk_time: 210 },
        },
    };
    return {
        useDashboard: vi.fn().mockReturnValue(mockVal),
        useDashboardCore: vi.fn().mockReturnValue(mockVal),
        useDashboardQuality: vi.fn().mockReturnValue(mockVal),
        useDashboardLive: vi.fn().mockReturnValue(mockVal),
        useDashboardAnalytics: vi.fn().mockReturnValue(mockVal),
        useDashboardRealtime: vi.fn().mockReturnValue(mockVal),
    };
});

vi.mock('../../dashboard/helpers', () => ({
    fmtDuration: (s: number) => `${s}s`,
}));

describe('InboundWidget', () => {
    it('renders agent inbound title', () => {
        render(<InboundWidget />);
        expect(screen.getByText('Agent Inbound')).toBeTruthy();
    });

    it('renders total calls', () => {
        render(<InboundWidget />);
        expect(screen.getByText('1,234')).toBeTruthy();
    });

    it('renders answer rate', () => {
        render(<InboundWidget />);
        expect(screen.getByText('92.5%')).toBeTruthy();
    });

    it('renders avg wait time', () => {
        render(<InboundWidget />);
        expect(screen.getByText('35s')).toBeTruthy();
    });

    it('renders avg talk time', () => {
        render(<InboundWidget />);
        expect(screen.getByText('180s')).toBeTruthy();
    });

    it('renders abandoned count', () => {
        render(<InboundWidget />);
        expect(screen.getByText(/abandoned/)).toBeTruthy();
    });

    it('renders KPI labels', () => {
        render(<InboundWidget />);
        expect(screen.getByText('Total')).toBeTruthy();
        expect(screen.getByText('Answer Rate')).toBeTruthy();
        expect(screen.getByText('Avg Wait')).toBeTruthy();
        expect(screen.getByText('Avg Talk')).toBeTruthy();
    });
});

describe('OutboundWidget', () => {
    it('renders agent outbound title', () => {
        render(<OutboundWidget />);
        expect(screen.getByText('Agent Outbound')).toBeTruthy();
    });

    it('renders total calls', () => {
        render(<OutboundWidget />);
        expect(screen.getByText('567')).toBeTruthy();
    });

    it('renders answer rate', () => {
        render(<OutboundWidget />);
        expect(screen.getByText('78.3%')).toBeTruthy();
    });

    it('renders avg ring time', () => {
        render(<OutboundWidget />);
        expect(screen.getByText('12s')).toBeTruthy();
    });

    it('renders avg talk time', () => {
        render(<OutboundWidget />);
        expect(screen.getByText('210s')).toBeTruthy();
    });
});
