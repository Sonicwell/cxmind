import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from './switch';
import React from 'react';

describe('Switch', () => {
    it('renders', () => {
        render(<Switch aria-label="toggle" />);
        expect(screen.getByRole('switch')).toBeTruthy();
    });

    it('is unchecked by default', () => {
        render(<Switch aria-label="toggle" />);
        const sw = screen.getByRole('switch');
        expect(sw.getAttribute('data-state')).toBe('unchecked');
    });

    it('can be checked', () => {
        render(<Switch aria-label="toggle" defaultChecked />);
        const sw = screen.getByRole('switch');
        expect(sw.getAttribute('data-state')).toBe('checked');
    });

    it('can be disabled', () => {
        render(<Switch aria-label="toggle" disabled />);
        expect(screen.getByRole('switch')).toBeDisabled();
    });
});
