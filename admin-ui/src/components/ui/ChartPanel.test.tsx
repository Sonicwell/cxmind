import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChartPanel from './ChartPanel';
import React from 'react';

vi.mock('./WidgetInfoTooltip', () => ({
    default: () => <span data-testid="tooltip">i</span>,
}));

describe('ChartPanel', () => {
    it('renders title and children', () => {
        render(<ChartPanel title="Revenue"><div>chart here</div></ChartPanel>);
        expect(screen.getByText('Revenue')).toBeTruthy();
        expect(screen.getByText('chart here')).toBeTruthy();
    });

    it('renders without title', () => {
        render(<ChartPanel title=""><div>content</div></ChartPanel>);
        expect(screen.getByText('content')).toBeTruthy();
    });

    it('renders tooltip when infoKey provided', () => {
        render(<ChartPanel title="ROI" infoKey="roiTrend"><div>data</div></ChartPanel>);
        expect(screen.getByTestId('tooltip')).toBeTruthy();
    });

    it('applies custom className', () => {
        const { container } = render(<ChartPanel title="T" className="my-panel"><div>x</div></ChartPanel>);
        expect(container.querySelector('.my-panel')).toBeTruthy();
    });
});
