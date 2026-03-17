import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleWidgetProps {
    title: string;
    icon?: React.ReactNode;
    /** 标题右侧 badge（如 "3/4", "Active"）*/
    badge?: React.ReactNode;
    /** 折叠时显示的摘要（如 "Sarah Johnson · At Risk"）*/
    collapsedHint?: string;
    /** 受控折叠 */
    defaultCollapsed?: boolean;
    /** 数据有更新时触发 pulse */
    pulse?: boolean;
    /** 不可折叠（如 CallStage）*/
    alwaysOpen?: boolean;
    /** grid placement */
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

export const CollapsibleWidget: React.FC<CollapsibleWidgetProps> = ({
    title, icon, badge, collapsedHint, defaultCollapsed = false,
    pulse = false, alwaysOpen = false, className = '', style, children,
}) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed && !alwaysOpen);
    const [showPulse, setShowPulse] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // pulse 动画
    useEffect(() => {
        if (pulse) {
            setShowPulse(true);
            const t = setTimeout(() => setShowPulse(false), 1500);
            return () => clearTimeout(t);
        }
    }, [pulse]);

    const canCollapse = !alwaysOpen;
    const isCollapsed = canCollapse && collapsed;

    return (
        <div
            className={className}
            style={{
                borderRadius: 2,
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(10px)',
                border: '1px solid var(--glass-border)',
                overflow: 'hidden',
                transition: 'box-shadow 0.3s ease',
                ...(showPulse ? { boxShadow: '0 0 0 2px var(--primary, #6366f1)', animation: 'widgetPulse 0.6s ease' } : {}),
                ...style,
            }}
        >
            {/* Header */}
            <div
                onClick={canCollapse ? () => setCollapsed(c => !c) : undefined}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px',
                    cursor: canCollapse ? 'pointer' : 'default',
                    userSelect: 'none',
                    minHeight: 32,
                }}
            >
                {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>}
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary, #1f2937)' }}>
                    {title}
                </span>
                {/* 折叠时显示摘要 */}
                {isCollapsed && collapsedHint && (
                    <span style={{
                        fontSize: '0.68rem', color: 'var(--text-muted, #9ca3af)',
                        marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1,
                    }}>
                        {collapsedHint}
                    </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {badge && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{badge}</span>}
                    {canCollapse && (
                        <span style={{ color: 'var(--text-muted)', opacity: 0.5, display: 'flex' }}>
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </span>
                    )}
                </span>
            </div>

            {/* Content */}
            <div
                ref={contentRef}
                style={{
                    overflow: 'hidden',
                    maxHeight: isCollapsed ? 0 : 2000,
                    opacity: isCollapsed ? 0 : 1,
                    transition: 'max-height 0.25s ease, opacity 0.15s ease',
                    padding: isCollapsed ? '0 12px' : '0 12px 10px',
                }}
            >
                {children}
            </div>
        </div>
    );
};
