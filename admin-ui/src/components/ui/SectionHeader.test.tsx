import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SectionHeader from './SectionHeader';
import React from 'react';

describe('SectionHeader', () => {
    it('renders title text', () => {
        render(<SectionHeader title="Call Analytics" />);
        expect(screen.getByText('Call Analytics')).toBeTruthy();
    });

    it('renders with icon', () => {
        render(<SectionHeader title="Stats" icon={<span data-testid="icon">📊</span>} />);
        expect(screen.getByTestId('icon')).toBeTruthy();
        expect(screen.getByText('Stats')).toBeTruthy();
    });

    it('applies custom className', () => {
        const { container } = render(<SectionHeader title="T" className="custom-cls" />);
        expect(container.querySelector('.custom-cls')).toBeTruthy();
    });
});
