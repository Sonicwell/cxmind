import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WidgetWrapper from './WidgetWrapper';

vi.mock('../components/ui/WidgetInfoTooltip', () => ({
    WidgetInfoInjector: ({ info }: any) => <div data-testid="widget-info">Info</div>,
}));

const baseDef = {
    id: 'test-widget', name: 'Test Widget', category: 'stat' as const,
    defaultW: 3, defaultH: 2, minW: 2, minH: 2,
    component: () => <div />, icon: () => null,
};

describe('WidgetWrapper', () => {
    let onRemove: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        onRemove = vi.fn();
    });

    it('renders children', () => {
        render(<WidgetWrapper def={baseDef as any} editMode={false} onRemove={onRemove}>
            <span>Content</span>
        </WidgetWrapper>);
        expect(screen.getByText('Content')).toBeTruthy();
    });

    it('renders widget name in edit mode', () => {
        render(<WidgetWrapper def={baseDef as any} editMode onRemove={onRemove}>
            <span>Content</span>
        </WidgetWrapper>);
        expect(screen.getByText('Test Widget')).toBeTruthy();
    });

    it('does not show header when editMode=false', () => {
        const { container } = render(
            <WidgetWrapper def={baseDef as any} editMode={false} onRemove={onRemove}>
                <span>Content</span>
            </WidgetWrapper>
        );
        expect(container.querySelector('.widget-header')).toBeNull();
    });

    it('shows header with drag handle in edit mode', () => {
        const { container } = render(
            <WidgetWrapper def={baseDef as any} editMode onRemove={onRemove}>
                <span>Content</span>
            </WidgetWrapper>
        );
        expect(container.querySelector('.widget-header')).toBeTruthy();
        expect(container.querySelector('.widget-drag-handle')).toBeTruthy();
    });

    it('calls onRemove when remove button clicked', () => {
        render(<WidgetWrapper def={baseDef as any} editMode onRemove={onRemove}>
            <span>Content</span>
        </WidgetWrapper>);
        const removeBtn = screen.getByTitle('Remove widget');
        fireEvent.click(removeBtn);
        expect(onRemove).toHaveBeenCalledWith('test-widget');
    });

    it('renders WidgetInfoInjector when def.info exists', () => {
        const defWithInfo = {
            ...baseDef,
            info: { descriptionKey: 'desc', sourceKey: 'src', calculationKey: 'calc' },
        };
        render(<WidgetWrapper def={defWithInfo as any} editMode={false} onRemove={onRemove}>
            <span>Content</span>
        </WidgetWrapper>);
        expect(screen.getByTestId('widget-info')).toBeTruthy();
    });

    it('applies edit-mode CSS class', () => {
        const { container } = render(
            <WidgetWrapper def={baseDef as any} editMode onRemove={onRemove}>
                <span>C</span>
            </WidgetWrapper>
        );
        expect(container.querySelector('.edit-mode')).toBeTruthy();
    });
});
