import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import '../../styles/qi-confirm-dialog.css';

import { Button } from '../ui/button';

interface QIConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
}

const QIConfirmDialog: React.FC<QIConfirmDialogProps> = ({
    open, title, message, confirmLabel, cancelLabel, variant = 'danger', onConfirm, onCancel
}) => {
    const { t } = useTranslation();

    if (!open) return null;

    return (
        <>
            <div className="qi-confirm-backdrop" onClick={onCancel} />
            <div className="qi-confirm-dialog" role="alertdialog" aria-labelledby="qi-confirm-title">
                <div className="qi-confirm-header">
                    <div className="qi-confirm-icon-wrap">
                        <AlertTriangle size={20} className={`qi-confirm-icon qi-confirm-icon-${variant}`} />
                    </div>
                    <Button className="qi-confirm-close" onClick={onCancel} aria-label="Close">
                        <X size={16} />
                    </Button>
                </div>
                <h3 id="qi-confirm-title" className="qi-confirm-title">{title}</h3>
                <p className="qi-confirm-message">{message}</p>
                <div className="qi-confirm-actions">
                    <Button className="qi-" onClick={onCancel}>
                        {cancelLabel || t('quality.rules.cancel')}
                    </Button>
                    <Button className={`qi-btn qi-btn-${variant}`} onClick={onConfirm}>
                        {confirmLabel || t('quality.rules.confirm', 'Confirm')}
                    </Button>
                </div>
            </div>
        </>
    );
};

export default QIConfirmDialog;
