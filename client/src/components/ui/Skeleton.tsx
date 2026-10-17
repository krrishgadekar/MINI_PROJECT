import type { HTMLAttributes, CSSProperties } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rectangular" | "circular";
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  variant = "rectangular",
  width,
  height,
  className = "",
  style,
  ...props
}: SkeletonProps) {
  const variantClass =
    variant === "text"
      ? "ui-skeleton--text"
      : variant === "circular"
      ? "ui-skeleton--circle"
      : "ui-skeleton--rect";

  const customStyle: CSSProperties = {
    ...style,
    ...(width !== undefined ? { width: typeof width === "number" ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : {}),
  };

  return (
    <div
      className={`ui-skeleton ${variantClass} ${className}`}
      style={customStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

export default Skeleton;
