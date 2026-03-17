import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './input';
import React from 'react';

describe('Input', () => {
    it('renders input element', () => {
        render(<Input placeholder="Enter text" />);
        expect(screen.getByPlaceholderText('Enter text')).toBeTruthy();
    });

    it('renders with type', () => {
        render(<Input type="email" placeholder="email" />);
        const input = screen.getByPlaceholderText('email') as HTMLInputElement;
        expect(input.type).toBe('email');
    });

    it('accepts disabled prop', () => {
        render(<Input disabled placeholder="disabled" />);
        expect(screen.getByPlaceholderText('disabled')).toBeDisabled();
    });

    it('applies custom className', () => {
        const { container } = render(<Input className="my-input" />);
        expect(container.querySelector('.my-input')).toBeTruthy();
    });
});
