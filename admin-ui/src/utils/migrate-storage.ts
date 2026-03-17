import { STORAGE_KEYS, LEGACY_KEYS } from '../constants/storage-keys';

const STORAGE_VERSION_KEY = 'cxmind:storage_version';
const CURRENT_VERSION = '2'; // v2: removes stored password (SEC-1)

/**
 * One-time migration: moves values from legacy key names to the new
 * `cxmind:*` namespace, then removes legacy keys.
 *
 * Safe to call on every app boot — it no-ops if already migrated.
 */
export function migrateStorage(): void {
    if (localStorage.getItem(STORAGE_VERSION_KEY) === CURRENT_VERSION) return;

    const MIGRATION_MAP: Record<string, string> = {
        'token': STORAGE_KEYS.AUTH_TOKEN,
        'user': STORAGE_KEYS.AUTH_USER,
        'app-theme': STORAGE_KEYS.THEME,
        'sidebar-collapsed': STORAGE_KEYS.SIDEBAR_COLLAPSED,
        'cxmind:demoMode': STORAGE_KEYS.DEMO_MODE,
    };

    // ── localStorage migration ──
    for (const [oldKey, newKey] of Object.entries(MIGRATION_MAP)) {
        const val = localStorage.getItem(oldKey);
        if (val !== null && localStorage.getItem(newKey) === null) {
            localStorage.setItem(newKey, val);
        }
    }

    // ── sessionStorage migration (auth only) ──
    const SESSION_MAP: Record<string, string> = {
        'token': STORAGE_KEYS.AUTH_TOKEN,
        'user': STORAGE_KEYS.AUTH_USER,
    };

    for (const [oldKey, newKey] of Object.entries(SESSION_MAP)) {
        const val = sessionStorage.getItem(oldKey);
        if (val !== null && sessionStorage.getItem(newKey) === null) {
            sessionStorage.setItem(newKey, val);
        }
    }

    // ── Cleanup legacy keys ──
    for (const key of LEGACY_KEYS) {
        localStorage.removeItem(key);
    }
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');

    // Mark as migrated
    localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION);
}
