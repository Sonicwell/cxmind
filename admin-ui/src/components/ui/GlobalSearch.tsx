import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, Users, Phone, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';
import classNames from 'classnames';
import api from '../../services/api';

interface SearchResult {
    id: string;
    title: string;
    subtitle: string;
    type: 'agent' | 'call' | 'nav';
    data?: any;
    icon?: React.ReactNode;
}

export interface SearchableNavItem extends SearchResult {
    enTitle: string;
    enSubtitle: string;
}

/**
 * Pure function to filter navigation items.
 * Matches against: translated title, translated subtitle, English title,
 * English subtitle, and route path — so English search always works
 * regardless of UI language.
 */
export function filterNavItems(items: SearchableNavItem[], query: string): SearchableNavItem[] {
    const lowerQuery = query.toLowerCase();
    return items.filter(item =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.subtitle.toLowerCase().includes(lowerQuery) ||
        item.enTitle.toLowerCase().includes(lowerQuery) ||
        item.enSubtitle.toLowerCase().includes(lowerQuery) ||
        item.id.toLowerCase().includes(lowerQuery)
    );
}

interface GlobalSearchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ open, onOpenChange }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<{ navs: SearchResult[], agents: SearchResult[], calls: SearchResult[] }>({ navs: [], agents: [], calls: [] });
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { t } = useTranslation();

    // Define searchable navigation items
    // Fixed English translator — always resolves to en.json regardless of UI language
    const tEn = React.useMemo(() => i18n.getFixedT('en'), []);

    const navItems = React.useMemo<SearchableNavItem[]>(() => {
        const makeItem = (id: string, titleKey: string, subtitleKey: string): SearchableNavItem => ({
            id, type: 'nav',
            title: t(titleKey),
            subtitle: t(subtitleKey),
            enTitle: tEn(titleKey),
            enSubtitle: tEn(subtitleKey),
        });
        return [
            makeItem('/dashboard', 'sidebar.dashboard', 'sidebar.groupOperations'),
            makeItem('/monitoring', 'sidebar.monitoring', 'sidebar.groupOperations'),
            makeItem('/contacts', 'sidebar.contact360', 'sidebar.groupOperations'),
            makeItem('/assistant', 'sidebar.assistant', 'sidebar.groupOperations'),
            makeItem('/alerts', 'sidebar.alerts', 'sidebar.groupOperations'),
            makeItem('/calls', 'sidebar.calls', 'sidebar.groupIntelligence'),
            makeItem('/events', 'sidebar.callEvents', 'sidebar.groupIntelligence'),
            makeItem('/analytics', 'sidebar.analytics', 'sidebar.groupIntelligence'),
            makeItem('/roi', 'sidebar.roiAnalytics', 'sidebar.groupIntelligence'),
            makeItem('/users', 'sidebar.userManagement', 'sidebar.groupManagement'),
            makeItem('/agents', 'sidebar.agents', 'sidebar.groupManagement'),
            makeItem('/wfm', 'sidebar.wfm', 'sidebar.groupManagement'),
            makeItem('/map', 'sidebar.agentMap', 'sidebar.groupManagement'),
            makeItem('/actions', 'sidebar.actionCenter', 'sidebar.groupSystem'),
            makeItem('/inbox', 'sidebar.inbox', 'sidebar.groupSystem'),
            { id: '/knowledge', type: 'nav', title: 'Knowledge Base', subtitle: t('sidebar.groupSystem'), enTitle: 'Knowledge Base', enSubtitle: tEn('sidebar.groupSystem') },
            makeItem('/playground', 'sidebar.demo', 'sidebar.groupSystem'),
            makeItem('/qi', 'sidebar.quality', 'sidebar.groupSystem'),
            makeItem('/audit', 'sidebar.auditLogs', 'sidebar.groupSystem'),
            makeItem('/webhooks', 'sidebar.crmWebhooks', 'sidebar.groupSystem'),
            makeItem('/settings', 'sidebar.settings', 'sidebar.groupSystem'),
            makeItem('/templates', 'sidebar.templates', 'sidebar.groupSystem'),
            { id: '/sop', type: 'nav', title: t('sidebar.sopLibrary', 'SOP Library'), subtitle: t('sidebar.groupSystem'), enTitle: 'SOP Library', enSubtitle: tEn('sidebar.groupSystem') },
            { id: '/sop/builder', type: 'nav', title: t('sidebar.sopBuilder', 'SOP Builder'), subtitle: t('sidebar.groupSystem'), enTitle: 'SOP Builder', enSubtitle: tEn('sidebar.groupSystem') },
            makeItem('/integrations', 'sidebar.integrations', 'sidebar.groupSystem'),
        ];
    }, [t, tEn]);

    // Reset state when opening
    useEffect(() => {
        if (open) {
            setQuery('');
            setResults({ navs: [], agents: [], calls: [] });
            setSelectedIndex(0);
            // Focus input after a small delay to allow animation
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Flatten results for keyboard navigation
    const flatResults = React.useMemo(() => [
        ...results.navs.map(r => ({ ...r, category: 'Navigation' })),
        ...results.agents.map(r => ({ ...r, category: 'Agents' })),
        ...results.calls.map(r => ({ ...r, category: 'Calls' }))
    ], [results]);

    // Debounced Search
    useEffect(() => {
        const handler = setTimeout(() => {
            if (query.trim().length >= 2) {
                setLoading(true);

                // 1. Local search for navigation (matches translated + English + route path)
                const matchedNavs = filterNavItems(navItems, query.trim());

                // 2. Remote search for agents and calls
                api.get(`/search?q=${encodeURIComponent(query)}`)
                    .then((res: any) => {
                        const data = res.data;
                        setResults({ navs: matchedNavs, agents: data.agents || [], calls: data.calls || [] });
                        setSelectedIndex(0);
                    })
                    .catch((err: any) => {
                        console.error('Search failed:', err);
                        // Still show local nav results on api error
                        setResults({ navs: matchedNavs, agents: [], calls: [] });
                        setSelectedIndex(0);
                    })
                    .finally(() => setLoading(false));
            } else {
                setResults({ navs: [], agents: [], calls: [] });
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [query]);

    // Keyboard Navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (flatResults[selectedIndex]) {
                handleSelect(flatResults[selectedIndex]);
            }
        }
    };

    const handleSelect = (item: SearchResult) => {
        if (item.type === 'nav') {
            navigate(item.id);
        } else if (item.type === 'agent') {
            // Navigate to agent details or map (if implemented)
            // For now, maybe map if they have status? Or agents list filtered?
            // Let's go to Agents page for now, ideally we'd have /agents/:id
            navigate(`/agents?id=${item.id}`);
        } else if (item.type === 'call') {
            // Navigate to Calls page with call_id filter or straight to details if we had a route
            // SipCalls supports query params now?? No, filters from analytics use call_id?
            // The analytics drilldown used ?emotion=... 
            // SipCalls page filters by call_id too? We should check SipCalls.tsx.
            // Assuming we can pass call_id param roughly like ?callId=...
            // Or just search string in the main search bar?
            navigate(`/calls?search=${item.id}`);
        }
        onOpenChange(false);
    };

    const renderItem = (item: SearchResult & { category: string }, index: number) => {
        const isSelected = index === selectedIndex;
        return (
            <motion.li
                layout
                key={`${item.type}-${item.id}`}
                className={classNames('search-result-item', { 'selected': isSelected })}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
            >
                <div className="icon-wrapper">
                    {item.type === 'nav' ? <Command size={18} /> : item.type === 'agent' ? <Users size={18} /> : <Phone size={18} />}
                </div>
                <div className="info">
                    <div className="title">{item.title}</div>
                    <div className="subtitle">{item.subtitle}</div>
                </div>
                {isSelected && <ArrowRight size={16} className="enter-icon" />}
            </motion.li>
        );
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <AnimatePresence>
                {open && (
                    <Dialog.Portal forceMount>
                        <Dialog.Overlay asChild>
                            <motion.div
                                className="global-search-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            />
                        </Dialog.Overlay>
                        <Dialog.Content asChild>
                            <motion.div
                                className="global-search-content"
                                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            >
                                <div className="search-header">
                                    <Search className="search-icon" size={20} />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Search agents, calls, transcripts..."
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        className="search-input"
                                        autoFocus
                                    />
                                    <div className="command-hint">
                                        <kbd>ESC</kbd>
                                    </div>
                                </div>

                                {(flatResults.length > 0 || loading || query) && (
                                    <div className="search-results-container">
                                        {loading && (
                                            <div className="search-loading">
                                                <Loader2 className="animate-spin" size={20} />
                                                <span>Searching...</span>
                                            </div>
                                        )}

                                        {!loading && flatResults.length === 0 && query.length >= 2 && (
                                            <div className="search-empty">
                                                No results found for "{query}"
                                            </div>
                                        )}

                                        {!loading && flatResults.length > 0 && (
                                            <ul className="search-results-list">
                                                {results.navs.length > 0 && (
                                                    <div className="category-header">Navigation</div>
                                                )}
                                                {results.navs.map((r, i) => renderItem({ ...r, category: 'Navigation' }, i))}

                                                {results.agents.length > 0 && (
                                                    <div className="category-header">Agents</div>
                                                )}
                                                {results.agents.map((r, i) => renderItem({ ...r, category: 'Agents' }, i + results.navs.length))}

                                                {results.calls.length > 0 && (
                                                    <div className="category-header">Calls</div>
                                                )}
                                                {results.calls.map((r, i) => renderItem({ ...r, category: 'Calls' }, i + results.navs.length + results.agents.length))}
                                            </ul>
                                        )}
                                    </div>
                                )}

                                <div className="search-footer">
                                    <div className="footer-item">
                                        <Command size={14} /> <span>Search is in beta</span>
                                    </div>
                                    <div className="footer-item">
                                        Use <kbd className="footer-kbd">↑</kbd> <kbd className="footer-kbd">↓</kbd> to navigate, <kbd className="footer-kbd">↵</kbd> to select
                                    </div>
                                </div>
                            </motion.div>
                        </Dialog.Content>
                    </Dialog.Portal>
                )}
            </AnimatePresence>

            <style>{`
                .global-search-overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 100;
                }
                .global-search-content {
                    position: fixed; top: 10%; left: 50%; translate: -50% 0;
                    width: 90%; max-width: 600px;
                    background: white; border-radius: 12px;
                    box-shadow: 0 20px 50px -12px rgba(0,0,0,0.25);
                    z-index: 101; display: flex; flex-direction: column;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .search-header {
                    display: flex; align-items: center; padding: 16px;
                    border-bottom: 1px solid #e2e8f0;
                }
                .search-icon { color: #94a3b8; margin-right: 12px; }
                .search-input {
                    flex: 1; border: none; outline: none; font-size: 16px;
                    background: transparent; color: #1e293b;
                }
                .command-hint kbd {
                    background: #f1f5f9; padding: 2px 6px; border-radius: 4px;
                    font-size: 11px; color: #64748b; font-family: monospace;
                    border: 1px solid #cbd5e1;
                }
                .search-results-container {
                    max-height: 400px; overflow-y: auto; padding: 8px 0;
                }
                .search-loading, .search-empty {
                    padding: 32px; text-align: center; color: #64748b;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                }
                .category-header {
                    padding: 8px 16px 4px; font-size: 11px; font-weight: 600;
                    text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;
                }
                .search-results-list { list-style: none; margin: 0; padding: 0; }
                .search-result-item {
                    display: flex; align-items: center; padding: 10px 16px;
                    cursor: pointer; position: relative;
                }
                .search-result-item.selected {
                    background: #f1f5f9;
                }
                .search-result-item .icon-wrapper {
                    width: 32px; height: 32px; border-radius: 6px;
                    background: #e2e8f0; color: #475569;
                    display: flex; align-items: center; justify-content: center;
                    margin-right: 12px;
                }
                .search-result-item.selected .icon-wrapper {
                    background: #3b82f6; color: white;
                }
                .search-result-item .info { flex: 1; }
                .search-result-item .title { font-size: 14px; font-weight: 500; color: #0f172a; }
                .search-result-item .subtitle { font-size: 12px; color: #64748b; }
                .enter-icon { color: #94a3b8; }
                
                .search-footer {
                    padding: 8px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0;
                    display: flex; justify-content: space-between; align-items: center;
                    color: #94a3b8; font-size: 11px;
                }
                .footer-item { display: flex; align-items: center; gap: 6px; }
                .footer-kbd {
                    background: white; border: 1px solid #cbd5e1;
                    padding: 1px 4px; border-radius: 3px;
                }
            `}</style>
        </Dialog.Root>
    );
};
