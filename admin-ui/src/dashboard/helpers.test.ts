import { describe, it, expect } from 'vitest';
import { mosGradeClass, mosGradeLetter, fmtDuration, COUNTRY_NAME_TO_ISO, PIE_COLORS, TIME_OPTIONS } from './helpers';

describe('mosGradeClass', () => {
    it('returns mos-excellent for >= 4.0', () => {
        expect(mosGradeClass(4.0)).toBe('mos-excellent');
        expect(mosGradeClass(4.5)).toBe('mos-excellent');
    });
    it('returns mos-good for >= 3.0', () => {
        expect(mosGradeClass(3.0)).toBe('mos-good');
        expect(mosGradeClass(3.9)).toBe('mos-good');
    });
    it('returns mos-fair for >= 2.0', () => {
        expect(mosGradeClass(2.0)).toBe('mos-fair');
        expect(mosGradeClass(2.9)).toBe('mos-fair');
    });
    it('returns mos-poor for < 2.0', () => {
        expect(mosGradeClass(1.9)).toBe('mos-poor');
        expect(mosGradeClass(0)).toBe('mos-poor');
    });
});

describe('mosGradeLetter', () => {
    it('returns A for >= 4.0', () => expect(mosGradeLetter(4.0)).toBe('A'));
    it('returns B for >= 3.5', () => expect(mosGradeLetter(3.5)).toBe('B'));
    it('returns C for >= 3.0', () => expect(mosGradeLetter(3.0)).toBe('C'));
    it('returns D for >= 2.0', () => expect(mosGradeLetter(2.0)).toBe('D'));
    it('returns F for < 2.0', () => expect(mosGradeLetter(1.9)).toBe('F'));
});

describe('fmtDuration', () => {
    it('formats 0 seconds', () => expect(fmtDuration(0)).toBe('00:00'));
    it('formats 90 seconds as 01:30', () => expect(fmtDuration(90)).toBe('01:30'));
    it('formats 3661 seconds as 61:01', () => expect(fmtDuration(3661)).toBe('61:01'));
    it('pads single-digit seconds', () => expect(fmtDuration(5)).toBe('00:05'));
    it('pads single-digit minutes', () => expect(fmtDuration(65)).toBe('01:05'));
});

describe('constants', () => {
    it('COUNTRY_NAME_TO_ISO maps US', () => {
        expect(COUNTRY_NAME_TO_ISO['US']).toBe('840');
        expect(COUNTRY_NAME_TO_ISO['USA']).toBe('840');
        expect(COUNTRY_NAME_TO_ISO['United States']).toBe('840');
    });
    it('PIE_COLORS has 4 entries', () => {
        expect(PIE_COLORS).toHaveLength(4);
    });
    it('TIME_OPTIONS has correct structure', () => {
        expect(TIME_OPTIONS).toHaveLength(4);
        expect(TIME_OPTIONS[0]).toEqual({ label: '1H', value: 1 });
        expect(TIME_OPTIONS[3]).toEqual({ label: '7D', value: 168 });
    });
});
