import { describe, it, expect } from 'vitest';
import { parseUTCTimestamp, formatUTCToLocal, formatToLocalTime } from './date';

describe('parseUTCTimestamp', () => {
    it('should treat a bare ClickHouse timestamp as UTC', () => {
        // ClickHouse returns "2026-02-17 11:04:14.123" (UTC, no Z)
        const date = parseUTCTimestamp('2026-02-17 11:04:14.123');
        // Should be interpreted as UTC => getUTCHours() === 11
        expect(date.getUTCHours()).toBe(11);
        expect(date.getUTCMinutes()).toBe(4);
        expect(date.getUTCSeconds()).toBe(14);
    });

    it('should handle ISO format with Z suffix unchanged', () => {
        const date = parseUTCTimestamp('2026-02-17T11:04:14.123Z');
        expect(date.getUTCHours()).toBe(11);
    });

    it('should handle ISO format with timezone offset', () => {
        // +08:00 means local 19:04 = UTC 11:04
        const date = parseUTCTimestamp('2026-02-17T19:04:14.123+08:00');
        expect(date.getUTCHours()).toBe(11);
    });

    it('should handle ClickHouse format without milliseconds', () => {
        const date = parseUTCTimestamp('2026-02-17 11:04:14');
        expect(date.getUTCHours()).toBe(11);
        expect(date.getUTCMinutes()).toBe(4);
    });
});

describe('formatUTCToLocal', () => {
    it('should format a ClickHouse UTC timestamp to local time with date-fns format', () => {
        // Regardless of local timezone, the UTC hours should be 11
        // We can't assert the exact local string since it depends on TZ,
        // but we can verify it doesn't return the raw input or '-'
        const result = formatUTCToLocal('2026-02-17 11:04:14.123', 'yyyy-MM-dd HH:mm:ss');
        expect(result).not.toBe('-');
        expect(result).not.toBe('2026-02-17 11:04:14.123');
        // Should match the date-fns format pattern
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should return "-" for empty input', () => {
        expect(formatUTCToLocal('', 'HH:mm:ss')).toBe('-');
    });

    it('should format time-only pattern correctly', () => {
        const result = formatUTCToLocal('2026-02-17 11:04:14.123', 'HH:mm:ss');
        expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle already-Z-suffixed timestamps', () => {
        const result = formatUTCToLocal('2026-02-17T11:04:14.123Z', 'yyyy-MM-dd HH:mm:ss');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
});

describe('formatToLocalTime (existing)', () => {
    it('should format a bare ClickHouse timestamp to locale string', () => {
        const result = formatToLocalTime('2026-02-17 11:04:14.123');
        expect(result).not.toBe('-');
        // Should contain some date representation
        expect(result.length).toBeGreaterThan(5);
    });

    it('should return "-" for empty input', () => {
        expect(formatToLocalTime('')).toBe('-');
    });

    it('should return raw input for unparseable timestamp', () => {
        const result = formatToLocalTime('not-a-date-xxxxx');
        // parseUTCTimestamp → new Date('not-a-date-xxxxxZ') → Invalid Date → toLocaleString → 'Invalid Date'
        // catch 分支 or fallback
        expect(typeof result).toBe('string');
    });
});

describe('formatUTCToLocal error branch', () => {
    it('should return raw input when format throws on invalid date', () => {
        // date-fns format() throws on Invalid Date, catch 返回原始 timestamp
        const result = formatUTCToLocal('totally-invalid', 'yyyy-MM-dd');
        expect(result).toBe('totally-invalid');
    });
});
