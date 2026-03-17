import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LazySection } from './LazySection';

// Mock IntersectionObserver
class MockIntersectionObserver {
    callback: IntersectionObserverCallback;
    static instances: MockIntersectionObserver[] = [];

    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        MockIntersectionObserver.instances.push(this);
    }

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();

    // Helper to simulate intersection
    trigger(isIntersecting: boolean) {
        this.callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            this as any
        );
    }
}

describe('LazySection', () => {
    beforeEach(() => {
        MockIntersectionObserver.instances = [];
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should show loading spinner initially', () => {
        const { container } = render(
            <LazySection>
                <div>Content</div>
            </LazySection>
        );
        expect(container.querySelector('.animate-spin')).toBeInTheDocument();
        expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('should render children after intersection is observed', async () => {
        render(
            <LazySection>
                <div>Lazy Content</div>
            </LazySection>
        );

        // Trigger intersection
        const observer = MockIntersectionObserver.instances[0];
        observer.trigger(true);

        await waitFor(() => {
            expect(screen.getByText('Lazy Content')).toBeInTheDocument();
        });
    });

    it('should call onVisible when section enters viewport', () => {
        const onVisible = vi.fn();
        render(
            <LazySection onVisible={onVisible}>
                <div>Content</div>
            </LazySection>
        );

        const observer = MockIntersectionObserver.instances[0];
        observer.trigger(true);

        expect(onVisible).toHaveBeenCalledTimes(1);
    });

    it('should only trigger onVisible once', () => {
        const onVisible = vi.fn();
        render(
            <LazySection onVisible={onVisible}>
                <div>Content</div>
            </LazySection>
        );

        const observer = MockIntersectionObserver.instances[0];
        observer.trigger(true);
        observer.trigger(true); // Second trigger

        expect(onVisible).toHaveBeenCalledTimes(1);
    });

    it('should not render children when not intersecting', () => {
        render(
            <LazySection>
                <div>Hidden Content</div>
            </LazySection>
        );

        const observer = MockIntersectionObserver.instances[0];
        observer.trigger(false);

        expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
    });

    it('should render title when provided and visible', async () => {
        render(
            <LazySection title="My Section">
                <div>Content</div>
            </LazySection>
        );

        const observer = MockIntersectionObserver.instances[0];
        observer.trigger(true);

        await waitFor(() => {
            expect(screen.getByText('My Section')).toBeInTheDocument();
        });
    });

    it('should apply className', () => {
        const { container } = render(
            <LazySection className="custom-class">
                <div>Content</div>
            </LazySection>
        );
        expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('should set minHeight when not visible', () => {
        const { container } = render(
            <LazySection minHeight={500}>
                <div>Content</div>
            </LazySection>
        );
        const section = container.querySelector('.analytics-lazy-section') as HTMLElement;
        expect(section.style.minHeight).toBe('500px');
    });
});
