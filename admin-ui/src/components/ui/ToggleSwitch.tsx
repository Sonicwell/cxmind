import React from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import { motion } from 'framer-motion';
import { SoundService } from '../../services/audio/SoundService';

interface ToggleSwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label?: string;
    size?: 'sm' | 'md';
    variant?: 'default' | 'success';
    className?: string;
    soundEnabled?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
    checked,
    onCheckedChange,
    label,
    size = 'md',
    variant = 'default',
    className,
    soundEnabled = true,
}) => {
    const isSm = size === 'sm';
    const trackWidth = isSm ? 36 : 44;
    const trackHeight = isSm ? 20 : 24;
    const thumbSize = isSm ? 14 : 16;
    const thumbPad = isSm ? 3 : 4;
    const thumbTravel = trackWidth - thumbSize - thumbPad * 2;

    const trackColor = checked
        ? (variant === 'success' ? '#16a34a' : 'hsl(var(--primary-hue, 230), 70%, 50%)')
        : '#374151';

    const handleChange = (newChecked: boolean) => {
        if (soundEnabled) {
            SoundService.getInstance().play('toggle');
        }
        onCheckedChange(newChecked);
    };

    return (
        <div className={`toggle-switch-wrapper ${className || ''}`}>
            {label && (
                <label className="toggle-switch-label">{label}</label>
            )}
            <RadixSwitch.Root
                checked={checked}
                onCheckedChange={handleChange}
                className="toggle-switch-root"
                style={{
                    width: trackWidth,
                    height: trackHeight,
                    backgroundColor: trackColor,
                    borderRadius: 9999,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                }}
            >
                <RadixSwitch.Thumb asChild>
                    <motion.span
                        className="toggle-switch-thumb"
                        style={{
                            display: 'block',
                            width: thumbSize,
                            height: thumbSize,
                            backgroundColor: 'white',
                            borderRadius: 9999,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }}
                        animate={{ x: checked ? thumbTravel + thumbPad : thumbPad }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                </RadixSwitch.Thumb>
            </RadixSwitch.Root>
        </div>
    );
};
