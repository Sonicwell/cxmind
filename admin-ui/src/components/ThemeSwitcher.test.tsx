import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSwitcher } from './ThemeSwitcher';

// Mock ThemeContext
vi.mock('../context/ThemeContext', () => ({
    useTheme: vi.fn().mockReturnValue({
        theme: 'dark',
        setTheme: vi.fn(),
    }),
}));

import { useTheme } from '../context/ThemeContext';
const mockUseTheme = vi.mocked(useTheme);

describe('ThemeSwitcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: vi.fn() });
    });

    it('renders theme toggle button', () => {
        render(<ThemeSwitcher />);
        expect(screen.getByTitle('Change Theme')).toBeTruthy();
    });

    it('opens dropdown when button is clicked', () => {
        render(<ThemeSwitcher />);
        fireEvent.click(screen.getByTitle('Change Theme'));
        expect(screen.getByText('Select Theme')).toBeTruthy();
    });

    it('shows all 5 theme options', () => {
        render(<ThemeSwitcher />);
        fireEvent.click(screen.getByTitle('Change Theme'));
        expect(screen.getByText('Light')).toBeTruthy();
        expect(screen.getByText('Dark')).toBeTruthy();
        expect(screen.getByText('Midnight')).toBeTruthy();
        expect(screen.getByText('Cyberpunk')).toBeTruthy();
        expect(screen.getByText('Forest')).toBeTruthy();
    });

    it('calls setTheme when theme option is clicked', () => {
        const setTheme = vi.fn();
        mockUseTheme.mockReturnValue({ theme: 'dark', setTheme });

        render(<ThemeSwitcher />);
        fireEvent.click(screen.getByTitle('Change Theme'));
        fireEvent.click(screen.getByText('Forest'));
        expect(setTheme).toHaveBeenCalledWith('forest');
    });

    it('closes dropdown after selecting a theme', () => {
        render(<ThemeSwitcher />);
        fireEvent.click(screen.getByTitle('Change Theme'));
        expect(screen.getByText('Select Theme')).toBeTruthy();
        fireEvent.click(screen.getByText('Light'));
        expect(screen.queryByText('Select Theme')).toBeNull();
    });

    it('does not show dropdown initially', () => {
        render(<ThemeSwitcher />);
        expect(screen.queryByText('Select Theme')).toBeNull();
    });
});
