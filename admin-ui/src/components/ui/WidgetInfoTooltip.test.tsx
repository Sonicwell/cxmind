import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WidgetInfoTooltip from './WidgetInfoTooltip';
import React from 'react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('lucide-react', () => ({
    Info: (props: any) => <span data-testid="info-icon" {...props}>i</span>,
}));

describe('WidgetInfoTooltip', () => {
    const info = {
        descriptionKey: 'widgetInfo.test.desc',
        sourceKey: 'widgetInfo.test.source',
        calculationKey: 'widgetInfo.test.calc',
    };

    beforeEach(() => vi.clearAllMocks());

    it('renders trigger button', () => {
        render(<WidgetInfoTooltip info={info} />);
        expect(screen.getByRole('button', { name: 'Widget info' })).toBeTruthy();
    });

    it('shows tooltip on click', () => {
        render(<WidgetInfoTooltip info={info} />);
        fireEvent.click(screen.getByRole('button', { name: 'Widget info' }));
        expect(screen.getByText('widgetInfo.test.desc')).toBeTruthy();
        expect(screen.getByText('widgetInfo.test.source')).toBeTruthy();
        expect(screen.getByText('widgetInfo.test.calc')).toBeTruthy();
    });

    it('renders in inline mode', () => {
        const { container } = render(<WidgetInfoTooltip info={info} inline />);
        expect(container.querySelector('.inline-mode')).toBeTruthy();
    });

    it('has aria-expanded attribute', () => {
        render(<WidgetInfoTooltip info={info} />);
        const btn = screen.getByRole('button', { name: 'Widget info' });
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(btn);
        expect(btn.getAttribute('aria-expanded')).toBe('true');
    });
});
