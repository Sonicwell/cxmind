import { describe, it, expect } from 'vitest';
import { filterNavItems, type SearchableNavItem } from './GlobalSearch';

// Simulate navItems as they would appear when UI is in Chinese
const navItemsChinese: SearchableNavItem[] = [
    { id: '/dashboard', title: '总览', subtitle: '核心运营', type: 'nav', enTitle: 'Dashboard', enSubtitle: 'Operations' },
    { id: '/monitoring', title: '实时监听', subtitle: '核心运营', type: 'nav', enTitle: 'Monitoring', enSubtitle: 'Operations' },
    { id: '/inbox', title: '全渠道收件箱', subtitle: '系统配置', type: 'nav', enTitle: 'Omnichannel Inbox', enSubtitle: 'System' },
    { id: '/settings', title: '系统设置', subtitle: '系统配置', type: 'nav', enTitle: 'Settings', enSubtitle: 'System' },
    { id: '/agents', title: '坐席管理', subtitle: '平台管理', type: 'nav', enTitle: 'Agents', enSubtitle: 'Management' },
    { id: '/calls', title: '通话记录', subtitle: '智能与日志', type: 'nav', enTitle: 'Sip Calls', enSubtitle: 'Intelligence & Logs' },
];

// Simulate navItems as they would appear when UI is in English
const navItemsEnglish: SearchableNavItem[] = [
    { id: '/dashboard', title: 'Dashboard', subtitle: 'Operations', type: 'nav', enTitle: 'Dashboard', enSubtitle: 'Operations' },
    { id: '/inbox', title: 'Omnichannel Inbox', subtitle: 'System', type: 'nav', enTitle: 'Omnichannel Inbox', enSubtitle: 'System' },
    { id: '/settings', title: 'Settings', subtitle: 'System', type: 'nav', enTitle: 'Settings', enSubtitle: 'System' },
];

describe('filterNavItems', () => {
    // ── Basic matching (title/subtitle in current locale) ──
    it('should match by translated title (Chinese)', () => {
        const results = filterNavItems(navItemsChinese, '收件箱');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/inbox');
    });

    it('should match by translated subtitle (Chinese)', () => {
        const results = filterNavItems(navItemsChinese, '核心运营');
        expect(results).toHaveLength(2);
        expect(results.map(r => r.id)).toEqual(['/dashboard', '/monitoring']);
    });

    // ── English keywords always work regardless of locale ──
    it('should match by English title when UI is in Chinese', () => {
        const results = filterNavItems(navItemsChinese, 'inbox');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/inbox');
    });

    it('should match by English subtitle when UI is in Chinese', () => {
        const results = filterNavItems(navItemsChinese, 'management');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/agents');
    });

    it('should match partial English keyword in Chinese locale', () => {
        const results = filterNavItems(navItemsChinese, 'dash');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/dashboard');
    });

    // ── Route path matching ──
    it('should match by route path segment', () => {
        const results = filterNavItems(navItemsChinese, 'monitor');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/monitoring');
    });

    // ── Case insensitive ──
    it('should be case insensitive', () => {
        const results = filterNavItems(navItemsChinese, 'INBOX');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/inbox');
    });

    // ── English locale still works normally ──
    it('should work normally in English locale', () => {
        const results = filterNavItems(navItemsEnglish, 'settings');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('/settings');
    });

    // ── No results ──
    it('should return empty array for non-matching query', () => {
        const results = filterNavItems(navItemsChinese, 'zzzznonexistent');
        expect(results).toHaveLength(0);
    });

    // ── Multiple matches via English ──
    it('should return multiple matches via English group name', () => {
        const results = filterNavItems(navItemsChinese, 'system');
        expect(results).toHaveLength(2);
        expect(results.map(r => r.id).sort()).toEqual(['/inbox', '/settings']);
    });
});
