import React, { useState } from 'react';
import { Download, Loader2, Check } from 'lucide-react';

import { Button } from './ui/button';

interface ExportButtonProps {
    /** Called when user clicks export. Should trigger the CSV download. */
    onExport: () => void;
    /** Label text */
    label?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Size variant */
    size?: 'sm' | 'md';
}

/**
 * Reusable Export button with download icon and brief success feedback.
 */
const ExportButton: React.FC<ExportButtonProps> = ({
    onExport,
    label = 'Export CSV',
    disabled = false,
    size = 'sm',
}) => {
    const [state, setState] = useState<'idle' | 'exporting' | 'done'>('idle');

    const handleClick = () => {
        setState('exporting');
        try {
            onExport();
            setState('done');
            setTimeout(() => setState('idle'), 1500);
        } catch {
            setState('idle');
        }
    };

    const iconSize = size === 'sm' ? 13 : 15;
    const padding = size === 'sm' ? '4px 10px' : '6px 14px';
    const fontSize = size === 'sm' ? '0.78rem' : '0.85rem';

    return (
        <Button className="-outline"
            onClick={handleClick}
            disabled={disabled || state === 'exporting'}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding,
                fontSize,
                borderColor: state === 'done' ? 'hsl(150,60%,40%)' : undefined,
                color: state === 'done' ? 'hsl(150,60%,35%)' : undefined,
                transition: 'all 0.2s',
            }}
            title={label}
        >
            {state === 'exporting' ? (
                <Loader2 size={iconSize} className="spin" />
            ) : state === 'done' ? (
                <Check size={iconSize} />
            ) : (
                <Download size={iconSize} />
            )}
            {state === 'done' ? 'Exported!' : label}
        </Button>
    );
};

export default ExportButton;
