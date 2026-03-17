import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloorManager } from './FloorManager';

// ── Mocks ──

vi.mock('../../services/api', () => ({
    createLayout: vi.fn().mockResolvedValue({}),
    updateLayout: vi.fn().mockResolvedValue({}),
    deleteLayout: vi.fn().mockResolvedValue({}),
    reorderLayouts: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../components/ui/GlassModal', () => ({
    GlassModal: ({ open, children, title, onOpenChange }: any) =>
        open ? (
            <div data-testid="glass-modal">
                <span data-testid="modal-title">{title}</span>
                <button data-testid="modal-close" onClick={() => onOpenChange(false)}>Close</button>
                {children}
            </div>
        ) : null,
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const MOCK_FLOORS = [
    { _id: 'f1', floorId: '1F', label: 'Ground Floor', width: 2000, height: 2000 },
    { _id: 'f2', floorId: '2F', label: 'Second Floor', width: 2000, height: 2000 },
];

describe('FloorManager Modal Unification', () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render inside a GlassModal', () => {
        render(<FloorManager floors={MOCK_FLOORS} onUpdate={onUpdate} onClose={onClose} />);
        // After migration, the component should render via GlassModal mock
        expect(screen.getByTestId('glass-modal')).toBeInTheDocument();
    });

    it('should use CSS variable colors instead of hardcoded hex', () => {
        const { container } = render(
            <FloorManager floors={MOCK_FLOORS} onUpdate={onUpdate} onClose={onClose} />
        );
        const html = container.innerHTML;
        // Hardcoded dark theme colors should not appear after migration
        expect(html).not.toContain('#0f172a');
        expect(html).not.toContain('#1e293b');
        expect(html).not.toContain('#334155');
    });

    it('should call onClose when GlassModal close is triggered', () => {
        render(<FloorManager floors={MOCK_FLOORS} onUpdate={onUpdate} onClose={onClose} />);
        fireEvent.click(screen.getByTestId('modal-close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('should render floor list items', () => {
        render(<FloorManager floors={MOCK_FLOORS} onUpdate={onUpdate} onClose={onClose} />);
        expect(screen.getByText('Ground Floor')).toBeInTheDocument();
        expect(screen.getByText('Second Floor')).toBeInTheDocument();
    });
});
