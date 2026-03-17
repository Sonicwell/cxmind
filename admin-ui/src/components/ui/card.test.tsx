import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardContent } from './card';
import React from 'react';

describe('Card', () => {
    it('renders children', () => {
        render(<Card>Hello Card</Card>);
        expect(screen.getByText('Hello Card')).toBeTruthy();
    });

    it('applies custom className', () => {
        const { container } = render(<Card className="my-card">X</Card>);
        expect(container.querySelector('.my-card')).toBeTruthy();
    });

    it('renders with noPadding', () => {
        const { container } = render(<Card noPadding>X</Card>);
        const card = container.querySelector('.card-base');
        expect(card).toBeTruthy();
    });
});

describe('CardHeader', () => {
    it('renders children', () => {
        render(<CardHeader>Header</CardHeader>);
        expect(screen.getByText('Header')).toBeTruthy();
    });
});

describe('CardContent', () => {
    it('renders children', () => {
        render(<CardContent>Body</CardContent>);
        expect(screen.getByText('Body')).toBeTruthy();
    });

    it('applies custom className', () => {
        const { container } = render(<CardContent className="custom">C</CardContent>);
        expect(container.querySelector('.custom')).toBeTruthy();
    });
});
