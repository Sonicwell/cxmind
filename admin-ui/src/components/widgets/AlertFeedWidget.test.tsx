import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AlertFeedWidget from './AlertFeedWidget';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../context/WebSocketContext', () => ({
    useWebSocket: () => ({ subscribe: vi.fn().mockReturnValue(() => { }) }),
}));

vi.mock('../../hooks/useDemoMode', () => ({
    useDemoMode: () => ({ demoMode: false }),
}));

vi.mock('../../services/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    },
}));

describe('AlertFeedWidget', () => {
    it('renders title "Platform Alerts"', () => {
        render(<AlertFeedWidget />);
        expect(screen.getByText('Platform Alerts')).toBeTruthy();
    });

    it('renders "All systems normal" when no alerts', () => {
        render(<AlertFeedWidget />);
        expect(screen.getByText('All systems normal')).toBeTruthy();
    });

    it('renders green check emoji when no alerts', () => {
        render(<AlertFeedWidget />);
        expect(screen.getByText('✅')).toBeTruthy();
    });

    it('renders alerts container', () => {
        const { container } = render(<AlertFeedWidget />);
        expect(container.querySelector('.dw-alerts')).toBeTruthy();
    });

    it('renders alerts list', () => {
        const { container } = render(<AlertFeedWidget />);
        expect(container.querySelector('.dw-alerts-list')).toBeTruthy();
    });
});
