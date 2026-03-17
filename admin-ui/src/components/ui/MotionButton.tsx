import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { SoundService } from '../../services/audio/SoundService';
import { buttonVariants } from './button';
import { cn } from '../../utils/cn';

interface MotionButtonProps extends HTMLMotionProps<'button'> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'default' | 'destructive' | 'outline' | 'link';
    size?: 'sm' | 'md' | 'lg' | 'icon' | 'default';
    soundEnabled?: boolean;
}

export const MotionButton: React.FC<MotionButtonProps> = ({
    children,
    className,
    onClick,
    onMouseEnter,
    variant = 'primary',
    size = 'md',
    soundEnabled = true,
    whileHover,
    whileTap,
    ...props
}) => {
    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (soundEnabled) {
            SoundService.getInstance().play('hover');
        }
        onMouseEnter?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (soundEnabled) {
            SoundService.getInstance().play('click');
        }
        onClick?.(e);
    };

    const mapVariant = (v: string) => {
        if (v === 'primary') return 'default';
        if (v === 'danger') return 'destructive';
        return v as any;
    };

    const mapSize = (s: string) => {
        if (s === 'md') return 'default';
        return s as any;
    };

    // Clean up any legacy btn classes that might be passed manually
    const cleanClassName = className?.replace(/\b(btn|btn-primary|btn-secondary|btn-danger|btn-ghost|action-btn|btn-sm|btn-icon|btn-outline)\b/g, '').trim();

    const compClassName = cn(
        buttonVariants({ variant: mapVariant(variant), size: mapSize(size) }),
        cleanClassName
    );

    return (
        <motion.button
            className={compClassName}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            whileHover={whileHover || { scale: 1.02 }}
            whileTap={whileTap || { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            {...props}
        >
            {children}
        </motion.button>
    );
};
