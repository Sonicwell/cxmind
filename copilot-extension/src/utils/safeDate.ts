/**
 * Safely parse date strings from the API / ClickHouse.
 *
 * ClickHouse returns timestamps in "YYYY-MM-DD HH:MM:SS" format (UTC)
 * without a timezone indicator.  `new Date("2026-02-18 07:06:00")`
 * is parsed as *local* time in most browsers, which is wrong.
 *
 * This helper normalises the string to ISO-8601 with a trailing "Z"
 * so that `Date` always interprets it as UTC.
 */
export function safeDate(val: string | Date | null | undefined): Date {
    if (!val) return new Date()
    if (val instanceof Date) return val

    let s = val as string

    // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ"
    if (s.includes(" ") && !s.includes("T")) {
        s = s.replace(" ", "T") + "Z"
    } else if (!s.includes("Z") && !s.includes("+")) {
        s = s + "Z"
    }

    const d = new Date(s)
    return isNaN(d.getTime()) ? new Date() : d
}
