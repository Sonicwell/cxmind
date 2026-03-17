import React from 'react';
import '../../styles/shared-dashboard.css';

export interface SectionHeaderProps {
    /** Section title */
    title: string;
    /** Icon element */
    icon?: React.ReactNode;
    /** Custom className */
    className?: string;
}

/**
 * Unified section header for Dashboard / Analytics / ROI pages.
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({ title, icon, className }) => {
    return (
        <h2 className={`section-header ${className || ''}`}>
            {icon} {title}
        </h2>
    );
};

export default SectionHeader;
