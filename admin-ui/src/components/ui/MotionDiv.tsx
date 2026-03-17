import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

export interface MotionDivProps extends HTMLMotionProps<'div'> {
    className?: string;
    children?: React.ReactNode;
    delay?: number;
}

export const MotionDiv: React.FC<MotionDivProps> = ({
    children,
    className = '',
    initial = { opacity: 0, scale: 0.95 },
    animate = { opacity: 1, scale: 1 },
    exit = { opacity: 0, scale: 0.95 },
    transition = { duration: 0.2 },
    delay,
    ...props
}) => {
    const finalTransition = delay ? { ...transition, delay } : transition;
    return (
        <motion.div
            className={className}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={finalTransition}
            {...props}
        >
            {children}
        </motion.div>
    );
};
