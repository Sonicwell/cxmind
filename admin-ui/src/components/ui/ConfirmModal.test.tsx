import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmModal } from './ConfirmModal';

// Mock GlassModal to render children when open
vi.mock('./GlassModal', () => ({
    GlassModal: ({ open, children, title }: any) =>
        open ? <div data-testid="glass-modal"><h2>{title}</h2>{children}</div> : null,
}));

describe('ConfirmModal', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    beforeEach(() => vi.clearAllMocks());

    it('renders nothing when closed', () => {
        const { container } = render(
            <ConfirmModal open={false} onClose={onClose} onConfirm={onConfirm}
                title="Delete?" description="Are you sure?" />
        );
        expect(container.querySelector('[data-testid="glass-modal"]')).toBeNull();
    });

    it('renders title and description when open', () => {
        render(
            <ConfirmModal open={true} onClose={onClose} onConfirm={onConfirm}
                title="Delete?" description="This cannot be undone" />
        );
        expect(screen.getByText('Delete?')).toBeTruthy();
        expect(screen.getByText('This cannot be undone')).toBeTruthy();
    });

    it('renders default button text', () => {
        render(
            <ConfirmModal open={true} onClose={onClose} onConfirm={onConfirm}
                title="T" description="D" />
        );
        expect(screen.getByText('Confirm')).toBeTruthy();
        expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('renders custom button text', () => {
        render(
            <ConfirmModal open={true} onClose={onClose} onConfirm={onConfirm}
                title="T" description="D" confirmText="Yes" cancelText="No" />
        );
        expect(screen.getByText('Yes')).toBeTruthy();
        expect(screen.getByText('No')).toBeTruthy();
    });

    it('calls onClose when cancel is clicked', () => {
        render(
            <ConfirmModal open={true} onClose={onClose} onConfirm={onConfirm}
                title="T" description="D" />
        );
        fireEvent.click(screen.getByText('Cancel'));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('calls onConfirm and onClose when confirm is clicked', () => {
        render(
            <ConfirmModal open={true} onClose={onClose} onConfirm={onConfirm}
                title="T" description="D" />
        );
        fireEvent.click(screen.getByText('Confirm'));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
