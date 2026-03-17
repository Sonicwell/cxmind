import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion } from 'framer-motion';

export interface DropdownMenuItem {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
}

interface DropdownMenuProps {
    trigger: React.ReactNode;
    items: DropdownMenuItem[];
    align?: 'start' | 'end';
    sideOffset?: number;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
    trigger,
    items,
    align = 'end',
    sideOffset = 6,
}) => {
    const [open, setOpen] = React.useState(false);

    return (
        <RadixDropdownMenu.Root open={open} onOpenChange={setOpen}>
            <RadixDropdownMenu.Trigger asChild>
                {trigger}
            </RadixDropdownMenu.Trigger>

            <AnimatePresence>
                {open && (
                    <RadixDropdownMenu.Portal forceMount>
                        <RadixDropdownMenu.Content
                            asChild
                            align={align}
                            sideOffset={sideOffset}
                        >
                            <motion.div
                                className="glass-dropdown"
                                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                                transition={{ type: 'spring', duration: 0.25, bounce: 0.15 }}
                            >
                                {items.map((item, idx) => (
                                    <RadixDropdownMenu.Item
                                        key={idx}
                                        className="glass-dropdown-item"
                                        onSelect={item.onClick}
                                    >
                                        {item.icon && (
                                            <span className="glass-dropdown-icon">{item.icon}</span>
                                        )}
                                        {item.label}
                                    </RadixDropdownMenu.Item>
                                ))}
                            </motion.div>
                        </RadixDropdownMenu.Content>
                    </RadixDropdownMenu.Portal>
                )}
            </AnimatePresence>
        </RadixDropdownMenu.Root>
    );
};
