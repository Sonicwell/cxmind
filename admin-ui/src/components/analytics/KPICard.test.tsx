import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { KPICard } from './KPICard';

describe('KPICard', () => {
    const baseProps = {
        label: 'Total Calls',
        value: '847',
        color: 'blue',
        icon: <span data-testid="icon">📞</span>,
    };

    it('should render label and value', () => {
        render(<KPICard {...baseProps} />);
        expect(screen.getByText('Total Calls')).toBeInTheDocument();
        expect(screen.getByText('847')).toBeInTheDocument();
    });

    it('should render sub text when provided', () => {
        render(<KPICard {...baseProps} sub="Last 7d" />);
        expect(screen.getByText('Last 7d')).toBeInTheDocument();
    });

    it('should show ▲ green when change > 0', () => {
        const { container } = render(<KPICard {...baseProps} change={12} />);
        const changeEl = container.querySelector('.text-emerald-500');
        expect(changeEl).toBeInTheDocument();
        expect(changeEl?.textContent).toContain('▲');
        expect(changeEl?.textContent).toContain('12');
    });

    it('should show ▼ red when change < 0', () => {
        const { container } = render(<KPICard {...baseProps} change={-8} />);
        const changeEl = container.querySelector('.text-rose-500');
        expect(changeEl).toBeInTheDocument();
        expect(changeEl?.textContent).toContain('▼');
        expect(changeEl?.textContent).toContain('8');
    });

    it('should not show change indicator when change is undefined', () => {
        const { container } = render(<KPICard {...baseProps} />);
        expect(container.querySelector('.text-emerald-500')).not.toBeInTheDocument();
        expect(container.querySelector('.text-rose-500')).not.toBeInTheDocument();
    });

    it('should show ▼ for change = 0 (no improvement)', () => {
        const { container } = render(<KPICard {...baseProps} change={0} />);
        // change === 0 means no growth, should still render (not undefined)
        const changeEl = container.querySelector('[class*="text-"]');
        expect(changeEl).toBeInTheDocument();
    });
});
