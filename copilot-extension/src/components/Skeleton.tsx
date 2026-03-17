
interface SkeletonProps {
    variant?: "text" | "circular" | "rectangular"
    width?: string | number
    height?: string | number
    style?: React.CSSProperties
    className?: string
}

export function Skeleton({
    variant = "text",
    width,
    height,
    style,
    className = ""
}: SkeletonProps) {
    const baseStyle: React.CSSProperties = {
        width: width,
        height: height,
        backgroundColor: "var(--glass-highlight, rgba(0,0,0,0.06))",
        borderRadius: variant === "circular" ? "50%" : "4px",
        ...style
    }

    if (variant === "text") {
        baseStyle.height = height || "1em"
        baseStyle.width = width || "100%"
        baseStyle.marginBottom = "0.5em"
    }

    return (
        <div
            className={`skeleton animate-shimmer ${className}`}
            style={baseStyle}
        />
    )
}
