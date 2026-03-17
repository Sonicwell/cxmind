import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../styles/widget-info-tooltip.css';

export interface WidgetInfoData {
    /** i18n key for description, or raw string */
    descriptionKey: string;
    /** i18n key for data source, or raw string */
    sourceKey: string;
    /** i18n key for calculation method, or raw string */
    calculationKey: string;
}

interface WidgetInfoTooltipProps {
    info: WidgetInfoData;
    /** Override position style if needed */
    style?: React.CSSProperties;
    /** If true, renders inline with text rather than absolutely positioned */
    inline?: boolean;
}

/**
 * ℹ️ Info tooltip for dashboard widgets.
 * Appears on hover/click, shows description, source, and calculation.
 */
const WidgetInfoTooltip: React.FC<WidgetInfoTooltipProps> = ({ info, style, inline }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
    const ref = useRef<HTMLSpanElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Smart positioning using viewport coordinates to defeat all clipping
    const updatePosition = () => {
        if (!open || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();

        let top = rect.bottom + 8;
        let left: number | 'auto' = 'auto';
        let right: number | 'auto' = 'auto';

        // align based on screen position
        if (rect.left < window.innerWidth / 2) {
            // align to left edge
            left = rect.left;
        } else {
            // align to right edge
            right = window.innerWidth - rect.right;
        }

        setPopoverStyle({
            position: 'fixed',
            top,
            ...(left !== 'auto' ? { left } : { left: 'auto' }),
            ...(right !== 'auto' ? { right } : { right: 'auto' }),
            zIndex: 999999, // Defeat sidebar and all other stacking contexts
        });
    };

    useLayoutEffect(() => {
        updatePosition();
    }, [open]);

    // Close on outside click, scroll, resize
    useEffect(() => {
        if (!open) return;
        const handleScrollOrResize = () => setOpen(false);
        const handleOutsideClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (ref.current?.contains(target)) return;
            if (popoverRef.current?.contains(target)) return;
            setOpen(false);
        };

        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        document.addEventListener('mousedown', handleOutsideClick);
        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [open]);

    // Resolve i18n: if key looks like a translation key (contains '.'), translate it; otherwise use raw
    const resolve = (key: string) => {
        if (key.includes('.')) {
            const translated = t(key);
            return translated !== key ? translated : key;
        }
        return key;
    };

    return (
        <span
            ref={ref}
            className={`widget-info-container ${inline ? 'inline-mode' : ''}`}
            style={inline ? { ...style } : { position: 'absolute', top: 6, right: 6, ...style }}
        >
            <button
                className="widget-info-trigger"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
                onMouseEnter={() => setOpen(true)}
                aria-expanded={open}
                aria-label="Widget info"
                title=""
                style={{
                    minWidth: '28px',
                    minHeight: '28px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Info size={14} />
            </button>
            {open && createPortal(
                <div
                    ref={popoverRef}
                    className="widget-info-popover"
                    style={popoverStyle}
                    onMouseLeave={() => setOpen(false)}
                >
                    <div className="widget-info-row">
                        <span className="info-icon">📖</span>
                        <span className="info-text">{resolve(info.descriptionKey)}</span>
                    </div>
                    <div className="widget-info-row">
                        <span className="info-icon">📡</span>
                        <span className="info-text">{resolve(info.sourceKey)}</span>
                    </div>
                    <div className="widget-info-row">
                        <span className="info-icon">🧮</span>
                        <span className="info-text">{resolve(info.calculationKey)}</span>
                    </div>
                </div>,
                document.body
            )}
        </span>
    );
};

export const WidgetInfoInjector: React.FC<{ info: WidgetInfoData }> = ({ info }) => {
    const parentRef = useRef<HTMLSpanElement>(null);
    const [target, setTarget] = useState<Element | null>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

    useLayoutEffect(() => {
        let observer: MutationObserver | null = null;

        const tryFindTarget = () => {
            const wrapper = parentRef.current?.closest('.widget-wrapper, .stat-card, .audit-stat-card, .bento-cell');
            if (wrapper) {
                // Find a suitable title element. Includes headers from custom widgets.
                const h = wrapper.querySelector('h1, h2, h3, h4, .widget-title, .stat-card-title, .live-header h3, .analytics-kpi-label, .title');
                if (h) {
                    setTarget(h);
                    if (observer) observer.disconnect();
                    return true;
                }
            }
            return false;
        };

        if (!tryFindTarget()) {
            const wrapper = parentRef.current?.closest('.widget-wrapper, .stat-card, .audit-stat-card, .bento-cell');
            if (wrapper) {
                observer = new MutationObserver(() => {
                    tryFindTarget();
                });
                observer.observe(wrapper, { childList: true, subtree: true });
            } else {
                // Fallback if wrapper itself is delayed
                setTimeout(tryFindTarget, 100);
                setTimeout(tryFindTarget, 500);
            }
        }

        return () => observer?.disconnect();
    }, []);

    useLayoutEffect(() => {
        if (!target) return;

        let container = target.querySelector(':scope > .widget-info-portal-target') as HTMLElement | null;
        if (!container) {
            container = document.createElement('span');
            container.className = 'widget-info-portal-target';
            target.appendChild(container);
        }
        setPortalContainer(container);

        return () => {
            if (container && container.parentNode === target) {
                target.removeChild(container);
            }
            setPortalContainer(null);
        };
    }, [target]);

    if (target) {
        if (!portalContainer) return null;
        return createPortal(<WidgetInfoTooltip inline info={info} />, portalContainer);
    }

    return (
        <span ref={parentRef}>
            <WidgetInfoTooltip info={info} />
        </span>
    );
};

export default WidgetInfoTooltip;
