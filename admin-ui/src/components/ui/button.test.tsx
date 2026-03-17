import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';
import React from 'react';

describe('Button', () => {
    it('renders children', () => {
        render(<Button>Click me</Button>);
        expect(screen.getByText('Click me')).toBeTruthy();
    });

    it('renders as button element', () => {
        render(<Button>Btn</Button>);
        expect(screen.getByRole('button')).toBeTruthy();
    });

    it('applies variant classes', () => {
        const { container } = render(<Button variant="destructive">Del</Button>);
        const btn = container.querySelector('button');
        expect(btn?.className).toContain('btn-danger');
    });

    it('applies size classes', () => {
        const { container } = render(<Button size="sm">S</Button>);
        const btn = container.querySelector('button');
        expect(btn?.className).toContain('btn-sm');
    });

    it('forwards disabled prop', () => {
        render(<Button disabled>X</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });
});
