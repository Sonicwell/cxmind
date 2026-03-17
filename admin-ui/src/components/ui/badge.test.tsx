import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';
import React from 'react';

describe('Badge', () => {
    it('renders children text', () => {
        render(<Badge>Active</Badge>);
        expect(screen.getByText('Active')).toBeTruthy();
    });

    it('defaults to default variant', () => {
        const { container } = render(<Badge>Default</Badge>);
        const span = container.querySelector('span');
        expect(span).toBeTruthy();
    });

    it('renders success variant', () => {
        render(<Badge variant="success">OK</Badge>);
        expect(screen.getByText('OK')).toBeTruthy();
    });

    it('renders danger variant', () => {
        render(<Badge variant="danger">Error</Badge>);
        expect(screen.getByText('Error')).toBeTruthy();
    });

    it('renders warning variant', () => {
        render(<Badge variant="warning">Warning</Badge>);
        expect(screen.getByText('Warning')).toBeTruthy();
    });

    it('renders info variant', () => {
        render(<Badge variant="info">Info</Badge>);
        expect(screen.getByText('Info')).toBeTruthy();
    });

    it('passes custom className', () => {
        const { container } = render(<Badge className="my-badge">X</Badge>);
        expect(container.querySelector('.my-badge')).toBeTruthy();
    });
});
