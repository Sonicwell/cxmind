import React from 'react';
import classNames from 'classnames';
import { motion } from 'framer-motion';

interface OrganicCardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'blob' | 'glass';
    children: React.ReactNode;
    delay?: number;
}

export const OrganicCard: React.FC<OrganicCardProps> = ({
    variant = 'default',
    className,
    children,
    delay = 0,
    ...props
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
                delay: delay
            }}
            className={classNames(
                'rounded-2xl p-6 transition-all duration-300',
                {
                    'organic-card': variant === 'blob',
                    'glass-panel': variant === 'glass' || variant === 'default',
                },
                className
            )}
            {...(props as any)}
        >
            {children}
        </motion.div>
    );
};
