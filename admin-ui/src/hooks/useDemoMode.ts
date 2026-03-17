import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storage-keys';

/**
 * Global hook for demo mode state.
 * Synchronizes across all components via the 'demo-mode-changed' custom event.
 */
export function useDemoMode() {
    const isBuildDemo = import.meta.env.VITE_MOCK_MODE === 'true';
    const [demoMode, setDemoModeState] = useState(
        () => isBuildDemo || localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true'
    );

    useEffect(() => {
        const sync = () => {
            setDemoModeState(isBuildDemo || localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true');
        };
        window.addEventListener('demo-mode-changed', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('demo-mode-changed', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    const setDemoMode = useCallback((on: boolean) => {
        if (isBuildDemo) return; // Cannot toggle off build-time demo mode
        localStorage.setItem(STORAGE_KEYS.DEMO_MODE, String(on));
        window.dispatchEvent(new Event('demo-mode-changed'));
    }, [isBuildDemo]);

    return { demoMode, setDemoMode };
}
