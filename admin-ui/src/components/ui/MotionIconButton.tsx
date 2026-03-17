import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import classNames from 'classnames';

interface MotionIconButtonProps extends HTMLMotionProps<'button'> {
    size?: 'sm' | 'md' | 'lg';
    variant?: 'ghost' | 'glass';
    tooltip?: string;
}

/**
 * Lightweight icon-only button with snappy spring animation.
 * Designed for toolbar/action buttons where icon-only interaction is common.
 * Stiffer spring than MotionButton for a more responsive feel.
 */
export const MotionIconButton: React.FC<MotionIconButtonProps> = ({
    children,
    className,
    size = 'md',
    variant = 'ghost',
    tooltip,
    whileHover,
    whileTap,
    ...props
}) => {
    const sizeMap = {
        sm: 28,
        md: 34,
        lg: 42,
    };
    const iconSizeMap = {
        sm: 14,
        md: 18,
        lg: 22,
    };

    const px = sizeMap[size];
    const iconPx = iconSizeMap[size];

    const compClassName = classNames(
        'motion-icon-btn',
        `motion-icon-btn-${variant}`,
        className
    );

    return (
        <motion.button
            className={compClassName}
            title={tooltip}
            whileHover={whileHover || { scale: 1.08 }}
            whileTap={whileTap || { scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            style={{
                width: px,
                height: px,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontSize: iconPx,
                lineHeight: 1,
            }}
            {...props}
        >
            {children}
        </motion.button>
    );
};
