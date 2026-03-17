import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Syncs a tab/sub-view key with URL search params so the active tab
 * persists across page refreshes and is shareable via URL.
 *
 * Usage:
 *   const [tab, setTab] = useTabParam('tab', 'agents');
 *   // URL becomes ?tab=groups when setTab('groups') is called
 */
export function useTabParam<T extends string>(
    paramName: string = 'tab',
    defaultValue: T,
): [T, (value: T) => void] {
    const [searchParams, setSearchParams] = useSearchParams();

    const currentValue = (searchParams.get(paramName) as T) || defaultValue;

    const setValue = useCallback((value: T) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value === defaultValue) {
                next.delete(paramName); // keep URL clean for default tab
            } else {
                next.set(paramName, value);
            }
            return next;
        }, { replace: true });
    }, [paramName, defaultValue, setSearchParams]);

    return [currentValue, setValue];
}
