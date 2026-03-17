import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricCard from './MetricCard';

// Mock dependencies
vi.mock('./WidgetInfoTooltip', () => ({
    default: () => <span data-testid="tooltip">i</span>,
}));

vi.mock('lucide-react', () => ({
    ArrowUp: () => <span>↑</span>,
    ArrowDown: () => <span>↓</span>,
}));

describe('MetricCard', () => {
    it('renders label and value', () => {
        render(<MetricCard label="Total Calls" value="1,234" />);
        expect(screen.getByText('Total Calls')).toBeTruthy();
        expect(screen.getByText('1,234')).toBeTruthy();
    });

    it('renders with change badge (positive)', () => {
        render(<MetricCard label="Active" value="42" change={5.2} />);
        expect(screen.getByText('42')).toBeTruthy();
        expect(screen.getByText('5.2%')).toBeTruthy();
    });

    it('renders placeholder state', () => {
        render(<MetricCard label="Pending" value="—" placeholder placeholderText="No data" />);
        expect(screen.getByText('No data')).toBeTruthy();
    });

    it('renders without crashing when no optional props', () => {
        render(<MetricCard label="Simple" value="0" />);
        expect(screen.getByText('Simple')).toBeTruthy();
    });
});
