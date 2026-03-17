import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GroupSelector } from './GroupSelector';
import React from 'react';

vi.mock('../../services/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({
            data: {
                data: [
                    { _id: 'g1', name: 'Sales', code: 'SALES' },
                    { _id: 'g2', name: 'Support', code: 'SUP' },
                ]
            }
        }),
    },
}));

vi.mock('./MotionButton', () => ({
    MotionButton: ({ children, onClick, disabled, ...props }: any) => (
        <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
    ),
}));

vi.mock('lucide-react', () => ({
    Filter: () => <span>filter</span>,
    X: () => <span>x</span>,
    Check: () => <span>✓</span>,
}));

describe('GroupSelector', () => {
    const mockOnChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('renders "All Groups" when nothing selected', () => {
        render(<GroupSelector selectedIds={[]} onChange={mockOnChange} />);
        expect(screen.getByText('All Groups')).toBeTruthy();
    });

    it('shows count when groups are selected', () => {
        render(<GroupSelector selectedIds={['g1']} onChange={mockOnChange} />);
        expect(screen.getByText('1 Group')).toBeTruthy();
    });

    it('shows plural when multiple selected', () => {
        render(<GroupSelector selectedIds={['g1', 'g2']} onChange={mockOnChange} />);
        expect(screen.getByText('2 Groups')).toBeTruthy();
    });

    it('renders filter button with title', () => {
        render(<GroupSelector selectedIds={[]} onChange={mockOnChange} />);
        expect(screen.getByTitle('Filter by Group')).toBeTruthy();
    });

    it('disabled state prevents opening', () => {
        render(<GroupSelector selectedIds={[]} onChange={mockOnChange} disabled />);
        fireEvent.click(screen.getByText('All Groups'));
        expect(screen.queryByText('Select Groups')).toBeNull();
    });
});
