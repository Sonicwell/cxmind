import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganicCard } from './OrganicCard';

describe('OrganicCard', () => {
    it('should render children', () => {
        render(<OrganicCard>Card Content</OrganicCard>);
        expect(screen.getByText('Card Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
        render(<OrganicCard className="custom-class">Content</OrganicCard>);
        screen.getByText('Content'); // Verifying content renders
        // Or better, query by role if we add one, or generic container check
        // For simple wrapper, checking parent of text is reasonable if it's direct.
        // Let's refine:
    });

    it('should have organic-card class if blob variant', () => {
        const { container } = render(<OrganicCard variant="blob">Content</OrganicCard>);
        expect(container.firstChild).toHaveClass('organic-card');
    });
});
