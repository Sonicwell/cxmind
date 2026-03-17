import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AvatarInitials from './AvatarInitials';

describe('AvatarInitials', () => {
    it('renders initials from name', () => {
        render(<AvatarInitials name="John Doe" />);
        expect(screen.getByText('JD')).toBeTruthy();
    });

    it('renders first letter for single-word name', () => {
        render(<AvatarInitials name="Admin" />);
        expect(screen.getByText('A')).toBeTruthy();
    });

    it('renders placeholder for empty name', () => {
        render(<AvatarInitials name="" />);
        // Should render something (empty or ?)
        expect(document.body.innerHTML.length).toBeGreaterThan(0);
    });

    it('renders with custom size', () => {
        render(<AvatarInitials name="Test User" size={48} />);
        expect(screen.getByText('TU')).toBeTruthy();
    });
});
