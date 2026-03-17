import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MotionButton } from './MotionButton';
import classNames from 'classnames';

interface GlassModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    description?: string;
    style?: React.CSSProperties;
    preventClose?: boolean; // 简单拦截: 阻止点击外部/按ESC关闭
    onCloseAttempt?: () => void; // 脏检查: ESC/外部点击/X 按钮走此回调，由外层决定是否关闭
    isDirty?: boolean; // 配合 onCloseAttempt: 只有 dirty 时才拦截，clean 时放行Radix原生关闭
}

export const GlassModal: React.FC<GlassModalProps> = ({
    open,
    onOpenChange,
    title,
    children,
    className,
    description,
    style: customStyle,
    preventClose,
    onCloseAttempt,
    isDirty
}) => {
    // 仅在 dirty 时拦截关闭 → 触发二次确认; clean 时放行 Radix 原生关闭
    const handleDismiss = (e: { preventDefault: () => void }) => {
        if (onCloseAttempt && isDirty) {
            e.preventDefault();
            onCloseAttempt();
        } else if (preventClose) {
            e.preventDefault();
        }
        // clean + onCloseAttempt: 不调用 preventDefault → Radix 原生关闭
    };
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <AnimatePresence>
                {open && (
                    <Dialog.Portal forceMount>
                        {/* Overlay: covers full screen with dark backdrop */}
                        <Dialog.Overlay asChild>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                style={{
                                    position: 'fixed',
                                    inset: 0,
                                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                    backdropFilter: 'blur(4px)',
                                    WebkitBackdropFilter: 'blur(4px)',
                                    zIndex: 50,
                                }}
                            />
                        </Dialog.Overlay>

                        {/* Content: flexbox-centered wrapper + animated card */}
                        <Dialog.Content
                            asChild
                            onInteractOutside={handleDismiss}
                            onEscapeKeyDown={handleDismiss}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }}
                                style={{
                                    position: 'fixed',
                                    inset: 0,
                                    zIndex: 51,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    pointerEvents: 'none',
                                }}
                            >
                                <div
                                    className={classNames('glass-modal-card', className)}
                                    style={{ pointerEvents: 'auto', ...customStyle }}
                                >
                                    <div className="glass-modal-header">
                                        <Dialog.Title className="glass-modal-title">
                                            {title}
                                        </Dialog.Title>
                                        {onCloseAttempt && isDirty ? (
                                            <MotionButton
                                                variant="ghost"
                                                size="icon"
                                                className="glass-modal-close"
                                                aria-label="Close"
                                                onClick={onCloseAttempt}
                                            >
                                                <X size={20} />
                                            </MotionButton>
                                        ) : (
                                            <Dialog.Close asChild>
                                                <MotionButton
                                                    variant="ghost"
                                                    size="icon"
                                                    className="glass-modal-close"
                                                    aria-label="Close"
                                                >
                                                    <X size={20} />
                                                </MotionButton>
                                            </Dialog.Close>
                                        )}
                                    </div>

                                    {description ? (
                                        <Dialog.Description className="glass-modal-description">
                                            {description}
                                        </Dialog.Description>
                                    ) : (
                                        <Dialog.Description className="sr-only">
                                            {typeof title === 'string' ? title : 'Dialog'}
                                        </Dialog.Description>
                                    )}

                                    <div className="glass-modal-body">
                                        {children}
                                    </div>
                                </div>
                            </motion.div>
                        </Dialog.Content>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    );
};
