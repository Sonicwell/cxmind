import React, { useState } from 'react';
import { Button } from './button';
import { CheckCircle, Plus, Trash2, X } from 'lucide-react';

/**
 * 通用 LLM 建议对比面板
 * 展示 LLM 提取结果 vs 现有项，支持添加建议 + 删除建议
 */
export interface LLMSuggestion {
    term: string;
    confidence: number; // 0.0 - 1.0
    reason?: string;
}

interface LLMSuggestPanelProps {
    suggestions: LLMSuggestion[];
    removals?: LLMSuggestion[];
    existingItems: string[];
    onAdd: (selected: string[]) => void;
    onRemove?: (selected: string[]) => void;
    onClose: () => void;
    title?: string;
}

function confidenceBadge(conf: number) {
    if (conf >= 0.8) return { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: `${Math.round(conf * 100)}%` };
    if (conf >= 0.5) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: `${Math.round(conf * 100)}%` };
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: `${Math.round(conf * 100)}%` };
}

export function LLMSuggestPanel({ suggestions, removals = [], existingItems, onAdd, onRemove, onClose, title = 'LLM Suggestions' }: LLMSuggestPanelProps) {
    const existingSet = new Set(existingItems.map(s => s.trim().toLowerCase()));

    const newSuggestions = suggestions.filter(s => !existingSet.has(s.term.trim().toLowerCase()));
    const existingSuggestions = suggestions.filter(s => existingSet.has(s.term.trim().toLowerCase()));

    const [selected, setSelected] = useState<Set<string>>(() => {
        return new Set(newSuggestions.filter(s => s.confidence >= 0.7).map(s => s.term));
    });

    const [selectedRemovals, setSelectedRemovals] = useState<Set<string>>(() => {
        return new Set(removals.filter(r => r.confidence >= 0.8).map(r => r.term));
    });

    const toggle = (term: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(term)) next.delete(term);
            else next.add(term);
            return next;
        });
    };

    const toggleRemoval = (term: string) => {
        setSelectedRemovals(prev => {
            const next = new Set(prev);
            if (next.has(term)) next.delete(term);
            else next.add(term);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(newSuggestions.map(s => s.term)));
    const selectNone = () => setSelected(new Set());

    const panelStyle: React.CSSProperties = {
        background: 'var(--bg-primary, #fff)',
        border: '1px solid var(--border-primary, #e2e8f0)',
        borderRadius: 10,
        padding: 14,
        maxHeight: 480,
        overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    };

    const sectionTitle: React.CSSProperties = {
        fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)',
        marginBottom: 6, marginTop: 10, display: 'flex', alignItems: 'center', gap: 4,
    };

    const itemStyle = (isSelected: boolean, isDanger = false): React.CSSProperties => ({
        display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap',
        padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
        background: isSelected ? (isDanger ? 'rgba(239,68,68,0.06)' : 'rgba(99,102,241,0.08)') : 'transparent',
        border: `1px solid ${isSelected ? (isDanger ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.3)') : 'transparent'}`,
        transition: 'all 0.15s ease',
    });

    return (
        <div style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>✨ {title}</span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                    <X size={14} />
                </button>
            </div>

            {/* 已覆盖 */}
            {existingSuggestions.length > 0 && (
                <>
                    <div style={sectionTitle}><CheckCircle size={11} color="#10b981" /> Already covered ({existingSuggestions.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                        {existingSuggestions.map(s => (
                            <span key={s.term} style={{
                                fontSize: '0.65rem', padding: '2px 7px',
                                background: 'rgba(16,185,129,0.1)', color: '#10b981',
                                borderRadius: 4, fontWeight: 500,
                            }}>✓ {s.term}</span>
                        ))}
                    </div>
                </>
            )}

            {/* 新建议 */}
            {newSuggestions.length > 0 && (
                <>
                    <div style={{ ...sectionTitle, justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Plus size={11} color="#6366f1" /> Add ({newSuggestions.length})
                        </span>
                        <span style={{ display: 'flex', gap: 6 }}>
                            <button onClick={selectAll} style={{ fontSize: '0.6rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>All</button>
                            <button onClick={selectNone} style={{ fontSize: '0.6rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>None</button>
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {newSuggestions.map(s => {
                            const badge = confidenceBadge(s.confidence);
                            const isSelected = selected.has(s.term);
                            return (
                                <div key={s.term} style={itemStyle(isSelected)} onClick={() => toggle(s.term)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                                        <input type="checkbox" checked={isSelected} onChange={() => toggle(s.term)}
                                            style={{ accentColor: '#6366f1', margin: 0, cursor: 'pointer', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{s.term}</span>
                                        <span style={{
                                            fontSize: '0.6rem', padding: '1px 5px', borderRadius: 3,
                                            background: badge.bg, color: badge.color, fontWeight: 600, flexShrink: 0,
                                        }}>{badge.label}</span>
                                    </div>
                                    {s.reason && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.4, paddingLeft: 22, width: '100%' }}>
                                            {s.reason}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* 删除建议 */}
            {removals.length > 0 && onRemove && (
                <>
                    <div style={{ ...sectionTitle, marginTop: 12 }}>
                        <Trash2 size={11} color="#ef4444" /> Remove ({removals.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {removals.map(r => {
                            const isSelected = selectedRemovals.has(r.term);
                            return (
                                <div key={r.term} style={itemStyle(isSelected, true)} onClick={() => toggleRemoval(r.term)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                                        <input type="checkbox" checked={isSelected} onChange={() => toggleRemoval(r.term)}
                                            style={{ accentColor: '#ef4444', margin: 0, cursor: 'pointer', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#ef4444', flex: 1, textDecoration: isSelected ? 'line-through' : 'none' }}>{r.term}</span>
                                        <span style={{
                                            fontSize: '0.6rem', padding: '1px 5px', borderRadius: 3,
                                            background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600, flexShrink: 0,
                                        }}>{Math.round(r.confidence * 100)}%</span>
                                    </div>
                                    {r.reason && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.4, paddingLeft: 22, width: '100%' }}>
                                            {r.reason}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* 无内容提示 */}
            {newSuggestions.length === 0 && removals.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                    All terms look good — no changes suggested
                </div>
            )}

            {/* 按钮区 */}
            {(newSuggestions.length > 0 || removals.length > 0) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    {newSuggestions.length > 0 && (
                        <Button
                            onClick={() => { onAdd(Array.from(selected)); }}
                            disabled={selected.size === 0}
                            style={{
                                flex: 1, fontSize: '0.72rem', padding: '7px 10px',
                                background: selected.size > 0 ? '#6366f1' : undefined,
                                color: selected.size > 0 ? '#fff' : undefined,
                            }}
                        >
                            <Plus size={12} /> Add ({selected.size})
                        </Button>
                    )}
                    {removals.length > 0 && onRemove && (
                        <Button
                            onClick={() => { onRemove(Array.from(selectedRemovals)); }}
                            disabled={selectedRemovals.size === 0}
                            style={{
                                flex: 1, fontSize: '0.72rem', padding: '7px 10px',
                                background: selectedRemovals.size > 0 ? '#ef4444' : undefined,
                                color: selectedRemovals.size > 0 ? '#fff' : undefined,
                            }}
                        >
                            <Trash2 size={12} /> Remove ({selectedRemovals.size})
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
