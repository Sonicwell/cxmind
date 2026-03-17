import React from 'react';

interface AvatarInitialsProps {
    /** Display name to generate initials from */
    name: string;
    /** Avatar image URL — if provided, renders <img> instead of SVG */
    src?: string | null;
    /** Size in pixels (default: 36) */
    size?: number;
    /** Additional CSS class */
    className?: string;
}

/**
 * Generate a stable color from a string via simple hash.
 * Returns an HSL color with consistent saturation and lightness.
 */
function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 52%)`;
}

/** Extract up to 2 initials from a name */
function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * A pure-frontend avatar component.
 * Shows an uploaded image if `src` is provided, otherwise renders
 * an inline SVG with the user's initials and a stable color.
 */
const AvatarInitials: React.FC<AvatarInitialsProps> = ({
    name,
    src,
    size = 36,
    className = '',
}) => {
    const [hasError, setHasError] = React.useState(false);

    // Reset error state if a new URL is passed in
    React.useEffect(() => {
        setHasError(false);
    }, [src]);

    if (src && !hasError) {
        return (
            <img
                src={src}
                alt={name}
                onError={() => setHasError(true)}
                className={`avatar-initials ${className}`}
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                }}
            />
        );
    }

    const initials = getInitials(name || '?');
    const bgColor = hashColor(name || 'default');
    const fontSize = Math.max(size * 0.38, 10);

    return (
        <svg
            className={`avatar-initials ${className}`}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ flexShrink: 0 }}
        >
            <circle cx={size / 2} cy={size / 2} r={size / 2} fill={bgColor} />
            <text
                x="50%"
                y="50%"
                dy=".1em"
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={fontSize}
                fontWeight={600}
                fontFamily="Inter, system-ui, -apple-system, sans-serif"
            >
                {initials}
            </text>
        </svg>
    );
};

export default AvatarInitials;
