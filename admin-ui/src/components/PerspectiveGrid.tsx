/**
 * PerspectiveGrid — Reusable React wrapper for <perspective-viewer>
 *
 * Wraps the FINOS Perspective WASM datagrid for use in CXMind widgets.
 * Features:
 *  - Lazy WASM loading (only loads when component mounts)
 *  - Incremental data updates via table.replace()
 *  - Row click callback for opening CallDetails / SipDialog
 *  - CXMind dark theme integration
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { getWorker } from '../utils/perspective-worker';

import '@finos/perspective-viewer';
import '@finos/perspective-viewer-datagrid';
import '@finos/perspective-viewer-d3fc';

// Import custom CXMind theme
import '../styles/perspective-cxmind.css';

// Custom element declaration handled by library or we suppress if needed
// declare global {
//     namespace JSX {
//         interface IntrinsicElements {
//             'perspective-viewer': React.DetailedHTMLProps<
//                 React.HTMLAttributes<HTMLElement> & {
//                     theme?: string;
//                     columns?: string;
//                     sort?: string;
//                     filter?: string;
//                     'group-by'?: string;
//                     plugin?: string;
//                     settings?: string;
//                     aggregates?: string;
//                 },
//                 HTMLElement
//             >;
//         }
//     }
// }

export interface PerspectiveGridProps {
    /** Data to display — can be JSON array or Apache Arrow ArrayBuffer */
    data: Record<string, unknown>[] | ArrayBuffer | null;
    /** Visible columns (ordered) */
    columns?: string[];
    /** Sort spec: [["column", "asc"|"desc"], ...] */
    sort?: Array<[string, 'asc' | 'desc']>;
    /** Filter spec: [["column", "operator", value], ...] */
    filter?: Array<[string, string, unknown]>;
    /** Group-by columns for pivot table */
    groupBy?: string[];
    /** Perspective plugin: "Datagrid" (default) or "X/Y Scatter" etc. */
    plugin?: string;
    /** Whether to show the config panel */
    settings?: boolean;
    /** Callback when a row is clicked */
    onRowClick?: (rowData: Record<string, unknown>) => void;
    /** Custom CSS class for container */
    className?: string;
    /** Height (default: 100%) */
    height?: string;
    /** Title displayed above the grid (optional) */
    title?: string;
    /** Whether the toolbar is editable (default: false to hide settings gear) */
    editable?: boolean;
}

const PerspectiveGrid: React.FC<PerspectiveGridProps> = ({
    data,
    columns,
    sort,
    filter,
    groupBy,
    plugin = 'Datagrid',
    settings = false,
    onRowClick,
    className,
    height = '100%',
    title,
    editable = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<HTMLElement | null>(null);
    const tableRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initialize Perspective viewer
    const initViewer = useCallback(async () => {
        if (!containerRef.current || !data) return;

        try {
            setLoading(true);
            setError(null);

            const worker = await getWorker();

            // Create table from data
            const table = await worker.table(data as any);
            tableRef.current = table;

            // Get or create the viewer element
            if (!viewerRef.current) {
                const viewer = document.createElement('perspective-viewer');
                viewer.setAttribute('theme', 'Pro Dark');
                viewer.setAttribute('plugin', plugin);
                viewer.classList.add('perspective-viewer-cxmind');

                if (!editable) {
                    viewer.setAttribute('settings', 'false');
                }

                containerRef.current.innerHTML = '';
                containerRef.current.appendChild(viewer);
                viewerRef.current = viewer;
            }

            const viewer = viewerRef.current as any;

            // Load data into viewer
            await viewer.load(table);

            // Apply configuration
            const config: Record<string, unknown> = {};
            if (columns) config.columns = columns;
            if (sort) config.sort = sort;
            if (filter) config.filter = filter;
            if (groupBy) config.group_by = groupBy;
            if (settings) config.settings = settings;

            if (Object.keys(config).length > 0) {
                await viewer.restore(config);
            }

            // Set up row click handler
            if (onRowClick) {
                viewer.addEventListener('perspective-click', (event: CustomEvent) => {
                    const row = event.detail?.row;
                    if (row) onRowClick(row);
                });
            }

            setLoading(false);
        } catch (err: any) {
            console.error('[PerspectiveGrid] Init error:', err);
            setError(err.message || 'Failed to initialize Perspective');
            setLoading(false);
        }
    }, []); // intentionally empty — we manage updates via useEffect below

    // Initial load
    useEffect(() => {
        if (data) {
            initViewer();
        }
        return () => {
            // Cleanup: delete table to free WASM memory
            if (tableRef.current) {
                tableRef.current.delete();
                tableRef.current = null;
            }
            viewerRef.current = null;
        };
    }, []); // mount/unmount only

    // Data updates (incremental replace)
    useEffect(() => {
        if (!data || !tableRef.current) {
            // If data arrived after initial mount, init fresh
            if (data && !tableRef.current) {
                initViewer();
            }
            return;
        }

        // Replace entire dataset (Perspective handles diff internally)
        tableRef.current.replace(data as any);
    }, [data]);

    // Config updates
    useEffect(() => {
        if (!viewerRef.current) return;
        const viewer = viewerRef.current as any;

        const config: Record<string, unknown> = {};
        if (columns) config.columns = columns;
        if (sort) config.sort = sort;
        if (filter) config.filter = filter;
        if (groupBy) config.group_by = groupBy;

        if (Object.keys(config).length > 0) {
            viewer.restore(config).catch(() => { });
        }
    }, [columns, sort, filter, groupBy]);

    return (
        <div
            className={`perspective-grid-container ${className || ''}`}
            style={{ height, display: 'flex', flexDirection: 'column' }}
        >
            {title && (
                <h3 className="widget-title" style={{ margin: '0 0 8px 0' }}>
                    {title}
                </h3>
            )}
            <div
                ref={containerRef}
                style={{ flex: 1, minHeight: 0, position: 'relative' }}
            >
                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)', fontSize: '0.9rem',
                    }}>
                        Loading data engine...
                    </div>
                )}
                {error && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--danger)', fontSize: '0.9rem',
                    }}>
                        ⚠ {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PerspectiveGrid;
