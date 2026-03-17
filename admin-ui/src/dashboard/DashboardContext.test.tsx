import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDashboard } from './DashboardContext';

describe('DashboardContext', () => {
    it('useDashboard throws when used outside DashboardProvider', () => {
        expect(() => {
            renderHook(() => useDashboard());
        }).toThrow('useDashboard must be used inside DashboardProvider');
    });
});
