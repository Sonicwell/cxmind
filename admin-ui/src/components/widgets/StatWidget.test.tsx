import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatWidget from './StatWidget';
import { Phone } from 'lucide-react';

// Mock useCountUp to return immediate value
vi.mock('../../hooks/useCountUp', () => ({
    useCountUp: (val: number) => val,
}));

describe('StatWidget', () => {
    const defaultProps = {
        icon: Phone,
        iconBg: '#eef2ff',
        iconColor: '#6366f1',
        label: 'Active Calls',
        value: 42,
        sub: 'Last 24 hours',
    };

    it('renders label', () => {
        render(<StatWidget {...defaultProps} />);
        expect(screen.getByText('Active Calls')).toBeTruthy();
    });

    it('renders numeric value', () => {
        render(<StatWidget {...defaultProps} />);
        expect(screen.getByText('42')).toBeTruthy();
    });

    it('renders sub text', () => {
        render(<StatWidget {...defaultProps} />);
        expect(screen.getByText('Last 24 hours')).toBeTruthy();
    });

    it('renders string value directly when non-numeric', () => {
        render(<StatWidget {...defaultProps} value="3:10" />);
        expect(screen.getByText('3:10')).toBeTruthy();
    });

    it('renders with custom label and sub', () => {
        render(<StatWidget {...defaultProps} label="MOS Score" value={4.21} sub="Average quality" />);
        expect(screen.getByText('MOS Score')).toBeTruthy();
        expect(screen.getByText('Average quality')).toBeTruthy();
    });

    it('renders glass-panel container', () => {
        const { container } = render(<StatWidget {...defaultProps} />);
        expect(container.querySelector('.stat-card')).toBeTruthy();
        expect(container.querySelector('.glass-panel')).toBeTruthy();
    });

    it('renders icon element', () => {
        const { container } = render(<StatWidget {...defaultProps} />);
        expect(container.querySelector('.stat-icon')).toBeTruthy();
    });
});
