import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionDiv } from './MotionDiv';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, className, ...rest }: any) => (
            <div className={className} data-testid="motion-div">{children}</div>
        ),
    },
}));

describe('MotionDiv', () => {
    it('renders children', () => {
        render(<MotionDiv><span>Hello</span></MotionDiv>);
        expect(screen.getByText('Hello')).toBeTruthy();
    });

    it('applies className', () => {
        render(<MotionDiv className="test-class">Content</MotionDiv>);
        const div = screen.getByTestId('motion-div');
        expect(div.className).toContain('test-class');
    });

    it('renders with default empty className', () => {
        render(<MotionDiv>Content</MotionDiv>);
        const div = screen.getByTestId('motion-div');
        expect(div).toBeTruthy();
    });

    it('renders nested content', () => {
        render(
            <MotionDiv>
                <div>A</div>
                <div>B</div>
            </MotionDiv>
        );
        expect(screen.getByText('A')).toBeTruthy();
        expect(screen.getByText('B')).toBeTruthy();
    });
});
