import { useState, useEffect, useCallback } from 'react';

/**
 * ResizeObserver hook - 返回容器实际宽度
 * 使用 callback ref 确保条件渲染的元素也能正确绑定
 */
export function useContainerWidth() {
    const [width, setWidth] = useState(0);
    const [el, setEl] = useState<HTMLElement | null>(null);

    // callback ref: 元素挂载/卸载时触发 re-render
    const ref = useCallback((node: HTMLElement | null) => {
        setEl(node);
    }, []);

    useEffect(() => {
        if (!el) return;

        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        ro.observe(el);
        setWidth(el.getBoundingClientRect().width);

        return () => ro.disconnect();
    }, [el]);

    const isWide = width >= 580;
    const isExtraWide = width >= 880;

    return { ref, width, isWide, isExtraWide };
}
