import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { GripVertical, X, Send } from 'lucide-react';
import type { WidgetDef, DashboardView } from './types';
import { WidgetInfoInjector } from '../components/ui/WidgetInfoTooltip';

interface WidgetWrapperProps {
    def: WidgetDef;
    editMode: boolean;
    onRemove: (id: string) => void;
    children: React.ReactNode;
    /** All views (for send-to-view) */
    views?: DashboardView[];
    /** Current view ID (to exclude from send targets) */
    currentViewId?: string;
    /** Callback to send widget to another view */
    onSendToView?: (widgetId: string, targetViewId: string) => void;
}

const WidgetWrapper: React.FC<WidgetWrapperProps> = ({
    def, editMode, onRemove, children,
    views, currentViewId, onSendToView,
}) => {
    const { t } = useTranslation();
    const [sendOpen, setSendOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

    // 计算 popover 绝对定位坐标（基于触发按钮）
    useEffect(() => {
        if (!sendOpen || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setPopoverPos({ top: rect.bottom + 4, left: rect.right });
    }, [sendOpen]);

    // 点击外部关闭 popover
    useEffect(() => {
        if (!sendOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (popoverRef.current?.contains(target)) return;
            setSendOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [sendOpen]);

    const sendTargets = (views || []).filter(v =>
        v.id !== currentViewId && !v.widgetIds.includes(def.id)
    );

    // Portal popover 渲染到 body，彻底避免 overflow/z-index 问题
    const popoverPortal = sendOpen && popoverPos ? createPortal(
        <div
            ref={popoverRef}
            className="send-to-view-popover glass-panel"
            style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, transform: 'translateX(-100%)' }}
            onClick={e => e.stopPropagation()}
        >
            <div className="send-popover-title">{t('dashboard.toolbar.sendTo', 'Send to...')}</div>
            {sendTargets.map(v => (
                <button
                    key={v.id}
                    className="send-popover-item"
                    onClick={() => {
                        onSendToView?.(def.id, v.id);
                        setSendOpen(false);
                    }}
                >
                    {v.name}
                </button>
            ))}
        </div>,
        document.body
    ) : null;

    return (
        <div className={`widget-wrapper glass-panel floating-particles ${editMode ? 'edit-mode' : ''} widget-cat-${def.category}`}>
            {editMode && (
                <div className="widget-header">
                    <span className="widget-drag-handle">
                        <GripVertical size={14} />
                    </span>
                    <span className="widget-header-title">{t(def.nameKey || '', def.name)}</span>
                    <div className="widget-header-actions">
                        {onSendToView && sendTargets.length > 0 && (
                            <button
                                ref={triggerRef}
                                className="widget-action-btn"
                                onClick={(e) => { e.stopPropagation(); setSendOpen(!sendOpen); }}
                                title={t('dashboard.toolbar.sendToView', 'Send to view...')}
                            >
                                <Send size={12} />
                            </button>
                        )}
                        <button
                            className="widget-remove-btn"
                            onClick={(e) => { e.stopPropagation(); onRemove(def.id); }}
                            title={t('dashboard.toolbar.removeWidget', 'Remove widget')}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}
            {def.info && <WidgetInfoInjector info={def.info} />}
            <div className={`widget-body ${editMode ? 'has-header' : ''}`}>
                {children}
            </div>
            {popoverPortal}
        </div>
    );
};

export default WidgetWrapper;

