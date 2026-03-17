import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '../ui/button';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
}

/**
 * RouteErrorBoundary acts as a fail-safe for React.lazy().
 * Specifically designed to catch ChunkLoadError, which occurs when a user tries 
 * to navigate to a new route but the underlying JS chunk has been removed from 
 * the server due to a new deployment.
 */
export class RouteErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(_: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error in route component:", error, errorInfo);

        // Check if the error is a ChunkLoadError (specific to Webpack/Vite dynamic imports failing)
        const isChunkLoadError = error?.name === 'ChunkLoadError' ||
            (error?.message && /Failed to fetch dynamically imported module/i.test(error.message));

        if (isChunkLoadError) {
            console.warn("Detected ChunkLoadError (possible new deployment). Forcing hard reload to fetch new bundles...");

            // We use a small timeout to prevent infinite reload loops just in case
            // the server is actually down or the chunk legitimately doesn't exist anymore on the new version.
            // In production, you might want to show a toast message here before reloading.
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-primary, #f8fafc)' }}>
                    <h2>Oops, something went wrong loading this component.</h2>
                    <p style={{ color: 'var(--text-secondary, #94a3b8)', marginBottom: '1rem' }}>
                        A new version of the application might have been released. We'll try to recover automatically.
                    </p>
                    <Button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '8px 16px',
                            background: 'var(--primary, #6366f1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Reload Page
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
