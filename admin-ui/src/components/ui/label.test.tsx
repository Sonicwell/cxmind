import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './label';
import React from 'react';

describe('Label', () => {
    it('renders text', () => {
        render(<Label>Username</Label>);
        expect(screen.getByText('Username')).toBeTruthy();
    });

    it('applies custom className', () => {
        const { container } = render(<Label className="my-label">L</Label>);
        expect(container.querySelector('.my-label')).toBeTruthy();
    });

    it('supports htmlFor', () => {
        render(<Label htmlFor="email">Email</Label>);
        const label = screen.getByText('Email');
        expect(label.getAttribute('for')).toBe('email');
    });
});
