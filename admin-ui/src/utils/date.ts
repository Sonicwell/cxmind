import { format } from 'date-fns';

/**
 * Parse a ClickHouse UTC timestamp into a proper Date object.
 * Appends 'Z' if no timezone info is present so the browser
 * interprets it as UTC rather than local time.
 */
export const parseUTCTimestamp = (timestamp: string): Date => {
    let ts = timestamp;
    if (!ts.endsWith('Z') && !ts.includes('+') && !ts.match(/-\d\d:?\d\d$/)) {
        ts = ts.replace(' ', 'T') + 'Z';
    }
    return new Date(ts);
};

/**
 * Format a ClickHouse UTC timestamp to the browser's local time
 * using a date-fns format string.
 *
 * @param timestamp  The raw timestamp from ClickHouse
 * @param fmt        A date-fns format string, e.g. 'yyyy-MM-dd HH:mm:ss'
 */
export const formatUTCToLocal = (timestamp: string, fmt: string): string => {
    if (!timestamp) return '-';
    try {
        return format(parseUTCTimestamp(timestamp), fmt);
    } catch (e) {
        console.error('Error formatting date:', e);
        return timestamp;
    }
};

/**
 * Format a timestamp string to the browser's local time.
 * Assumes the input timestamp is in UTC if no timezone info is present.
 *
 * @param timestamp The timestamp string (e.g., from ClickHouse)
 * @returns Localized date string via toLocaleString()
 */
export const formatToLocalTime = (timestamp: string): string => {
    if (!timestamp) return '-';
    try {
        return parseUTCTimestamp(timestamp).toLocaleString();
    } catch (e) {
        console.error('Error formatting date:', e);
        return timestamp;
    }
};
