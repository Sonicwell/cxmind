/**
 * CSV Export Utility — generates CSV strings from tabular data
 * and triggers browser download. Uses BOM prefix for Excel compatibility.
 */

export interface ExportColumn<T> {
    key: keyof T | string;
    label: string;
    /** Optional formatter — receives the row and returns display string */
    format?: (row: T) => string;
}

/**
 * Convert array of objects to CSV string.
 * Handles quoting, commas in values, and newlines.
 */
export function toCSV<T>(data: T[], columns: ExportColumn<T>[]): string {
    const header = columns.map(c => escapeCSV(c.label)).join(',');

    const rows = data.map(row =>
        columns.map(col => {
            let value: string;
            if (col.format) {
                value = col.format(row);
            } else {
                const raw = (row as any)[col.key];
                value = raw === null || raw === undefined ? '' : String(raw);
            }
            return escapeCSV(value);
        }).join(',')
    );

    return [header, ...rows].join('\n');
}

/**
 * Escape a CSV field — wraps in quotes if contains comma, newline, or quote.
 */
function escapeCSV(value: string): string {
    // 长数字(≥11位)强制文本化，防 Excel 科学计数法
    if (/^\+?\d{11,}$/.test(value)) {
        return `"\t${value.replace(/"/g, '""')}"`;
    }
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Download a CSV string as a file.
 * Prepends UTF-8 BOM for Excel compatibility.
 */
export function downloadCSV(csv: string, filename: string): void {
    const bom = '\uFEFF'; // UTF-8 BOM for Excel
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Convenience: convert data → CSV → download in one call.
 */
export function exportToCSV<T>(
    data: T[],
    columns: ExportColumn<T>[],
    filename: string,
): void {
    const csv = toCSV(data, columns);
    downloadCSV(csv, filename);
}

/**
 * Generate a timestamp-based filename.
 * e.g. "calls_2026-02-20_08-30" 
 */
export function exportFilename(prefix: string): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10); // 2026-02-20
    const time = now.toTimeString().slice(0, 5).replace(':', '-'); // 08-30
    return `${prefix}_${date}_${time}`;
}
