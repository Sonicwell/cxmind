import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { PREF_PREFIX as LS_PREFIX } from '../constants/storage-keys';

/**
 * usePreference — Syncs a preference to both localStorage (instant) and server API (debounced).
 *
 * Flow:
 *   1. Mount → load from localStorage (instant), then fetch from API (background)
 *   2. Save  → write localStorage immediately, debounce API PUT by `debounceMs`
 *   3. Offline → localStorage fallback keeps working, next online save syncs
 */
export function usePreference<T>(key: string, defaultValue: T, debounceMs = 1000) {
    // ── 1. Initial state from localStorage ──
    const [data, setData] = useState<T>(() => {
        try {
            const raw = localStorage.getItem(LS_PREFIX + key);
            if (raw) return JSON.parse(raw) as T;
        } catch { /* ignore */ }
        return defaultValue;
    });

    const [loading, setLoading] = useState(true);
    const [synced, setSynced] = useState(false);

    // Ref to track if component is mounted (avoid state updates after unmount)
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    // ── 2. Fetch from API on mount ──
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res = await api.get(`/preferences/${key}`);
                if (!cancelled && mounted.current) {
                    const serverValue = res.data.value as T;
                    setData(serverValue);
                    // Update localStorage cache
                    localStorage.setItem(LS_PREFIX + key, JSON.stringify(serverValue));
                    setSynced(true);
                }
            } catch (err: any) {
                // 404 = no server preference yet, use localStorage/default
                if (err?.response?.status !== 404) {
                    console.warn(`[usePreference] Failed to fetch '${key}':`, err);
                }
            } finally {
                if (!cancelled && mounted.current) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [key]);

    // ── 3. Debounced API save ──
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const save = useCallback((value: T) => {
        // Immediate: update React state + localStorage
        setData(value);
        try {
            localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
        } catch { /* quota exceeded, ignore */ }

        // Debounced: PUT to API
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            try {
                await api.put(`/preferences/${key}`, { value });
                if (mounted.current) setSynced(true);
            } catch (err) {
                console.warn(`[usePreference] Failed to save '${key}':`, err);
            }
        }, debounceMs);
    }, [key, debounceMs]);

    // Cleanup timer on unmount
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    return { data, loading, synced, save };
}
