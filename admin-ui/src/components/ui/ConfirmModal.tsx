import React from 'react';
import { GlassModal } from './GlassModal';

import { Button } from './button';

interface ConfirmModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDanger = true
}) => {
    return (
        <GlassModal
            open={open}
            onOpenChange={(v) => { if (!v) onClose(); }}
            title={title}
        >
            <div style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                {description}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <Button
                    onClick={onClose}
                    style={{ padding: '0.5rem 1rem' }}
                >
                    {cancelText}
                </Button>
                <Button
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                    style={{
                        padding: '0.5rem 1rem',
                        background: isDanger ? '#ef4444' : 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px'
                    }}
                >
                    {confirmText}
                </Button>
            </div>
        </GlassModal>
    );
};
