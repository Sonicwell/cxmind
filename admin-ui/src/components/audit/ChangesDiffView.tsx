import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface ChangesDiffViewProps {
    changes: string | Record<string, any>;
}

/**
 * Parses a changes value into a normalised record of { field → { old, new } }.
 * Accepts either a JSON string or an already-parsed object.
 *
 * Handles two common shapes coming from the backend:
 *   1. { fieldName: { old: X, new: Y } }   — explicit before/after
 *   2. { fieldName: newValue }              — simple key-value (old unknown)
 */
function parseChanges(raw: string | Record<string, any>): Record<string, { old?: any; new?: any }> | null {
    let obj: Record<string, any>;

    if (typeof raw === 'string') {
        if (!raw || raw === '{}' || raw === '""') return null;
        try {
            obj = JSON.parse(raw);
        } catch {
            return null;
        }
    } else {
        obj = raw;
    }

    if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) return null;

    const result: Record<string, { old?: any; new?: any }> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && ('old' in value || 'new' in value)) {
            result[key] = { old: value.old, new: value.new };
        } else {
            // Simple value — treat as new value with unknown old
            result[key] = { new: value };
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

function formatValue(val: any): string {
    if (val === undefined || val === null) return '—';
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
}

const ChangesDiffView: React.FC<ChangesDiffViewProps> = ({ changes }) => {
    const { t } = useTranslation();
    const parsed = parseChanges(changes);

    if (!parsed) return null;

    const styles = {
        table: {
            width: '100%',
            borderCollapse: 'collapse' as const,
            fontSize: '0.8125rem',
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        },
        th: {
            padding: '0.5rem 0.75rem',
            textAlign: 'left' as const,
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--glass-border)',
        },
        td: {
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid var(--glass-border)',
            verticalAlign: 'top' as const,
            wordBreak: 'break-word' as const,
        },
        fieldCell: {
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap' as const,
        },
        oldCell: {
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            color: '#f87171',
            borderLeft: '3px solid rgba(239, 68, 68, 0.4)',
        },
        newCell: {
            backgroundColor: 'rgba(34, 197, 94, 0.08)',
            color: '#4ade80',
            borderLeft: '3px solid rgba(34, 197, 94, 0.4)',
        },
        header: {
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
        },
        container: {
            backgroundColor: 'var(--bg-dark)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            overflow: 'auto',
        },
    };

    const entries = Object.entries(parsed);

    return (
        <div style={styles.container}>
            <h3 style={styles.header}>
                <span style={{ fontSize: '1rem' }}>⇄</span>
                {t('audit.changesDetected', 'Changes Detected')}
                <span style={{
                    padding: '0.15rem 0.5rem',
                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--primary)',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                }}>
                    {entries.length} {entries.length === 1 ? 'field' : 'fields'}
                </span>
            </h3>
            <Table style={styles.table}>
                <TableHeader>
                    <TableRow>
                        <TableHead style={styles.th}>{t('audit.diffField', 'Field')}</TableHead>
                        <TableHead style={styles.th}>{t('audit.diffBefore', 'Before')}</TableHead>
                        <TableHead style={styles.th}>{t('audit.diffAfter', 'After')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {entries.map(([field, { old: oldVal, new: newVal }]) => (
                        <TableRow key={field}>
                            <TableCell style={{ ...styles.td, ...styles.fieldCell }}>{field}</TableCell>
                            <TableCell style={{ ...styles.td, ...styles.oldCell }}>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
                                    {formatValue(oldVal)}
                                </pre>
                            </TableCell>
                            <TableCell style={{ ...styles.td, ...styles.newCell }}>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
                                    {formatValue(newVal)}
                                </pre>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export default ChangesDiffView;
