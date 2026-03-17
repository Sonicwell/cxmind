import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ShieldCheck, Sparkles, MessageSquare } from 'lucide-react';
import { type ChecklistItem } from '../types';
import { useTranslation } from 'react-i18next';

interface ComplianceListProps {
    items: ChecklistItem[];
    completedItems: string[];
    collapsible?: boolean;
    defaultCollapsed?: boolean;
}

export const ComplianceList: React.FC<ComplianceListProps> = ({
    items, completedItems, collapsible = false, defaultCollapsed = false
}) => {
    const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
    const [showHint, setShowHint] = React.useState<string | null>(null);
    const { t } = useTranslation();
    const progress = items.length > 0 ? (completedItems.length / items.length) * 100 : 0;
    const isAllCompleted = items.length > 0 && completedItems.length === items.length;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10,
            background: 'var(--glass-bg)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--glass-border)',
        }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: collapsible ? 'pointer' : 'default', userSelect: 'none',
                }}
                onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={16} style={{ color: isAllCompleted ? 'var(--success, #22c55e)' : 'var(--text-muted, #9ca3af)' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary, #1f2937)', opacity: 0.85 }}>{t('compliance.title')}</span>
                    {collapsible && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 2 }}>
                            {collapsed ? '▸' : '▾'}
                        </span>
                    )}
                </div>
                <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted, #9ca3af)' }}>
                    {completedItems.length}/{items.length}
                </span>
            </div>

            {/* Progress Bar */}
            <div style={{ height: 3, width: '100%', background: 'var(--glass-highlight)', borderRadius: 4, overflow: 'hidden' }}>
                <motion.div
                    style={{ height: '100%', background: 'var(--success, #22c55e)', borderRadius: 4 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                />
            </div>

            {/* All done 庆祝 */}
            <AnimatePresence>
                {isAllCompleted && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6,
                            border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)',
                        }}
                    >
                        <motion.div animate={{ rotate: [0, -15, 15, -10, 10, 0] }} transition={{ duration: 0.6, delay: 0.2 }}>
                            <Sparkles size={14} style={{ color: 'var(--success, #22c55e)' }} />
                        </motion.div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--success, #22c55e)' }}>{t('compliance.allClear')}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Checklist Items */}
            {!collapsed && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                    {items.map((item) => {
                        const isCompleted = completedItems.includes(item.id);

                        return (
                            <div
                                key={item.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
                                    position: 'relative',
                                    background: isCompleted ? 'rgba(34,197,94,0.06)' : 'transparent',
                                    border: `1px solid ${isCompleted ? 'rgba(34,197,94,0.15)' : 'transparent'}`,
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={() => !isCompleted && item.hint && setShowHint(item.id)}
                                onMouseLeave={() => setShowHint(null)}
                            >
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                                    <AnimatePresence mode='wait'>
                                        {isCompleted ? (
                                            <motion.div
                                                key="checked"
                                                initial={{ scale: 0, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                exit={{ scale: 0, opacity: 0 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                            >
                                                <CheckCircle2 size={16} style={{ color: 'var(--success, #22c55e)' }} />
                                            </motion.div>
                                        ) : (
                                            <motion.div key="unchecked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <Circle size={16} style={{ color: 'var(--text-muted)' }} />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <span style={{
                                    fontSize: '0.72rem',
                                    color: isCompleted ? 'var(--text-primary, #1f2937)' : 'var(--text-muted, #9ca3af)',
                                    fontWeight: isCompleted ? 500 : 400,
                                }}>
                                    {item.text}
                                </span>

                                {/* Hover hint */}
                                <AnimatePresence>
                                    {showHint === item.id && item.hint && !isCompleted && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 4 }}
                                            transition={{ duration: 0.15 }}
                                            style={{
                                                position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 10,
                                                padding: '4px 8px', borderRadius: 6,
                                                border: '1px solid var(--glass-border)',
                                                background: 'var(--bg-card)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                minWidth: 180,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                                <MessageSquare size={12} style={{ color: 'var(--primary, #6366f1)', marginTop: 2, flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>{item.hint}</span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
