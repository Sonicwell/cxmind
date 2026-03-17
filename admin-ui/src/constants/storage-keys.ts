/** All localStorage keys — single source of truth.
 *  Convention: `cxmind:<domain>:<name>`
 *  The `cxmind_pref_` prefix is reserved for usePreference hook (server-synced). */

export const STORAGE_KEYS = {
    // ── Auth ──
    AUTH_TOKEN: 'cxmind:auth:token',
    AUTH_USER: 'cxmind:auth:user',
    AUTH_REMEMBER_ME: 'cxmind:auth:remember-me',
    AUTH_SAVED_EMAIL: 'cxmind:auth:saved-email',
    AUTH_REFRESH_TOKEN: 'cxmind:auth:refresh-token',
    AUTH_PERMISSIONS: 'cxmind:auth:permissions',

    // ── UI Preferences (local-only) ──
    THEME: 'cxmind:ui:theme',
    SIDEBAR_COLLAPSED: 'cxmind:ui:sidebar-collapsed',

    // ── Feature Flags ──
    DEMO_MODE: 'cxmind:demo-mode',

    // ── SOP Builder ──
    SOP_CART: 'cxmind:sop:cart',
} as const;

/** Prefix used by the usePreference hook — stored as `cxmind_pref_<key>` */
export const PREF_PREFIX = 'cxmind_pref_';

/** Legacy keys that should be cleaned up during migration */
export const LEGACY_KEYS = [
    // Old auth keys (bare)
    'token',
    'user',
    // Old UI keys (bare / inconsistent)
    'app-theme',
    'sidebar-collapsed',
    // Old demo mode key (different separator)
    'cxmind:demoMode',
    // Orphaned AgentMap keys (superseded by cxmind_pref_agent_map_prefs)
    'agent_map_viewMode',
    'agent_map_floor',
    'agent_map_slots',
    // Orphaned Dashboard key (superseded by cxmind_pref_dashboard_layout)
    'cxmind_dashboard_layout',
    // Old dashboard layout preference (superseded by dashboard_views)
    'cxmind_pref_dashboard_layout',
    // [SEC-1] v2 migration: password must never be stored in localStorage
    'cxmind:auth:saved-password',
] as const;
