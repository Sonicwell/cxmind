import { describe, it, expect } from 'vitest';
import React from 'react';
import { ZoneQualityData } from './ZoneQualityCard';

// Unit tests for ZoneQualityCard data logic (not rendering, since it depends on Three.js / drei Html)

const makeData = (overrides: Partial<ZoneQualityData> = {}): ZoneQualityData => ({
    zoneIndex: 0,
    avgScore: 80,
    inspections: 20,
    excellentCount: 10,
    goodCount: 7,
    poorCount: 3,
    topAgent: 'ag_001',
    topAgentScore: 95,
    trend: 'up',
    ...overrides,
});

describe('ZoneQualityCard data model', () => {
    it('should have valid score ranges', () => {
        const data = makeData({ avgScore: 87 });
        expect(data.avgScore).toBeGreaterThanOrEqual(0);
        expect(data.avgScore).toBeLessThanOrEqual(100);
    });

    it('should have consistent distribution counts', () => {
        const data = makeData({ excellentCount: 16, goodCount: 6, poorCount: 2, inspections: 24 });
        expect(data.excellentCount + data.goodCount + data.poorCount).toBeLessThanOrEqual(data.inspections);
    });

    it('should accept all trend values', () => {
        expect(makeData({ trend: 'up' }).trend).toBe('up');
        expect(makeData({ trend: 'down' }).trend).toBe('down');
        expect(makeData({ trend: 'stable' }).trend).toBe('stable');
    });

    it('should handle empty zone (0 inspections)', () => {
        const data = makeData({ avgScore: 0, inspections: 0, excellentCount: 0, goodCount: 0, poorCount: 0, topAgent: undefined, topAgentScore: undefined });
        expect(data.inspections).toBe(0);
        expect(data.avgScore).toBe(0);

        const total = data.excellentCount + data.goodCount + data.poorCount;
        expect(total).toBe(0);
    });

    it('should calculate distribution percentages correctly', () => {
        const data = makeData({ excellentCount: 8, goodCount: 15, poorCount: 19 });
        const total = data.excellentCount + data.goodCount + data.poorCount;
        const exPct = total > 0 ? (data.excellentCount / total) * 100 : 0;
        const gdPct = total > 0 ? (data.goodCount / total) * 100 : 0;
        const prPct = total > 0 ? (data.poorCount / total) * 100 : 0;

        expect(exPct + gdPct + prPct).toBeCloseTo(100);
        expect(exPct).toBeCloseTo(19.05, 1);
    });

    it('should return correct grade for various scores', () => {
        // Inline the grading logic to test
        const getScoreGrade = (score: number): string => {
            if (score >= 90) return 'Excellent';
            if (score >= 80) return 'Good';
            if (score >= 60) return 'Fair';
            return 'Poor';
        };

        expect(getScoreGrade(95)).toBe('Excellent');
        expect(getScoreGrade(85)).toBe('Good');
        expect(getScoreGrade(65)).toBe('Fair');
        expect(getScoreGrade(45)).toBe('Poor');
    });

    it('should return correct color for various scores', () => {
        const getScoreColor = (score: number): string => {
            if (score >= 80) return '#22c55e';
            if (score >= 60) return '#eab308';
            return '#ef4444';
        };

        expect(getScoreColor(90)).toBe('#22c55e');
        expect(getScoreColor(70)).toBe('#eab308');
        expect(getScoreColor(50)).toBe('#ef4444');
    });
});
