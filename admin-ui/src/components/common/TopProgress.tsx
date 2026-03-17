import React, { useEffect } from 'react';
import NProgress from 'nprogress';
import { PageLoader } from './PageLoader';

// Configure NProgress once globally
NProgress.configure({ showSpinner: false, speed: 400, minimum: 0.1 });

/**
 * A fallback component for React.Suspense that displays a top progress bar.
 * It also wraps the existing `PageLoader` so the center spinner still appears.
 */
export const TopProgress: React.FC = () => {
    useEffect(() => {
        NProgress.start();
        return () => {
            NProgress.done();
        };
    }, []);

    // Render the original circular loader while the top bar is progressing
    return <PageLoader />;
};
