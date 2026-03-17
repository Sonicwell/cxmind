import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ChartContainer from './ChartContainer';
import React from 'react';

// Mock ResizeObserver
class MockResizeObserver {
    callback: any;
    constructor(cb: any) { this.callback = cb; }
    observe() {
        // Simulate size immediately
        this.callback([{ contentRect: { width: 400, height: 300 } }]);
    }
    unobserve() { }
    disconnect() { }
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('ChartContainer', () => {
    it('renders wrapper div', () => {
        const { container } = render(
            <ChartContainer>
                <div data-testid="chart">Chart</div>
            </ChartContainer>
        );
        expect(container.firstChild).toBeTruthy();
    });

    it('applies full-width/height styles', () => {
        const { container } = render(
            <ChartContainer>
                <div>Chart</div>
            </ChartContainer>
        );
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper.style.width).toBe('100%');
        expect(wrapper.style.height).toBe('100%');
    });

    it('renders with overflow hidden', () => {
        const { container } = render(
            <ChartContainer>
                <div>Chart</div>
            </ChartContainer>
        );
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper.style.overflow).toBe('hidden');
    });
});
