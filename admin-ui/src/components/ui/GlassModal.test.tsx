import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlassModal } from './GlassModal';

// Mock Radix UI Dialog as it relies on complex DOM structures
// However, for integration testing we want to test the wrapper. 
// Radix usually works fine in JSDOM if pointer events are shimmed, 
// but for simplicity we test the open logic.

describe('GlassModal', () => {
    const handleOpenChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should not render content when closed', () => {
        render(
            <GlassModal open={false} onOpenChange={handleOpenChange} title="Test Modal">
                <div>Modal Content</div>
            </GlassModal>
        );
        expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
    });

    it('should render content when open', () => {
        render(
            <GlassModal open={true} onOpenChange={handleOpenChange} title="Test Modal">
                <div>Modal Content</div>
            </GlassModal>
        );
        expect(screen.getByText('Modal Content')).toBeInTheDocument();
        // Title appears in both <h2> and sr-only <p> description
        expect(screen.getAllByText('Test Modal').length).toBeGreaterThanOrEqual(1);
    });

    it('should call onOpenChange when close button is clicked', async () => {
        render(
            <GlassModal open={true} onOpenChange={handleOpenChange} title="Test Modal">
                <div>Modal Content</div>
            </GlassModal>
        );

        // Radix Dialog close button usually has aria-label="Close"
        const closeButton = screen.getByRole('button', { name: /close/i });
        fireEvent.click(closeButton);

        expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
});
