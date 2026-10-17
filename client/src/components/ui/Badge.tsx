import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant = "primary" | "success" | "warning" | "danger" | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({
  variant = "primary",
  children,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`} {...props}>
      {children}
    </span>
  );
}

export default Badge;
